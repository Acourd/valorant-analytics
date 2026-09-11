#!/usr/bin/env node
'use strict';

/**
 * data_contract.js — Contrato ÚNICO de datos y procedencia.
 *
 * Todos los comandos/motores deben:
 *   1. Resolver el objetivo por COINCIDENCIA EXACTA (Nombre#TAG normalizado),
 *      sin subcadenas ni fallback al primer jugador. Objetivo ausente/ambiguo
 *      => fail-closed.
 *   2. Distinguir procedencia: `verified_source` (fuente autenticada) frente a
 *      `normalized_input` (datos locales/ficheros) y `synthetic_demo`.
 *   3. Preservar solo campos OBSERVADOS; no fabricar métricas ni conclusiones.
 *      Las causas/fugas y el coaching requieren `verified_source`.
 *
 * Zero dependencias externas.
 */

const PROVENANCE = Object.freeze({
  VERIFIED: 'verified_source',
  NORMALIZED: 'normalized_input',
  SYNTHETIC: 'synthetic_demo'
});

const LABELS = Object.freeze({
  verified_source: 'fuente verificada (origen autenticado)',
  normalized_input: 'datos normalizados locales (NO verificados)',
  synthetic_demo: 'SINTÉTICA --demo (NO es una partida real)'
});

function normalizeHandleKey(handle) {
  return String(handle === undefined || handle === null ? '' : handle).trim().toLowerCase().normalize('NFC');
}

/**
 * Resolución EXACTA de objetivo.
 * @param {string[]} handles  Riot IDs disponibles en la telemetría.
 * @param {string} requested  Riot ID pedido (Nombre#TAG).
 * @param {{allowFirstIfMissing?:boolean}} [options]
 * @returns {string} handle exacto
 * @throws TARGET_NOT_FOUND | TARGET_AMBIGUOUS | TARGET_REQUIRED | ROSTER_EMPTY
 */
function resolveExactHandle(handles, requested, options = {}) {
  const allowFirstIfMissing = options.allowFirstIfMissing !== false;
  const keys = (Array.isArray(handles) ? handles : []).filter(h => typeof h === 'string' && h.trim().length > 0);
  if (keys.length === 0) {
    const err = new Error('Telemetría sin jugadores válidos: no hay objetivo que analizar.');
    err.code = 'ROSTER_EMPTY';
    throw err;
  }
  const wanted = String(requested === undefined || requested === null ? '' : requested).trim();
  if (wanted.length === 0) {
    // Auto-resolución SOLO cuando no se pidió un objetivo explícito.
    if (allowFirstIfMissing) return keys[0];
    const err = new Error('Objetivo no especificado: indica el Riot ID exacto (Nombre#TAG).');
    err.code = 'TARGET_REQUIRED';
    throw err;
  }
  const want = normalizeHandleKey(wanted);
  const exact = keys.filter(h => normalizeHandleKey(h) === want);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const err = new Error(`Objetivo ambiguo: "${wanted}" coincide con ${exact.length} jugadores de la partida.`);
    err.code = 'TARGET_AMBIGUOUS';
    throw err;
  }
  const err = new Error(`Jugador "${wanted}" no encontrado en la partida. Objetivo ausente: no se emite diagnóstico. Candidatos: ${keys.slice(0, 10).join(', ')}`);
  err.code = 'TARGET_NOT_FOUND';
  throw err;
}

/** Procedencia declarada en metadata; por defecto, datos locales normalizados. */
function sourceProvenance(meta) {
  const m = meta || {};
  if (m.synthetic || m.wafContainment) return PROVENANCE.SYNTHETIC;
  if (m.provenance === PROVENANCE.VERIFIED || m.attestation || m.verified === true) return PROVENANCE.VERIFIED;
  return PROVENANCE.NORMALIZED;
}

function provenanceLabel(provenance) {
  return LABELS[provenance] || LABELS.normalized_input;
}

/** Solo una fuente verificada puede afirmar causas/fugas o prescribir coaching. */
function mayAssertCauses(provenance) {
  return provenance === PROVENANCE.VERIFIED;
}

/** Lee un número OBSERVADO de stats (value o displayValue). null si no existe. */
function observedNumber(stats, keys) {
  if (!stats || typeof stats !== 'object') return null;
  for (const k of keys) {
    const cell = stats[k];
    if (cell && typeof cell === 'object') {
      if (cell.value !== undefined && cell.value !== null && Number.isFinite(Number(cell.value))) return Number(cell.value);
      if (cell.displayValue !== undefined && cell.displayValue !== null) {
        const n = Number(String(cell.displayValue).replace('%', '').trim());
        if (Number.isFinite(n)) return n;
      }
    } else if (cell !== undefined && cell !== null && Number.isFinite(Number(cell))) {
      return Number(cell);
    }
  }
  return null;
}

module.exports = {
  PROVENANCE,
  LABELS,
  normalizeHandleKey,
  resolveExactHandle,
  sourceProvenance,
  provenanceLabel,
  mayAssertCauses,
  observedNumber
};
