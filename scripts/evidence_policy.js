#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const path = require('path');
const riotSource = require('./riot_source');

/**
 * evidence_policy.js - Política de evidencia COMPARTIDA por el motor, el CLI y
 * el prompt standalone (Gem / Custom GPT).
 *
 * HONESTIDAD DE PROCEDENCIA (v27): este módulo NO convierte datos locales en
 * telemetría confiable. Distingue dos estados de fuente:
 *
 *   - `normalized_input`: datos aportados/normalizados localmente (telemetría
 *     de fichero, objetos manuales). Pueden DESCRIBIR observaciones de ronda,
 *     pero NUNCA habilitan una fuga ni se presentan como verificados.
 *   - `verified_source`: fuente autenticada con referencia comprobable. Aún NO
 *     existe ningún adaptador que lo emita; está reservado a un frente futuro
 *     de telemetría real. Solo este estado podría habilitar fugas atribuidas.
 *
 * La marca de procedencia es una capacidad interna (Symbol) que un JSON/objeto
 * manual no puede portar, y los constructores NO se exportan. Aun así, el
 * adaptador local solo produce `normalized_input`: la procedencia está
 * NORMALIZADA, no verificada.
 *
 * Planos de evidencia:
 *   1. Ronda normalizada (`normalized_input`): evento real de los datos
 *      aportados (daño, kills/muertes, economía). Describe la ronda.
 *   2. Observación declarada (`user_claim`/`inference`): narrativa del usuario.
 *   3. Fuga atribuible (`round_leaks`): exige ronda `verified_source` + regla
 *      pertinente + resultado de ronda + contexto. Inalcanzable sin fuente
 *      autenticada (estado honesto actual).
 *
 * DIMENSIONES: disponibilidad POR DIMENSIÓN del radar con métrica y benchmark.
 */

const BASE_SECTIONS = ['evidence_level', 'observations', 'limits', 'missing'];
const AGGREGATE_SECTIONS = ['aggregate_radar', 'mmr_signal'];
const ROUND_OBSERVATION_SECTIONS = ['round_observations'];
const LEAK_SECTIONS = ['round_leaks'];
const DUEL_SECTIONS = ['duel_matrix'];
const MECHANICAL_SECTIONS = ['weapon_telemetry', 'aim_routine'];

const ALLOWED_EVENTS = ['kill', 'death', 'trade', 'ability', 'economy', 'position', 'damage', 'plant', 'defuse', 'clutch', 'opening'];
const DECLARED_SOURCES = ['user_claim', 'inference'];

const LEAK_RULES = {
  throw_numeric_advantage: ['position', 'kill', 'death', 'economy'],
  untraded_opening: ['kill', 'death', 'opening'],
  over_spray_long_range: ['damage'],
  failed_retake: ['position', 'ability', 'defuse'],
  wasted_economy: ['economy']
};

const NORMALIZED_PROVENANCE = Symbol('valorant-analytics.normalized_input');
const VERIFIED_PROVENANCE = Symbol('valorant-analytics.verified_source');

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

// Serialización canónica (claves ordenadas) para hashes estables.
function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`;
}

// Referencia de origen trazable: matchId si existe; si no, digest canónico del
// contenido + nombre del fichero de origen.
function stableRef(matchData, originPath) {
  const matchId = (matchData && matchData.data && matchData.data.metadata && matchData.data.metadata.matchId) ||
    (matchData && matchData.metadata && matchData.metadata.matchId);
  if (typeof matchId === 'string' && matchId.trim().length > 0) return `match:${matchId.trim()}`;
  let digest;
  try {
    digest = crypto.createHash('sha256').update(canonicalStringify(matchData === undefined ? null : matchData)).digest('hex').slice(0, 16);
  } catch (e) {
    digest = crypto.createHash('sha256').update(String(matchData)).digest('hex').slice(0, 16);
  }
  const base = originPath ? path.basename(path.resolve(originPath)) : 'inline';
  return `sha256:${digest}@${base}`;
}

// Constructor privado de ronda NORMALIZADA (nunca exportado).
function mintNormalizedEvent({ sourceRef, roundRef, event, detail, context }) {
  if (typeof sourceRef !== 'string' || sourceRef.trim().length === 0) {
    throw new Error('mintNormalizedEvent requiere sourceRef.');
  }
  const n = toFiniteNum(roundRef);
  if (n === null || n < 1 || !Number.isInteger(n)) {
    throw new Error('mintNormalizedEvent requiere roundRef entero >= 1.');
  }
  const ev = typeof event === 'string' ? event.trim().toLowerCase() : '';
  if (!ALLOWED_EVENTS.includes(ev)) {
    throw new Error(`mintNormalizedEvent: evento "${event}" fuera de la taxonomía.`);
  }
  const entry = {};
  Object.defineProperty(entry, NORMALIZED_PROVENANCE, { value: true, enumerable: false });
  entry.source = 'normalized_input';
  entry.sourceType = 'normalized_input';
  entry.sourceRef = sourceRef;
  entry.n = n;
  entry.roundRef = n;
  entry.event = ev;
  if (typeof detail === 'string' && detail.trim()) entry.detail = detail;
  if (hasContext(context)) entry.context = context;
  return entry;
}

function mintNormalizedDuel({ sourceRef, opponent, kills, deaths, agent }) {
  if (typeof sourceRef !== 'string' || sourceRef.trim().length === 0) {
    throw new Error('mintNormalizedDuel requiere sourceRef.');
  }
  if (typeof opponent !== 'string' || opponent.trim().length === 0) {
    throw new Error('mintNormalizedDuel requiere opponent no vacío.');
  }
  const k = toFiniteNum(kills);
  const dd = toFiniteNum(deaths);
  if (k === null || dd === null || k < 0 || dd < 0 || (k + dd) <= 0) {
    throw new Error('mintNormalizedDuel requiere K/D numéricos con kills+deaths > 0.');
  }
  const entry = {};
  Object.defineProperty(entry, NORMALIZED_PROVENANCE, { value: true, enumerable: false });
  entry.source = 'normalized_input';
  entry.sourceType = 'normalized_input';
  entry.sourceRef = sourceRef;
  entry.opponent = opponent;
  entry.kills = k;
  entry.deaths = dd;
  if (agent) entry.agent = agent;
  return entry;
}

function isNormalizedRound(r) {
  if (!r || typeof r !== 'object' || r[NORMALIZED_PROVENANCE] !== true) return false;
  if (typeof r.sourceRef !== 'string' || r.sourceRef.trim().length === 0) return false;
  const n = toFiniteNum(r.roundRef !== undefined ? r.roundRef : r.n);
  if (n === null || n < 1 || !Number.isInteger(n)) return false;
  return ALLOWED_EVENTS.includes(typeof r.event === 'string' ? r.event.trim().toLowerCase() : '');
}

// Estado VERIFICADO: reservado a una fuente autenticada futura. Ningún
// adaptador actual lo emite; por tanto las fugas quedan inalcanzables.
function isVerifiedRound(r) {
  if (!r || typeof r !== 'object' || r[VERIFIED_PROVENANCE] !== true) return false;
  if (typeof r.sourceRef !== 'string' || r.sourceRef.trim().length === 0) return false;
  const n = toFiniteNum(r.roundRef !== undefined ? r.roundRef : r.n);
  if (n === null || n < 1 || !Number.isInteger(n)) return false;
  return ALLOWED_EVENTS.includes(typeof r.event === 'string' ? r.event.trim().toLowerCase() : '');
}

function isDeclaredRound(r) {
  return Boolean(r) && typeof r === 'object' && !Array.isArray(r) && DECLARED_SOURCES.includes(r.source);
}

function isAttributableLeak(r) {
  if (!isVerifiedRound(r)) return false;
  if (!Object.prototype.hasOwnProperty.call(LEAK_RULES, r.leakRule)) return false;
  if (!LEAK_RULES[r.leakRule].includes(r.event)) return false;
  if (r.outcome !== 'won' && r.outcome !== 'lost') return false;
  return hasContext(r.context);
}

function isValidDuel(d) {
  if (!d || typeof d !== 'object' || d[NORMALIZED_PROVENANCE] !== true) return false;
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
  const normalizedRounds = rawRounds.filter(isNormalizedRound);
  const verifiedRounds = rawRounds.filter(isVerifiedRound);
  const attributable = verifiedRounds.filter(isAttributableLeak);
  const declaredObservations = rawRounds.filter(isDeclaredRound);
  const observedEvents = normalizedRounds.map(r => ({ n: r.roundRef, event: r.event, detail: r.detail || '', sourceType: r.sourceType }));
  const duels = Array.isArray(src.duels) ? src.duels.filter(isValidDuel) : [];
  const hasWeaponZones = isValidWeaponZones(src.weaponZones);
  const hasMechanical = hasWeaponZones || (validHs && (validAcs || validKd));

  let level = 'insufficient';
  if (verifiedRounds.length > 0) level = 'complete';
  else if (normalizedRounds.length > 0) level = 'normalized';
  else if (hasAggregate) level = 'aggregate';

  const provenanceStatus = verifiedRounds.length > 0 ? 'verified_source' : (normalizedRounds.length > 0 ? 'normalized_input' : 'none');

  const allowedSections = BASE_SECTIONS.slice();
  if (anyDimension) allowedSections.push('aggregate_radar');
  if (validKd && validAcs) allowedSections.push('mmr_signal');
  if (normalizedRounds.length > 0 || verifiedRounds.length > 0) allowedSections.push(...ROUND_OBSERVATION_SECTIONS);
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
  if (normalizedRounds.length === 0) missing.push('eventos_normalizados_por_ronda (datos locales)');
  missing.push('fuente_verificada (requiere origen autenticado: frente de telemetria real)');
  if (duels.length === 0) missing.push('eventos_de_duelo normalizados');
  if (!hasWeaponZones) missing.push('zonas_de_dano (head/body/leg sumando 100%)');

  return {
    level,
    provenanceStatus,
    verifiedSource: verifiedRounds.length > 0,
    allowedSections,
    forbiddenSections,
    dimensions,
    normalizedRoundCount: normalizedRounds.length,
    verifiedRoundCount: verifiedRounds.length,
    attributableLeakCount: attributable.length,
    declaredObservations: declaredObservations.length,
    observedEvents,
    maxLeaks: Math.min(3, attributable.length),
    missing,
    hasWeaponZones,
    claimStatus: 'hipotesis_no_verificada',
    notes: 'Datos locales son normalized_input (no verificados): describen, no acusan. Una fuga exige fuente verificada + regla + resultado + contexto.'
  };
}

// ---------------------------------------------------------------------------
// Adaptador LOCAL (normalización). NO es una "fuente confiable": convierte
// telemetría de fichero/objeto en eventos `normalized_input`. Nunca emite
// `verified_source` ni reglas de fuga.
// ---------------------------------------------------------------------------
function observeMatchTelemetry(matchData, playerHandle, options = {}) {
  const segments = (matchData && matchData.data && matchData.data.segments) || (matchData && matchData.segments) || [];
  const summaries = segments.filter(s => s.type === 'player-summary');
  const pick = summaries.find(s =>
    s.metadata?.platformUserHandle === playerHandle ||
    s.attributes?.platformUserIdentifier === playerHandle
  ) || summaries[0];
  const st = (pick && pick.stats) || {};
  const val = k => (st[k] && (st[k].value !== undefined ? st[k].value : st[k].displayValue));
  const observed = {
    kd: val('kdRatio'), acs: val('scorePerRound'), hs: val('hsAccuracy'),
    kast: val('kast'), fk: val('firstKills'), fd: val('firstDeaths'),
    econRating: val('econRating'), winPct: val('roundsWinPct'), clutches: val('clutches')
  };
  const cell = (obj, k) => (obj && obj[k] && (obj[k].value !== undefined ? obj[k].value : obj[k].displayValue));
  const sourceRef = stableRef(matchData, options.originPath);
  const rounds = [];
  segments.forEach(s => {
    const roundRef = s.attributes && s.attributes.round;
    if (!Number.isInteger(roundRef) || roundRef < 1) return;
    if (s.type === 'player-round-damage') {
      const dmg = Number(cell(s.stats, 'damage'));
      if (Number.isFinite(dmg) && dmg > 0) {
        rounds.push(mintNormalizedEvent({
          sourceRef, roundRef, event: 'damage',
          detail: `dmg ${dmg} (H${cell(s.stats, 'headshots')}/B${cell(s.stats, 'bodyshots')}/L${cell(s.stats, 'legshots')})`,
          context: { damage: dmg, headshots: Number(cell(s.stats, 'headshots')) || 0, bodyshots: Number(cell(s.stats, 'bodyshots')) || 0, legshots: Number(cell(s.stats, 'legshots')) || 0 }
        }));
      }
    } else if (s.type === 'player-round') {
      const kills = Number(cell(s.stats, 'kills'));
      const deaths = Number(cell(s.stats, 'deaths'));
      const spent = Number(cell(s.stats, 'spentCredits'));
      if (Number.isFinite(kills) && Number.isFinite(deaths) && (kills > 0 || deaths > 0)) {
        rounds.push(mintNormalizedEvent({ sourceRef, roundRef, event: 'kill', detail: `${kills}K/${deaths}D`, context: { kills, deaths } }));
      } else if (Number.isFinite(spent) && spent > 0) {
        rounds.push(mintNormalizedEvent({ sourceRef, roundRef, event: 'economy', detail: `spent ${spent}`, context: { spentCredits: spent } }));
      }
    }
  });
  return { observed, rounds, sourceRef, provenance: 'normalized_input' };
}

function observeDuelRows(rows, matchData, options = {}) {
  const sourceRef = stableRef(matchData, options.originPath);
  const duels = [];
  (Array.isArray(rows) ? rows : []).forEach(r => {
    const opponent = r && typeof r.opponent === 'string' ? r.opponent.trim() : '';
    if (!opponent) return;
    const kills = Number(r && r.kills);
    const deaths = Number(r && r.deaths);
    if (!Number.isFinite(kills) || !Number.isFinite(deaths) || (kills + deaths) <= 0) return;
    duels.push(mintNormalizedDuel({ sourceRef, opponent, kills, deaths, agent: r.opponentAgent }));
  });
  return duels;
}

// ---------------------------------------------------------------------------
// ADAPTADOR VERIFICADO (Riot RSO + VAL-MATCH-V1). Solo acuña `verified_source`
// si la atestación firmada VERIFICA contra el trust store y liga
// matchId+host+endpoint+fetchedAt+digest del payload. Cualquier fallo es
// fail-closed (throw), sin degradar silenciosamente a normalized.
// ---------------------------------------------------------------------------
function mintVerifiedEvent({ sourceRef, roundRef, event, detail, context }) {
  if (typeof sourceRef !== 'string' || !sourceRef.trim()) throw new Error('mintVerifiedEvent requiere sourceRef.');
  const n = toFiniteNum(roundRef);
  if (n === null || n < 1 || !Number.isInteger(n)) throw new Error('mintVerifiedEvent requiere roundRef entero >= 1.');
  const ev = typeof event === 'string' ? event.trim().toLowerCase() : '';
  if (!ALLOWED_EVENTS.includes(ev)) throw new Error(`mintVerifiedEvent: evento "${event}" fuera de la taxonomía.`);
  const entry = {};
  Object.defineProperty(entry, VERIFIED_PROVENANCE, { value: true, enumerable: false });
  entry.source = 'verified_source';
  entry.sourceType = 'verified_source';
  entry.sourceRef = sourceRef;
  entry.n = n;
  entry.roundRef = n;
  entry.event = ev;
  if (typeof detail === 'string' && detail.trim()) entry.detail = detail;
  if (hasContext(context)) entry.context = context;
  return entry;
}

function observeVerifiedMatch(matchData, playerPuuid, options = {}) {
  const check = riotSource.verifyAttestation(options.attestation, {
    payload: matchData,
    trustedKeys: options.trustedKeys,
    maxAgeMs: options.maxAgeMs
  });
  if (!check.valid) {
    const err = new Error(`verified_source rechazado: ${check.reason}`);
    err.code = 'VERIFIED_SOURCE_REJECTED';
    throw err;
  }
  const matchId = String(options.attestation.matchId).trim().toLowerCase();
  const sourceRef = `match:${matchId}`;
  const players = Array.isArray(matchData && matchData.players) ? matchData.players : [];
  const focus = players.find(p => p && p.puuid === playerPuuid) || players[0];
  const stats = (focus && focus.stats) || {};
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : null);
  const kills = num(stats.kills);
  const deaths = num(stats.deaths);
  const score = num(stats.score);
  const roundsPlayed = num(stats.roundsPlayed);
  const head = num(stats.headshots);
  const body = num(stats.bodyshots);
  const leg = num(stats.legshots);
  const shots = (head || 0) + (body || 0) + (leg || 0);
  const observed = {
    kd: (kills !== null && deaths !== null) ? Number((kills / Math.max(1, deaths)).toFixed(2)) : undefined,
    acs: (score !== null && roundsPlayed) ? Number((score / roundsPlayed).toFixed(1)) : undefined,
    hs: shots > 0 ? Number(((head / shots) * 100).toFixed(1)) : undefined,
    kast: undefined, fk: undefined, fd: undefined, econRating: undefined, winPct: undefined, clutches: undefined
  };
  const roundResults = Array.isArray(matchData && matchData.roundResults) ? matchData.roundResults : [];
  const rounds = [];
  roundResults.forEach((rr, idx) => {
    const psList = Array.isArray(rr && rr.playerStats) ? rr.playerStats : [];
    const ps = psList.find(p => p && p.puuid === (focus && focus.puuid)) || null;
    if (!ps) return;
    const roundRef = num(rr.roundNum) !== null ? num(rr.roundNum) + 1 : idx + 1;
    const dmg = num(ps.damage);
    const k = num(ps.kills);
    const d = num(ps.deaths);
    const spent = num(ps.economy && ps.economy.spent);
    if (dmg !== null && dmg > 0) {
      rounds.push(mintVerifiedEvent({ sourceRef, roundRef, event: 'damage', detail: `dmg ${dmg}`, context: { damage: dmg } }));
    } else if (k !== null && d !== null && (k > 0 || d > 0)) {
      rounds.push(mintVerifiedEvent({ sourceRef, roundRef, event: 'kill', detail: `${k}K/${d}D`, context: { kills: k, deaths: d } }));
    } else if (spent !== null && spent > 0) {
      rounds.push(mintVerifiedEvent({ sourceRef, roundRef, event: 'economy', detail: `spent ${spent}`, context: { spentCredits: spent } }));
    }
  });
  return { observed, rounds, sourceRef, matchId, provenance: 'verified_source' };
}

module.exports = {
  classifyEvidence,
  observeMatchTelemetry,
  observeDuelRows,
  observeVerifiedMatch,
  stableRef,
  canonicalStringify,
  toFiniteNum,
  isPercent,
  isNormalizedRound,
  isVerifiedRound,
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
