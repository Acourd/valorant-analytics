#!/usr/bin/env node
'use strict';

/**
 * evidence_policy.js - Política de evidencia COMPARTIDA por el motor, el CLI y
 * el prompt standalone (Gem / Custom GPT).
 *
 * Determina, de forma pura y determinista, QUÉ secciones de salida permite la
 * evidencia disponible y qué datos faltan. Evita forzar fugas, causas tácticas,
 * rutinas o puntuaciones sin base.
 *
 * PROCEDENCIA (endurecimiento v24): una ronda solo habilita fugas atribuidas si
 * su procedencia es `observed_event` (telemetría real) y su `event` pertenece a
 * una taxonomía reconocida. El texto declarado por el usuario (`user_claim`) o
 * inferido (`inference`) NO es evidencia táctica verificable: se conserva como
 * observación declarada, pero no habilita fugas.
 *
 * ESQUEMA: rondas requieren nº de ronda entero ≥1 + evento de la taxonomía;
 * zonas exigen head/body/leg en [0,100] sumando 100 (±1); duelos exigen
 * oponente + K/D con kills+deaths>0; agregados validados.
 *
 * DIMENSIONES: la política expone disponibilidad POR DIMENSIÓN del radar
 * (precisión, macro, aperturas, economía, clutch) con su métrica y benchmark;
 * el CLI puntúa solo las dimensiones disponibles y muestra `n/d` en el resto.
 *
 * Niveles:
 *   - insufficient: sin métricas agregadas válidas.
 *   - aggregate   : agregados válidos pero SIN eventos observados por ronda.
 *   - complete    : ≥1 evento observado por ronda → habilita fugas (0 a 3).
 */

const BASE_SECTIONS = ['evidence_level', 'observations', 'limits', 'missing'];
const AGGREGATE_SECTIONS = ['aggregate_radar', 'mmr_signal'];
const ROUND_SECTIONS = ['round_leaks'];
const DUEL_SECTIONS = ['duel_matrix'];
const MECHANICAL_SECTIONS = ['weapon_telemetry', 'aim_routine'];

const ALLOWED_EVENTS = ['kill', 'death', 'trade', 'ability', 'economy', 'position', 'damage', 'plant', 'defuse', 'clutch', 'opening'];
const OBSERVED_SOURCES = ['observed_event'];
const DECLARED_SOURCES = ['user_claim', 'inference'];

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

// Evidencia de ronda VERIFICABLE: procedencia observada + evento de la taxonomía.
function isObservedRound(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  const n = toFiniteNum(r.n);
  if (n === null || n < 1 || !Number.isInteger(n)) return false;
  if (!OBSERVED_SOURCES.includes(r.source)) return false;
  const ev = typeof r.event === 'string' ? r.event.trim().toLowerCase() : '';
  return ALLOWED_EVENTS.includes(ev);
}

function isDeclaredRound(r) {
  return Boolean(r) && typeof r === 'object' && !Array.isArray(r) && DECLARED_SOURCES.includes(r.source);
}

function isValidDuel(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  const opp = d.opponent || d.vs;
  if (typeof opp !== 'string' || opp.trim().length === 0) return false;
  const k = toFiniteNum(d.kills);
  const dd = toFiniteNum(d.deaths);
  if (k === null || dd === null || k < 0 || dd < 0) return false;
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
  const validKast = isPercent(observed.kast);
  const validFkFd = isNonNegative(observed.fk) && isNonNegative(observed.fd);
  const validEcon = isNonNegative(observed.econRating) || isPercent(observed.winPct);
  const validClutches = isNonNegative(observed.clutches);
  const hasAggregate = validKd || validAcs || validHs || validKast || validFkFd || validEcon || validClutches;

  const dimensions = {
    precision: { available: validHs, metric: 'HS%', benchmark: '25-35%+' },
    macro: { available: validKast, metric: 'KAST%', benchmark: '65-88%' },
    openings: { available: validFkFd, metric: 'FK/FD', benchmark: 'FK >= FD' },
    economy: { available: validEcon, metric: 'EconRating/Win%', benchmark: '> 0.8 / > 50%' },
    clutch: { available: validClutches, metric: 'Clutches', benchmark: '>= 1' }
  };
  const anyDimension = Object.values(dimensions).some(d => d.available);

  const rawRounds = Array.isArray(src.rounds) ? src.rounds : [];
  const observedRounds = rawRounds.filter(isObservedRound);
  const declaredObservations = rawRounds.filter(isDeclaredRound);
  const duels = Array.isArray(src.duels) ? src.duels.filter(isValidDuel) : [];
  const hasWeaponZones = isValidWeaponZones(src.weaponZones);
  const hasMechanical = hasWeaponZones || (validHs && (validAcs || validKd));

  let level = 'insufficient';
  if (observedRounds.length > 0) level = 'complete';
  else if (hasAggregate) level = 'aggregate';

  const allowedSections = BASE_SECTIONS.slice();
  if (anyDimension) allowedSections.push('aggregate_radar');
  if (validKd && validAcs) allowedSections.push('mmr_signal');
  if (observedRounds.length > 0) allowedSections.push(...ROUND_SECTIONS);
  if (duels.length > 0) allowedSections.push(...DUEL_SECTIONS);
  if (hasMechanical) allowedSections.push(...MECHANICAL_SECTIONS);
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
  if (!hasAggregate) missing.push('metricas_agregadas (KD/ACS/HS/KAST)');
  if (!validHs) missing.push('hs (porcentaje valido 0-100)');
  if (!validKast) missing.push('kast (porcentaje valido 0-100)');
  if (!validFkFd) missing.push('first_kills/first_deaths');
  if (!validEcon) missing.push('economia (econRating o win%)');
  if (!validClutches) missing.push('clutches (entero >= 0)');
  if (observedRounds.length === 0) missing.push('eventos_observados_por_ronda (procedencia observed_event + evento valido)');
  if (duels.length === 0) missing.push('eventos_de_duelo (oponente + K/D)');
  if (!hasWeaponZones) missing.push('zonas_de_dano (head/body/leg sumando 100%)');

  return {
    level,
    allowedSections,
    forbiddenSections,
    dimensions,
    observedRoundCount: observedRounds.length,
    declaredObservations: declaredObservations.length,
    maxLeaks: Math.min(3, observedRounds.length),
    missing,
    hasWeaponZones,
    claimStatus: 'hipotesis_no_verificada',
    notes: 'Solo la telemetría observada habilita fugas atribuidas; el texto declarado o inferido queda como observación, no como evidencia verificable.'
  };
}

module.exports = {
  classifyEvidence,
  toFiniteNum,
  isPercent,
  isObservedRound,
  isDeclaredRound,
  isValidDuel,
  isValidWeaponZones,
  ALLOWED_EVENTS,
  BASE_SECTIONS,
  AGGREGATE_SECTIONS,
  ROUND_SECTIONS,
  DUEL_SECTIONS,
  MECHANICAL_SECTIONS
};
