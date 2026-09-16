#!/usr/bin/env node
'use strict';

/**
 * schema_contract.js — Contrato de esquema VERSIONADO para entradas locales y Riot.
 *
 * Ubicaciones CANÓNICAS de `schemaVersion`:
 *   - Normalizado: `data.metadata.schemaVersion`
 *   - Riot:        `matchInfo.schemaVersion` (la raíz `payload.schemaVersion` solo
 *                  se acepta si coincide; discrepancia => SCHEMA_UNSUPPORTED)
 *
 * - Validación de ESTRUCTURA antes de procesar (fail-closed con código estable).
 * - Versión ausente => formato LEGADO LIMITADO (se procesa lo observable y se
 *   declara la limitación); versión futura/incompatible => `SCHEMA_UNSUPPORTED`.
 * - Campos desconocidos: se ignoran con seguridad y se DECLARAN en diagnóstico,
 *   sin elevar procedencia.
 *
 * Cero dependencias.
 */

const SCHEMA_VERSIONS = Object.freeze({
  NORMALIZED_V1: 1,
  RIOT_V1: 1
});
const MAX_SUPPORTED = 1;
const budgets = require('./resource_budget');

function schemaError(code, message, details = {}) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  return err;
}

function readSchemaVersion(meta) {
  if (!meta || typeof meta !== 'object') return { present: false, value: null };
  if (meta.schemaVersion === undefined || meta.schemaVersion === null) return { present: false, value: null };
  const n = Number(meta.schemaVersion);
  return { present: true, value: Number.isInteger(n) ? n : meta.schemaVersion };
}

function classifySchema(meta) {
  const { present, value } = readSchemaVersion(meta);
  if (!present) {
    return { schemaVersion: null, status: 'legacy_limited', limited: true, note: 'Sin schemaVersion: formato legado limitado (se procesa lo observable; no se inventan campos).' };
  }
  if (!Number.isInteger(value) || value < 1 || value > MAX_SUPPORTED) {
    throw schemaError('SCHEMA_UNSUPPORTED', `schemaVersion incompatible: ${value}. Soportadas: 1 (o ausente = legado limitado).`, { schemaVersion: value, maxSupported: MAX_SUPPORTED });
  }
  return { schemaVersion: value, status: 'supported', limited: false, note: `schemaVersion ${value} soportada.` };
}

const KNOWN_NORMALIZED_META = new Set([
  'matchId', 'mapName', 'modeName', 'rounds', 'timestamp', 'ingestionType',
  'provenance', 'derived', 'missing', 'synthetic', 'wafContainment', 'schemaVersion',
  'ingestionDiagnostics', 'resilientEngine'
]);

function validateNormalizedMatch(matchData) {
  if (!matchData || typeof matchData !== 'object') {
    throw schemaError('SCHEMA_INVALID', 'Entrada normalizada ausente o no es un objeto.', {});
  }
  const data = matchData.data;
  if (!data || typeof data !== 'object' || !Array.isArray(data.segments)) {
    throw schemaError('SCHEMA_INVALID', 'Estructura normalizada inválida: falta data.segments[].', {});
  }
  const meta = data.metadata || {};
  const schema = classifySchema(meta);
  const unknownMetadataFields = Object.keys(meta).filter(k => !KNOWN_NORMALIZED_META.has(k)).slice(0, 32);
  budgets.checkEvents(data.segments.length);
  const summaries = data.segments.filter(s => s && s.type === 'player-summary');
  budgets.checkPlayers(summaries.length);
  if (Number.isFinite(meta.rounds)) budgets.checkRounds(meta.rounds);
  for (const seg of data.segments) {
    if (!seg || typeof seg !== 'object' || typeof seg.type !== 'string' || seg.type.trim() === '') {
      throw schemaError('SCHEMA_INVALID', 'Segmento sin campo type válido.', { segment: seg });
    }
    if (seg.type === 'player-summary' && (seg.stats !== undefined && (seg.stats === null || typeof seg.stats !== 'object'))) {
      throw schemaError('SCHEMA_INVALID', 'player-summary con stats no objeto.', { segment: seg });
    }
  }
  return {
    schema,
    unknownMetadataFields,
    diagnostics: {
      schemaVersion: schema.schemaVersion,
      schemaStatus: schema.status,
      limited: schema.limited,
      unknownMetadataFields,
      note: schema.note
    }
  };
}

const KNOWN_RIOT_KEYS = new Set(['matchInfo', 'players', 'roundResults', 'kills', '_fixture', 'schemaVersion']);

/**
 * Ubicación CANÓNICA de `schemaVersion` para payloads Riot: `matchInfo.schemaVersion`.
 * La raíz (`payload.schemaVersion`) solo se acepta si es coherente con la canónica;
 * cualquier ubicación incompatible o discrepante => SCHEMA_UNSUPPORTED (fail-closed).
 */
function classifyRiotSchema(payload) {
  const isPresent = v => v !== undefined && v !== null;
  const root = payload ? payload.schemaVersion : undefined;
  const matchInfo = payload && payload.matchInfo && typeof payload.matchInfo === 'object' ? payload.matchInfo.schemaVersion : undefined;
  const check = (label, value) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > MAX_SUPPORTED) {
      throw schemaError('SCHEMA_UNSUPPORTED', `schemaVersion incompatible en ${label}: ${value}. Soportadas: 1 (o ausente = legado limitado).`, { location: label, schemaVersion: value, maxSupported: MAX_SUPPORTED });
    }
    return n;
  };
  let canonical = null;
  if (isPresent(root) && isPresent(matchInfo)) {
    const r = check('raíz', root);
    const m = check('matchInfo', matchInfo);
    if (r !== m) {
      throw schemaError('SCHEMA_UNSUPPORTED', `schemaVersion discrepante: raíz=${r} vs matchInfo=${m}. Se rechaza fail-closed.`, { root: r, matchInfo: m });
    }
    canonical = m;
  } else if (isPresent(matchInfo)) {
    canonical = check('matchInfo', matchInfo);
  } else if (isPresent(root)) {
    // La canónica es matchInfo.schemaVersion: una versión SOLO en la raíz no
    // puede verificarse contra ella, así que no se admite como soportada.
    throw schemaError('SCHEMA_UNSUPPORTED', `schemaVersion ${root} presente solo en la raíz sin matchInfo.schemaVersion: no puede coincidir con la ubicación canónica. Se rechaza fail-closed (usa matchInfo.schemaVersion).`, { location: 'raíz sin canónica', schemaVersion: root });
  }
  if (canonical === null) {
    return { schemaVersion: null, status: 'legacy_limited', limited: true, note: 'Sin schemaVersion (canónica: matchInfo.schemaVersion): formato legado limitado; no se inventan campos.' };
  }
  return { schemaVersion: canonical, status: 'supported', limited: false, note: `schemaVersion ${canonical} soportada (canónica: matchInfo.schemaVersion).` };
}

function validateRiotPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw schemaError('SCHEMA_INVALID', 'Payload Riot ausente o no es un objeto.', {});
  }
  const matchInfo = payload.matchInfo;
  if (!matchInfo || typeof matchInfo !== 'object' || typeof matchInfo.matchId !== 'string' || matchInfo.matchId.trim() === '') {
    throw schemaError('SCHEMA_INVALID', 'Payload Riot sin matchInfo.matchId válido.', {});
  }
  if (!Array.isArray(payload.players)) {
    throw schemaError('SCHEMA_INVALID', 'Payload Riot sin players[] válido.', {});
  }
  const schema = classifyRiotSchema(payload);
  const unknownFields = Object.keys(payload).filter(k => !KNOWN_RIOT_KEYS.has(k)).slice(0, 32);
  budgets.checkPlayers(payload.players.length);
  if (Array.isArray(payload.roundResults)) budgets.checkRounds(payload.roundResults.length);
  if (Array.isArray(payload.kills)) budgets.checkArrayItems('kills', payload.kills.length);
  return {
    schema,
    unknownFields,
    diagnostics: {
      schemaVersion: schema.schemaVersion,
      schemaStatus: schema.status,
      limited: schema.limited,
      unknownFields,
      note: schema.note
    }
  };
}

/**
 * Campos mínimos que `plan` necesita por nivel (contrato documentado).
 */
const PLAN_MINIMUM_FIELDS = Object.freeze({
  texto_marcador: ['data.segments[].type=player-summary', 'attributes.platformUserIdentifier o metadata.platformUserHandle', 'stats.* con displayValue o value (kills/deaths/scorePerRound/damagePerRound/headshotsPercentage/kast...)'],
  eventos_por_ronda: ['data.segments[].type=player-round con attributes.round', 'data.segments[].type=player-round-damage con attributes.round', 'opcional: metadata.traded / position / timestamp para aperturas'],
  fuente_verificada: ['Atestación firmada (VAL-MATCH-V1) verificada contra trust store', 'Credenciales Riot RSO (pendientes)']
});

module.exports = {
  SCHEMA_VERSIONS,
  MAX_SUPPORTED,
  classifySchema,
  classifyRiotSchema,
  validateNormalizedMatch,
  validateRiotPayload,
  PLAN_MINIMUM_FIELDS
};
