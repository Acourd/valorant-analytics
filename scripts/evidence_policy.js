#!/usr/bin/env node
'use strict';

/**
 * evidence_policy.js - Política de evidencia COMPARTIDA por el motor, el CLI y
 * el prompt standalone (Gem / Custom GPT).
 *
 * Determina, de forma pura y determinista, QUÉ secciones de salida permite la
 * evidencia disponible y qué datos faltan. Evita forzar fugas, causas tácticas
 * o rutinas biomecánicas cuando no existe base para sostenerlas.
 *
 * Endurecimiento (integridad del esquema): no basta con que exista un array o
 * un objeto. Se exige:
 *   - Rondas: número de ronda entero ≥1 y al menos un campo de evento/detalle.
 *   - Duelos: oponente no vacío y K/D numéricos.
 *   - Zonas de daño: head/body/leg numéricos en [0,100] que sumen 100 (±1).
 *   - Agregados: KD>0, ACS≥0, HS como porcentaje válido [0,100], FK/FD ≥0.
 * Niveles:
 *   - insufficient: sin métricas agregadas válidas → solo nivel de evidencia,
 *     observaciones, límites y datos faltantes.
 *   - aggregate   : agregados válidos pero SIN rondas válidas → radar agregado
 *     y señal MMR (hipótesis). PROHIBIDO: fugas, duelos, rutina.
 *   - complete    : ≥1 ronda válida → habilita fugas (0 a 3). Duelos y rutina
 *     quedan condicionados a evidencia de duelo y mecánica válidas.
 */

const BASE_SECTIONS = ['evidence_level', 'observations', 'limits', 'missing'];
const AGGREGATE_SECTIONS = ['aggregate_radar', 'mmr_signal'];
const ROUND_SECTIONS = ['round_leaks'];
const DUEL_SECTIONS = ['duel_matrix'];
const MECHANICAL_SECTIONS = ['weapon_telemetry', 'aim_routine'];

function toFiniteNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.trim().replace(/%$/, '');
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isPercent(v) {
  const n = toFiniteNum(v);
  return n !== null && n >= 0 && n <= 100;
}

function isNonNegative(v) {
  const n = toFiniteNum(v);
  return n !== null && n >= 0;
}

function isValidRound(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  const n = toFiniteNum(r.n);
  if (n === null || n < 1 || !Number.isInteger(n)) return false;
  return [r.event, r.detail, r.symptom, r.action, r.note]
    .some(x => typeof x === 'string' && x.trim().length > 0);
}

function isValidDuel(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  const opp = d.opponent || d.vs;
  if (typeof opp !== 'string' || opp.trim().length === 0) return false;
  const k = toFiniteNum(d.kills);
  const dd = toFiniteNum(d.deaths);
  if (k === null || dd === null || k < 0 || dd < 0) return false;
  // Un "duelo" sin ninguna kill ni muerte no es evidencia de duelo real.
  return (k + dd) > 0;
}

function isValidWeaponZones(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return false;
  const h = toFiniteNum(w.head);
  const b = toFiniteNum(w.body);
  const l = toFiniteNum(w.leg);
  if (h === null || b === null || l === null) return false;
  if (![h, b, l].every(v => v >= 0 && v <= 100)) return false;
  return Math.abs((h + b + l) - 100) <= 1;
}

function classifyEvidence(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const observed = (src.observed && typeof src.observed === 'object') ? src.observed : {};
  const validKd = toFiniteNum(observed.kd) !== null && toFiniteNum(observed.kd) > 0;
  const validAcs = isNonNegative(observed.acs);
  const validHs = isPercent(observed.hs);
  const validFkFd = isNonNegative(observed.fk) && isNonNegative(observed.fd);
  const hasAggregate = validKd || validAcs || validHs || validFkFd;

  const rounds = Array.isArray(src.rounds) ? src.rounds.filter(isValidRound) : [];
  const duels = Array.isArray(src.duels) ? src.duels.filter(isValidDuel) : [];
  const hasWeaponZones = isValidWeaponZones(src.weaponZones);
  // La evidencia mecánica habilita la rutina: zonas válidas O un HS% válido
  // acompañado de un agregado de impacto (ACS/KD).
  const hasMechanical = hasWeaponZones || (validHs && (validAcs || validKd));

  let level = 'insufficient';
  if (rounds.length > 0) level = 'complete';
  else if (hasAggregate) level = 'aggregate';

  const allowedSections = BASE_SECTIONS.slice();
  if (level === 'aggregate' || level === 'complete') allowedSections.push(...AGGREGATE_SECTIONS);
  if (level === 'complete') allowedSections.push(...ROUND_SECTIONS);
  if (duels.length > 0) allowedSections.push(...DUEL_SECTIONS);
  if (hasMechanical) allowedSections.push(...MECHANICAL_SECTIONS);
  // weapon_telemetry exige zonas reales; HS+ACS solo sostiene la rutina.
  if (!hasWeaponZones) {
    const i = allowedSections.indexOf('weapon_telemetry');
    if (i !== -1) allowedSections.splice(i, 1);
  }

  const allSections = [
    ...BASE_SECTIONS, ...AGGREGATE_SECTIONS, ...ROUND_SECTIONS,
    ...DUEL_SECTIONS, ...MECHANICAL_SECTIONS
  ];
  const forbiddenSections = allSections.filter(s => !allowedSections.includes(s));

  const missing = [];
  if (!hasAggregate) missing.push('metricas_agregadas (KD/ACS/HS)');
  if (!validHs) missing.push('hs (porcentaje valido 0-100)');
  if (!validFkFd) missing.push('first_kills/first_deaths');
  if (rounds.length === 0) missing.push('eventos_por_ronda (numero de ronda + evento)');
  if (duels.length === 0) missing.push('eventos_de_duelo (oponente + K/D)');
  if (!hasWeaponZones) missing.push('zonas_de_dano (head/body/leg sumando 100%)');

  return {
    level,
    allowedSections,
    forbiddenSections,
    maxLeaks: Math.min(3, rounds.length),
    missing,
    hasWeaponZones,
    claimStatus: 'hipotesis_no_verificada',
    notes: 'Secciones permitidas por la evidencia VALIDADA disponible; el resto debe omitirse o declararse como dato faltante. Ninguna inferencia táctica sin evidencia citada.'
  };
}

module.exports = {
  classifyEvidence,
  toFiniteNum,
  isPercent,
  isValidRound,
  isValidDuel,
  isValidWeaponZones,
  BASE_SECTIONS,
  AGGREGATE_SECTIONS,
  ROUND_SECTIONS,
  DUEL_SECTIONS,
  MECHANICAL_SECTIONS
};
