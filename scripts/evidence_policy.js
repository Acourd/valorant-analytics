#!/usr/bin/env node
'use strict';

/**
 * evidence_policy.js - Política de evidencia COMPARTIDA por el motor, el CLI y
 * el prompt standalone (Gem / Custom GPT).
 *
 * OBJETIVO: impedir que evidencia factual mínima se convierta en una acusación
 * táctica ("fuga / causa de derrota"). Distingue tres planos:
 *
 *   1. DATO OBSERVADO DE RONDA (`observed_event`): eventos reales de
 *      telemetría (daño, kills/muertes, economía) que SOLO pueden ser creados
 *      por un adaptador confiable vía `mintObservedEvent()`. La procedencia no
 *      es un campo de texto: es una marca de capacidad interna (Symbol) que un
 *      JSON/objeto manual NO puede falsificar. Un objeto con `source:
 *      'observed_event'` sin esa marca se trata como `user_claim`.
 *   2. OBSERVACIÓN DECLARADA (`user_claim` / `inference`): narrativa aportada
 *      o inferida por el usuario. Se describe, jamás habilita fugas.
 *   3. FUGA ATRIBUIBLE (`round_leaks`): exige evento observado PERTINENTE a una
 *      regla (`leakRule`), RESULTADO de ronda (`won`/`lost`) y CONTEXTO mínimo
 *      no vacío. Sin los tres, solo se permiten `round_observations`.
 *
 * Niveles:
 *   - insufficient: sin métricas agregadas válidas.
 *   - aggregate   : agregados válidos pero SIN eventos observados de ronda.
 *   - complete    : ≥1 evento observado de ronda (habilita observaciones;
 *                   las fugas siguen condicionadas a la regla verificable).
 *
 * DIMENSIONES: disponibilidad POR DIMENSIÓN del radar (precisión, macro,
 * aperturas, economía, clutch) con métrica y benchmark.
 */

const BASE_SECTIONS = ['evidence_level', 'observations', 'limits', 'missing'];
const AGGREGATE_SECTIONS = ['aggregate_radar', 'mmr_signal'];
const ROUND_OBSERVATION_SECTIONS = ['round_observations'];
const LEAK_SECTIONS = ['round_leaks'];
const DUEL_SECTIONS = ['duel_matrix'];
const MECHANICAL_SECTIONS = ['weapon_telemetry', 'aim_routine'];

const ALLOWED_EVENTS = ['kill', 'death', 'trade', 'ability', 'economy', 'position', 'damage', 'plant', 'defuse', 'clutch', 'opening'];
const OBSERVED_SOURCES = ['observed_event'];
const DECLARED_SOURCES = ['user_claim', 'inference'];

// Reglas de fuga con su evento pertinente. Una fuga exige regla + resultado + contexto.
const LEAK_RULES = {
  throw_numeric_advantage: ['position', 'kill', 'death', 'economy'],
  untraded_opening: ['kill', 'death', 'opening'],
  over_spray_long_range: ['damage'],
  failed_retake: ['position', 'ability', 'defuse'],
  wasted_economy: ['economy']
};

// Marca de capacidad privada: solo `mintObservedEvent`/`mintObservedDuel`
// pueden añadirla. Un JSON u objeto manual no puede portar un Symbol.
const OBSERVED_PROVENANCE = Symbol('valorant-analytics.observed_event');

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

function hasContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return false;
  return Object.keys(context).some(k => context[k] !== undefined && context[k] !== null && context[k] !== '');
}

// Único constructor de evidencia observada de ronda. Los adaptadores confiables
// (p. ej. el extractor de telemetría del CLI) lo invocan con datos crudos.
function mintObservedEvent({ sourceRef, roundRef, event, detail, outcome, context, leakRule }) {
  if (typeof sourceRef !== 'string' || sourceRef.trim().length === 0) {
    throw new Error('mintObservedEvent requiere sourceRef (referencia de partida/fichero).');
  }
  const n = toFiniteNum(roundRef);
  if (n === null || n < 1 || !Number.isInteger(n)) {
    throw new Error('mintObservedEvent requiere roundRef entero >= 1.');
  }
  const ev = typeof event === 'string' ? event.trim().toLowerCase() : '';
  if (!ALLOWED_EVENTS.includes(ev)) {
    throw new Error(`mintObservedEvent: evento "${event}" fuera de la taxonomía.`);
  }
  if (leakRule !== undefined) {
    if (!Object.prototype.hasOwnProperty.call(LEAK_RULES, leakRule)) {
      throw new Error(`mintObservedEvent: leakRule "${leakRule}" desconocida.`);
    }
    if (!LEAK_RULES[leakRule].includes(ev)) {
      throw new Error(`mintObservedEvent: el evento "${ev}" no es pertinente a la regla "${leakRule}".`);
    }
    if (outcome !== 'won' && outcome !== 'lost') {
      throw new Error('mintObservedEvent: una fuga atribuible exige outcome "won" o "lost".');
    }
    if (!hasContext(context)) {
      throw new Error('mintObservedEvent: una fuga atribuible exige contexto mínimo no vacío.');
    }
  }
  const entry = { };
  Object.defineProperty(entry, OBSERVED_PROVENANCE, { value: true, enumerable: false });
  entry.source = 'observed_event';
  entry.sourceType = 'telemetry_adapter';
  entry.sourceRef = sourceRef;
  entry.n = n;
  entry.roundRef = n;
  entry.event = ev;
  if (typeof detail === 'string' && detail.trim()) entry.detail = detail;
  if (outcome === 'won' || outcome === 'lost') entry.outcome = outcome;
  if (hasContext(context)) entry.context = context;
  if (leakRule !== undefined) entry.leakRule = leakRule;
  return entry;
}

function mintObservedDuel({ sourceRef, opponent, kills, deaths, agent }) {
  if (typeof sourceRef !== 'string' || sourceRef.trim().length === 0) {
    throw new Error('mintObservedDuel requiere sourceRef.');
  }
  if (typeof opponent !== 'string' || opponent.trim().length === 0) {
    throw new Error('mintObservedDuel requiere opponent no vacío.');
  }
  const k = toFiniteNum(kills);
  const dd = toFiniteNum(deaths);
  if (k === null || dd === null || k < 0 || dd < 0 || (k + dd) <= 0) {
    throw new Error('mintObservedDuel requiere K/D numéricos con kills+deaths > 0.');
  }
  const entry = {};
  Object.defineProperty(entry, OBSERVED_PROVENANCE, { value: true, enumerable: false });
  entry.sourceType = 'telemetry_adapter';
  entry.sourceRef = sourceRef;
  entry.opponent = opponent;
  entry.kills = k;
  entry.deaths = dd;
  if (agent) entry.agent = agent;
  return entry;
}

function isObservedRound(r) {
  if (!r || typeof r !== 'object' || r[OBSERVED_PROVENANCE] !== true) return false;
  if (typeof r.sourceRef !== 'string' || r.sourceRef.trim().length === 0) return false;
  const n = toFiniteNum(r.roundRef !== undefined ? r.roundRef : r.n);
  if (n === null || n < 1 || !Number.isInteger(n)) return false;
  return ALLOWED_EVENTS.includes(typeof r.event === 'string' ? r.event.trim().toLowerCase() : '');
}

function isDeclaredRound(r) {
  return Boolean(r) && typeof r === 'object' && !Array.isArray(r) && DECLARED_SOURCES.includes(r.source);
}

function isAttributableLeak(r) {
  if (!isObservedRound(r)) return false;
  if (!Object.prototype.hasOwnProperty.call(LEAK_RULES, r.leakRule)) return false;
  if (!LEAK_RULES[r.leakRule].includes(r.event)) return false;
  if (r.outcome !== 'won' && r.outcome !== 'lost') return false;
  return hasContext(r.context);
}

function isValidDuel(d) {
  if (!d || typeof d !== 'object' || d[OBSERVED_PROVENANCE] !== true) return false;
  if (typeof d.opponent !== 'string' || d.opponent.trim().length === 0) return false;
  const k = toFiniteNum(d.kills);
  const dd = toFiniteNum(d.deaths);
  return k !== null && dd !== null && k >= 0 && dd >= 0 && (k + dd) > 0;
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
  const attributable = observedRounds.filter(isAttributableLeak);
  const declaredObservations = rawRounds.filter(isDeclaredRound);
  const observedEvents = observedRounds.map(r => ({ n: r.roundRef, event: r.event, detail: r.detail || '', attributable: isAttributableLeak(r) }));
  const duels = Array.isArray(src.duels) ? src.duels.filter(isValidDuel) : [];
  const hasWeaponZones = isValidWeaponZones(src.weaponZones);
  const hasMechanical = hasWeaponZones || (validHs && (validAcs || validKd));

  let level = 'insufficient';
  if (observedRounds.length > 0) level = 'complete';
  else if (hasAggregate) level = 'aggregate';

  const allowedSections = BASE_SECTIONS.slice();
  if (anyDimension) allowedSections.push('aggregate_radar');
  if (validKd && validAcs) allowedSections.push('mmr_signal');
  if (observedRounds.length > 0) allowedSections.push(...ROUND_OBSERVATION_SECTIONS);
  if (attributable.length > 0) allowedSections.push(...LEAK_SECTIONS);
  if (duels.length > 0) allowedSections.push(...DUEL_SECTIONS);
  if (hasMechanical) allowedSections.push(...MECHANICAL_SECTIONS);
  if (!hasWeaponZones) {
    const i = allowedSections.indexOf('weapon_telemetry');
    if (i !== -1) allowedSections.splice(i, 1);
  }

  const allSections = [
    ...BASE_SECTIONS, ...AGGREGATE_SECTIONS, ...ROUND_OBSERVATION_SECTIONS,
    ...LEAK_SECTIONS, ...DUEL_SECTIONS, ...MECHANICAL_SECTIONS
  ];
  const forbiddenSections = allSections.filter(s => !allowedSections.includes(s));

  const missing = [];
  if (!hasAggregate) missing.push('metricas_agregadas (KD/ACS/HS/KAST)');
  if (!validHs) missing.push('hs (porcentaje valido 0-100)');
  if (!validKast) missing.push('kast (porcentaje valido 0-100)');
  if (!validFkFd) missing.push('first_kills/first_deaths');
  if (!validEcon) missing.push('economia (econRating o win%)');
  if (!validClutches) missing.push('clutches (entero >= 0)');
  if (observedRounds.length === 0) missing.push('eventos_observados_por_ronda (procedencia verificada por adaptador)');
  if (attributable.length === 0) missing.push('fugas_verificables (regla + resultado de ronda + contexto)');
  if (duels.length === 0) missing.push('eventos_de_duelo observados');
  if (!hasWeaponZones) missing.push('zonas_de_dano (head/body/leg sumando 100%)');

  return {
    level,
    allowedSections,
    forbiddenSections,
    dimensions,
    observedRoundCount: observedRounds.length,
    attributableLeakCount: attributable.length,
    declaredObservations: declaredObservations.length,
    observedEvents,
    maxLeaks: Math.min(3, attributable.length),
    missing,
    hasWeaponZones,
    claimStatus: 'hipotesis_no_verificada',
    notes: 'Un evento observado describe; solo una fuga con regla+resultado+contexto acusa. El texto declarado es user_claim, nunca evidencia táctica.'
  };
}

module.exports = {
  classifyEvidence,
  mintObservedEvent,
  mintObservedDuel,
  toFiniteNum,
  isPercent,
  isObservedRound,
  isDeclaredRound,
  isAttributableLeak,
  isValidDuel,
  isValidWeaponZones,
  ALLOWED_EVENTS,
  LEAK_RULES,
  BASE_SECTIONS,
  AGGREGATE_SECTIONS,
  ROUND_OBSERVATION_SECTIONS,
  LEAK_SECTIONS,
  DUEL_SECTIONS,
  MECHANICAL_SECTIONS
};
