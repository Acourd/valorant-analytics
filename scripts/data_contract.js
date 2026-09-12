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
 * Sin objetivo explícito: solo se auto-selecciona si el roster tiene UN único
 * jugador (no hay elección posible). Con 2+ jugadores exige el Riot ID exacto
 * y devuelve la lista de candidatos en el error (elección confirmable).
 * @param {string[]} handles  Riot IDs disponibles en la telemetría.
 * @param {string} requested  Riot ID pedido (Nombre#TAG).
 * @param {{allowFirstIfMissing?:boolean}} [options]
 * @returns {string} handle exacto
 * @throws TARGET_NOT_FOUND | TARGET_AMBIGUOUS | TARGET_REQUIRED | ROSTER_EMPTY
 */
function resolveExactHandle(handles, requested, options = {}) {
  const allowFirstIfMissing = options.allowFirstIfMissing === true;
  const keys = (Array.isArray(handles) ? handles : []).filter(h => typeof h === 'string' && h.trim().length > 0);
  if (keys.length === 0) {
    const err = new Error('Telemetría sin jugadores válidos: no hay objetivo que analizar.');
    err.code = 'ROSTER_EMPTY';
    throw err;
  }
  const wanted = String(requested === undefined || requested === null ? '' : requested).trim();
  if (wanted.length === 0) {
    // Auto-selección SOLO si no hay ambigüedad (un único jugador).
    if (keys.length === 1) return keys[0];
    if (allowFirstIfMissing) return keys[0];
    const err = new Error(`Objetivo no especificado: la partida contiene ${keys.length} jugadores. Indica el Riot ID exacto (Nombre#TAG). Candidatos: ${keys.slice(0, 10).join(', ')}`);
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

/**
 * Procedencia de datos locales/ficheros: SOLO `synthetic_demo` o
 * `normalized_input`. Los metadatos de un JSON (`attestation`, `provenance`,
 * `verified`, `wafContainment`...) JAMÁS elevan a `verified_source`.
 *
 * `verified_source` es una capacidad interna del adaptador sellado
 * (`evidence_policy.observeVerifiedMatch`), que exige atestación firmada y
 * verificada contra el trust store. Ningún archivo puede autodeclararla.
 */
function sourceProvenance(meta) {
  const m = meta || {};
  if (m.synthetic === true || m.wafContainment === true) return PROVENANCE.SYNTHETIC;
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

/**
 * Detecta contexto temporal/posicional/trade OBSERVADO en los segmentos.
 * Sin timestamps, posiciones o marcas de trade, queda PROHIBIDO emitir reglas
 * de timing/tradeo/posicionamiento (aperturas incluidas).
 */
function detectTemporalContext(matchData) {
  const segments = (matchData && matchData.data && matchData.data.segments) || [];
  const ctx = { timing: false, position: false, trade: false };
  for (const s of segments) {
    const a = s.attributes || {};
    const m = s.metadata || {};
    if (Number.isFinite(Number(a.roundTime)) || Number.isFinite(Number(m.roundTimeMs)) ||
        Number.isFinite(Number(m.timestampMs)) || /T\d{2}:\d{2}/.test(String(m.timestamp || ''))) ctx.timing = true;
    if (m.position || a.position || (Number.isFinite(Number(m.x)) && Number.isFinite(Number(m.y)))) ctx.position = true;
    if (m.traded === true || a.traded === true || Number.isFinite(Number(m.tradeTimeMs))) ctx.trade = true;
  }
  ctx.sufficient = ctx.timing || ctx.position || ctx.trade;
  return ctx;
}

module.exports = {
  PROVENANCE,
  LABELS,
  normalizeHandleKey,
  resolveExactHandle,
  sourceProvenance,
  provenanceLabel,
  mayAssertCauses,
  observedNumber,
  detectTemporalContext
};
