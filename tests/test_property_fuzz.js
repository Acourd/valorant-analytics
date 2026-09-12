#!/usr/bin/env node
'use strict';

/**
 * test_property_fuzz.js — Pruebas por PROPIEDADES + fuzzing determinista.
 *
 * Semilla fija (override con PROP_SEED) y minimización por líneas al fallar.
 * Cubre: parser de scoreboard, resolución de objetivo, procedencia y contratos
 * entre módulos. Sin red, sin dependencias: solo módulos locales.
 *
 * Criterio de éxito: toda propiedad se cumple en TODAS las iteraciones.
 */

const assert = require('assert');
const path = require('path');

const scriptsDir = path.join(__dirname, '..', 'scripts');
const { parseTextScoreboard, assembleRawMatchStructure } = require(path.join(scriptsDir, 'universal_ingestor.js'));
const { resolveExactHandle, sourceProvenance, mayAssertCauses } = require(path.join(scriptsDir, 'data_contract.js'));
const { evaluateLearningProfile } = require(path.join(scriptsDir, 'learning_profile.js'));
const { SessionGuardian } = require(path.join(scriptsDir, 'session_guardian.js'));
const { DriftDetector } = require(path.join(scriptsDir, 'drift_detector.js'));
const { ConsensusArbiter } = require(path.join(scriptsDir, 'consensus_arbiter.js'));
const { generateCoachingReport } = require(path.join(scriptsDir, 'coaching_engine.js'));
const { parseCliArgs } = require(path.join(scriptsDir, 'cli.js'));
const { buildPlan } = require(path.join(scriptsDir, 'plan.js'));

const SEED = Number(process.env.PROP_SEED || 0xA11CE5);
const ITERATIONS = Number(process.env.PROP_ITERATIONS || 250);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
class Rng {
  constructor(seed) { this.next = mulberry32(seed); }
  int(n) { return Math.floor(this.next() * n); }
  pick(arr) { return arr[this.int(arr.length)]; }
  bool(p = 0.5) { return this.next() < p; }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = this.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
}

let passed = 0;
let failed = 0;
function property(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS [property] ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL [property] ${name}: ${e.message.split('\n')[0]}`);
  }
}

// Minimiza un texto que hace fallar `check` eliminando líneas una a una.
function minimizeLines(text, check) {
  let lines = String(text).split('\n');
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < lines.length; i++) {
      const candidate = lines.filter((_, j) => j !== i).join('\n');
      let fails = false;
      try { check(candidate); } catch (e) { fails = true; }
      if (fails) { lines = lines.filter((_, j) => j !== i); changed = true; break; }
    }
  }
  return lines.join('\n');
}

const NAMES = ['TenZ', 'Nombre', '日本語プレイヤー', 'Ätlas', 'Ωmega', 'M4x_Pro', 'player one', '12', '7', 'Ñandú'];
const TAGS = ['0001', 'EU1', 'NA1', 'JP1', 'ABC', '12'];
const MAPS = ['Ascent', 'Haven', 'Split', 'Lotus'];
const AGENTS = ['Iso', 'Jett', 'Sova', 'Omen', 'Cypher'];

function randomRow(rng, opts = {}) {
  const name = opts.name || rng.pick(NAMES);
  const tag = opts.tag || rng.pick(TAGS);
  const columns = [];
  const n = opts.columns !== undefined ? opts.columns : rng.int(7);
  for (let i = 0; i < n; i++) columns.push(String(rng.int(40)));
  const parts = [`${name}#${tag}`];
  if (rng.bool(0.3)) parts.unshift(String(1 + rng.int(20)));
  if (rng.bool(0.2)) parts.push(rng.pick(AGENTS));
  if (rng.bool(0.2)) parts.push(rng.pick(MAPS) + ' ' + (1 + rng.int(3)));
  const sep = rng.bool(0.5) ? '\t' : ' ';
  let line = parts.join(sep);
  if (columns.length > 0) line += sep + columns.join(sep);
  if (rng.bool(0.15)) line = '• ' + line;
  return line;
}

function observedMatch(handle, stats) {
  return {
    data: {
      metadata: { matchId: 'prop-match', mapName: null, provenance: 'normalized_input' },
      segments: [{
        type: 'player-summary',
        attributes: { platformUserIdentifier: handle },
        metadata: { platformUserHandle: handle, agentName: 'Iso' },
        stats
      }]
    }
  };
}

console.log(`PROPERTY/FUZZ — semilla=${SEED} iteraciones=${ITERATIONS}\n`);

// ---------------------------------------------------------------------------
// 1. Parser de scoreboard
// ---------------------------------------------------------------------------
property('parser: nunca fabrica mapa/rondas/roster/eventos y no absorbe numeración', () => {
  const rng = new Rng(SEED + 1);
  for (let it = 0; it < ITERATIONS; it++) {
    const rows = [];
    const rowCount = 1 + rng.int(4);
    for (let r = 0; r < rowCount; r++) rows.push(randomRow(rng));
    const text = (rng.bool(0.3) ? '\uFEFF' : '') + rows.join('\n');
    const check = t => {
      const m = parseTextScoreboard(t);
      const summaries = m.data.segments.filter(s => s.type === 'player-summary');
      assert.ok(m.data.segments.every(s => s.type === 'player-summary'), 'no debe fabricar segmentos de ronda/equipos sin demo');
      assert.strictEqual(m.data.metadata.rounds, null, 'no debe inventar rondas');
      assert.strictEqual(m.data.metadata.matchId !== undefined, true);
      for (const s of summaries) {
        const h = s.metadata.platformUserHandle;
        assert.ok(typeof h === 'string' && h.includes('#'), 'handle con #');
        assert.ok(!/^\s*\d+\s/.test(h), `no debe absorber numeración: "${h}"`);
        assert.ok(!h.includes('\uFEFF'), 'sin BOM en handle');
      }
      return m;
    };
    try {
      check(text);
    } catch (e) {
      throw new Error(`it=${it} seed=${SEED} min="${minimizeLines(text, check).replace(/\n/g, '\\n')}" :: ${e.message}`);
    }
  }
});

property('parser: una fila observada conserva exactamente sus números (o n/d)', () => {
  const rng = new Rng(SEED + 2);
  for (let it = 0; it < ITERATIONS; it++) {
    const kills = rng.int(40), deaths = rng.int(40), assists = rng.int(20);
    const cols = rng.bool(0.3) ? [] : [kills, deaths, assists].map(String);
    const line = `Focus#NA1 ${cols.join(' ')}`.trim();
    const m = parseTextScoreboard(line);
    const s = m.data.segments.find(x => x.type === 'player-summary');
    if (cols.length === 0) {
      assert.ok(!s, 'una fila sin estadísticas no debe producir resumen con métricas inventadas');
      continue;
    }
    assert.ok(s, 'fila válida debe parsear');
    assert.strictEqual(s.stats.kills ? s.stats.kills.value : null, kills, 'kills observados');
    assert.strictEqual(s.stats.deaths ? s.stats.deaths.value : null, cols.length > 1 ? deaths : null, 'deaths observados o null');
    assert.ok(s.stats.hsAccuracy === undefined, 'sin HS no debe inventarse HS');
  }
});

property('parser: entrada malformada => error claro o salida sin jugadores (nunca diagnóstico plausible)', () => {
  const malformed = ['####', 'Nombre#', '#tag', 'Nombre#!!!', '\uFEFF', '\n\n', '   ', '### ###', 'a#', '#', 'Nombre#TAG#extra'];
  for (const bad of malformed) {
    let result = null;
    try {
      result = parseTextScoreboard(bad);
    } catch (e) {
      assert.ok(String(e.message).length > 10, `error claro para "${bad}"`);
      continue;
    }
    const summaries = result.data.segments.filter(s => s.type === 'player-summary');
    if (summaries.length > 0) {
      for (const s of summaries) {
        assert.ok(/^[^#\s][^#]*#[A-Za-z0-9]{1,16}$/.test(s.metadata.platformUserHandle), `handle plausible para "${bad}"`);
      }
    }
    assert.strictEqual(result.data.metadata.provenance, 'normalized_input');
  }
  for (const bad of [null, 123, {}, []]) {
    assert.throws(() => parseTextScoreboard(bad), /cadena de texto no vacía/i);
  }
});

// ---------------------------------------------------------------------------
// 2. Resolución de objetivo
// ---------------------------------------------------------------------------
property('target: exacto o fail-closed; el orden del roster no cambia la elección', () => {
  const rng = new Rng(SEED + 3);
  for (let it = 0; it < ITERATIONS; it++) {
    const size = 1 + rng.int(8);
    const roster = [];
    for (let i = 0; i < size; i++) roster.push(`${rng.pick(NAMES)}#${rng.pick(TAGS)}${i}`);
    const requested = rng.pick(roster);
    const shuffled = rng.shuffle(roster);
    const resolved = resolveExactHandle(shuffled, requested);
    assert.strictEqual(resolved, requested, 'coincidencia exacta e independiente del orden');
    const variant = requested.toUpperCase();
    assert.strictEqual(resolveExactHandle(roster, variant), requested, 'case-insensitive');
    assert.throws(() => resolveExactHandle(roster, 'NoExiste#9999'), e => e.code === 'TARGET_NOT_FOUND');
    if (size > 1) {
      assert.throws(() => resolveExactHandle(roster, undefined), e => e.code === 'TARGET_REQUIRED');
    } else {
      assert.strictEqual(resolveExactHandle(roster, undefined), requested, 'roster de 1: auto-selección permitida');
    }
  }
});

property('target: duplicado normalizado => TARGET_AMBIGUOUS; roster vacío => ROSTER_EMPTY', () => {
  const rng = new Rng(SEED + 4);
  for (let it = 0; it < ITERATIONS; it++) {
    const base = `${rng.pick(NAMES)}#${rng.pick(TAGS)}`;
    const roster = [base, base.toLowerCase(), `${rng.pick(NAMES)}#OTRO`];
    assert.throws(() => resolveExactHandle(roster, base), e => e.code === 'TARGET_AMBIGUOUS');
    assert.throws(() => resolveExactHandle([], 'X#1'), e => e.code === 'ROSTER_EMPTY');
  }
});

// ---------------------------------------------------------------------------
// 3. Procedencia
// ---------------------------------------------------------------------------
const PROV_KEYS = ['attestation', 'verified', 'provenance', 'payloadDigest', 'synthetic', 'wafContainment', 'driver', 'signature'];

property('provenance: ningún campo de JSON local habilita verified_source ni causas', () => {
  const rng = new Rng(SEED + 5);
  for (let it = 0; it < ITERATIONS; it++) {
    const meta = {};
    const n = rng.int(5);
    for (let k = 0; k < n; k++) meta[rng.pick(PROV_KEYS)] = rng.pick([true, false, 'verified_source', 'x', 1, null, { a: 1 }]);
    const p = sourceProvenance(meta);
    const expected = meta.synthetic === true || meta.wafContainment === true ? 'synthetic_demo' : 'normalized_input';
    assert.strictEqual(p, expected, `procedencia sellada (${JSON.stringify(meta)})`);
    assert.strictEqual(mayAssertCauses(p), false, 'causas bloqueadas en datos locales');
  }
});

property('provenance: payload mutado/parcial sigue siendo normalized y sin fugas', () => {
  const sample = JSON.parse(require('fs').readFileSync(path.join(__dirname, '..', 'examples', 'sample_match.json'), 'utf8'));
  const rng = new Rng(SEED + 6);
  for (let it = 0; it < ITERATIONS; it++) {
    const mutated = JSON.parse(JSON.stringify(sample));
    const meta = mutated.data.metadata;
    meta[rng.pick(PROV_KEYS)] = rng.pick([true, 'verified_source', { fake: true }]);
    if (rng.bool(0.3) && mutated.data.segments.length > 1) {
      mutated.data.segments.splice(rng.int(mutated.data.segments.length), 1);
    }
    let profile;
    try {
      profile = evaluateLearningProfile(mutated, 'TenZ#0001');
    } catch (e) {
      assert.ok(/jugadores|no encontrado|Objetivo/i.test(e.message), 'error descriptivo esperado');
      continue;
    }
    assert.notStrictEqual(profile.provenance, 'verified_source', 'nunca verified por metadata');
    assert.ok(['normalized_input', 'synthetic_demo'].includes(profile.provenance), 'procedencia sellada');
    assert.deepStrictEqual(profile.eloLeaks, [], 'sin causas atribuibles');
  }
});

// ---------------------------------------------------------------------------
// 4. Contratos entre módulos
// ---------------------------------------------------------------------------
property('contratos: dimensiones solo si su métrica está observada; sin prescripción sin HS', () => {
  const rng = new Rng(SEED + 7);
  const statKeys = ['kills', 'deaths', 'kdRatio', 'scorePerRound', 'damagePerRound', 'kast', 'headshotsPercentage', 'firstKills', 'firstDeaths', 'clutches'];
  for (let it = 0; it < ITERATIONS; it++) {
    const stats = {};
    for (const k of statKeys) if (rng.bool(0.5)) stats[k] = { value: 10 + rng.int(150) };
    if (rng.bool(0.5)) stats.headshotsPercentage = { displayValue: `${rng.int(60)}%` };
    const profile = evaluateLearningProfile(observedMatch('Focus#NA1', stats), 'Focus#NA1');
    const has = k => stats[k] !== undefined;
    const hsObs = has('headshotsPercentage');
    const kdObs = has('kdRatio') || (has('kills') && has('deaths'));
    assert.strictEqual(profile.radar.precisionMecanica === null, !(hsObs || kdObs), 'precisión solo con HS o KD observados');
    assert.strictEqual(profile.radar.macrogamePosicionamiento === null, !(has('kast') || has('damagePerRound')), 'macro solo con KAST o ADR');
    assert.strictEqual(profile.radar.duelosDeApertura === null, !(has('firstKills') && has('firstDeaths')), 'apertura solo con FK y FD');
    assert.strictEqual(profile.radar.composturaClutch === null, !has('clutches'), 'clutch solo con clutches');
    assert.strictEqual(profile.prescripcionInmediata === null, !hsObs, 'prescripción solo con HS observado');
    assert.deepStrictEqual(profile.eloLeaks, []);
    for (const [k, v] of Object.entries(profile.radar)) {
      assert.ok(v === null || (Number.isFinite(v) && v >= 0 && v <= 100), `radar ${k} acotado o null`);
    }
  }
});

property('contratos: sin datos => Guardian/Drift/Consenso/Coaching declaran insuficiencia', () => {
  const sinMetricas = observedMatch('Focus#NA1', {});
  const guardian = new SessionGuardian().auditSession({}, 'Focus#NA1');
  assert.strictEqual(guardian.verdict, 'INSUFFICIENT_DATA');
  assert.deepStrictEqual(guardian.prescriptions, []);
  const drift = new DriftDetector().auditMatchDrift({}, 'Focus#NA1');
  assert.strictEqual(drift.verdict, 'NO_DATA');
  assert.strictEqual(drift.overallStability, null);
  const profile = evaluateLearningProfile(sinMetricas, 'Focus#NA1');
  const consensus = new ConsensusArbiter().synthesizeConsensus(profile);
  assert.strictEqual(consensus.verdict, 'INSUFFICIENT_EVIDENCE');
  assert.ok(consensus.missing.length > 0, 'declara faltantes');
  const coaching = generateCoachingReport(sinMetricas, 'Focus#NA1');
  assert.strictEqual(coaching.insufficient, true);
  assert.deepStrictEqual(Object.keys(coaching.resources), [], 'ningún recurso sin evidencia');
});

property('contratos: recomendaciones siempre citan métrica, umbral, procedencia y limitación; no se renderizan no recomendados', () => {
  const rng = new Rng(SEED + 8);
  for (let it = 0; it < ITERATIONS; it++) {
    const kills = rng.int(30), deaths = rng.int(30);
    const text = `Focus#NA1 Jett ${kills} ${deaths} 3 200 150 25%`;
    const report = generateCoachingReport(parseTextScoreboard(text), 'Focus#NA1');
    if (report.insufficient) {
      assert.deepStrictEqual(Object.keys(report.resources), []);
      continue;
    }
    for (const r of report.recommendations) {
      assert.ok(r.metric && r.threshold && r.provenance && r.limitation, 'campos de evidencia completos');
      assert.ok(Array.isArray(r.evidence) && r.evidence.length > 0, 'evidencia citada');
      assert.ok(report.resources[r.module], 'recurso recomendado presente');
    }
    for (const key of Object.keys(report.resources)) {
      assert.ok(report.recommendations.some(r => r.module === key), 'solo recursos recomendados se exponen');
    }
    for (const key of report.unrecommended) {
      assert.ok(!report.resources[key], 'no recomendado jamás se renderiza');
    }
  }
});

property('contratos: perfiles opuestos producen salidas distintas con evidencia suficiente', () => {
  const withEconomy = (match, handle, winPct) => {
    match.data.segments.push({
      type: 'player-loadout',
      attributes: { platformUserIdentifier: handle, loadout: 'Full-Buy' },
      metadata: { platformUserHandle: handle, name: 'Full-Buy' },
      stats: {
        roundsPlayed: { value: 18 }, roundsWon: { value: Math.round(18 * winPct / 100) }, roundsLost: { value: 18 - Math.round(18 * winPct / 100) },
        roundsWinPct: { displayValue: `${winPct}%` }, kills: { value: 12 }, deaths: { value: 10 }, assists: { value: 3 },
        kDRatio: { displayValue: '1.20' }, damagePerRound: { displayValue: '150' }, scorePerRound: { displayValue: '220' }, headshotsPercentage: { displayValue: '25%' }
      }
    });
    return match;
  };
  const weak = evaluateLearningProfile(withEconomy(observedMatch('W#1', {
    headshotsPercentage: { displayValue: '12%' }, kdRatio: { displayValue: '0.60' },
    kast: { displayValue: '55%' }, damagePerRound: { displayValue: '90' },
    firstKills: { value: 1 }, firstDeaths: { value: 6 }, clutches: { value: 0 }, scorePerRound: { displayValue: '120' }
  }), 'W#1', 22), 'W#1');
  const strong = evaluateLearningProfile(withEconomy(observedMatch('S#1', {
    headshotsPercentage: { displayValue: '38%' }, kdRatio: { displayValue: '1.45' },
    kast: { displayValue: '80%' }, damagePerRound: { displayValue: '185' },
    firstKills: { value: 6 }, firstDeaths: { value: 2 }, clutches: { value: 3 }, scorePerRound: { displayValue: '280' }
  }), 'S#1', 72), 'S#1');
  assert.ok(weak.pillarsObserved.economy && strong.pillarsObserved.economy, 'economía observada en ambos');
  assert.notDeepStrictEqual(weak.radar, strong.radar, 'radares distintos');
  const cWeak = new ConsensusArbiter().synthesizeConsensus(weak);
  const cStrong = new ConsensusArbiter().synthesizeConsensus(strong);
  assert.notStrictEqual(cWeak.verdict, cStrong.verdict, 'veredictos de consenso distintos');
});

property('cli-args: permutaciones de flags no alteran posicionales ni semántica', () => {
  const rng = new Rng(SEED + 9);
  const base = ['match', 'partida.json', 'TenZ#0001'];
  const flagSet = ['--json', '--demo', '--trust-new-key'];
  for (let it = 0; it < ITERATIONS; it++) {
    const chosen = flagSet.filter(() => rng.bool(0.5));
    // Los flags se INTERCALAN sin reordenar los posicionales entre sí.
    const tokens = base.slice();
    for (const flag of chosen) tokens.splice(rng.int(tokens.length + 1), 0, flag);
    const { flags, positionals } = parseCliArgs(tokens);
    assert.deepStrictEqual(positionals, base, 'los flags nunca son posicionales ni cambian su orden');
    assert.deepStrictEqual(flags, {
      json: chosen.includes('--json'),
      demo: chosen.includes('--demo'),
      trustNewKey: chosen.includes('--trust-new-key'),
      advanced: false,
      help: false
    }, 'flags independientes del orden');
  }
  assert.throws(() => parseCliArgs(['match', '--bogus']), e => e.code === 'UNKNOWN_FLAG');
});

property('cli-args: un flag jamás se interpreta como ruta o jugador', () => {
  const cases = [
    ['--json', '--trust-new-key', 'attest', 'archivo.json', 'TenZ#0001'],
    ['attest', '--trust-new-key', '--json', 'archivo.json', 'TenZ#0001'],
    ['--demo', 'match', 'TenZ#0001', 'archivo.json']
  ];
  for (const tokens of cases) {
    const { positionals } = parseCliArgs(tokens);
    assert.ok(!positionals.some(p => p.startsWith('--')), `flag filtrado como posicional: ${positionals.join(',')}`);
  }
});

property('plan: la acción solo cita métricas observadas y es determinista', () => {
  const rng = new Rng(SEED + 10);
  const statKeys = ['kills', 'deaths', 'kdRatio', 'scorePerRound', 'damagePerRound', 'kast', 'headshotsPercentage', 'firstKills', 'firstDeaths', 'clutches'];
  for (let it = 0; it < ITERATIONS; it++) {
    const stats = {};
    for (const k of statKeys) if (rng.bool(0.5)) stats[k] = { value: 5 + rng.int(120) };
    if (rng.bool(0.5)) stats.headshotsPercentage = { displayValue: `${rng.int(60)}%` };
    const match = observedMatch('Focus#NA1', stats);
    const plan = buildPlan(match, 'Focus#NA1');
    assert.ok(plan.observado.length <= 3, 'máximo 3 observaciones');
    assert.strictEqual(plan.provenance, 'normalized_input', 'procedencia sellada');
    for (const o of plan.observado) assert.ok(o.metrica && o.valor !== null && o.valor !== undefined, 'observación con valor real');
    if (plan.accion) {
      assert.strictEqual(plan.estado, 'ACCION_DISPONIBLE');
      assert.ok(plan.accion.metrica && plan.accion.umbral !== undefined && plan.accion.procedencia && plan.accion.limitacion, 'acción completa');
      assert.ok(plan.rutina, 'acción con rutina disponible');
      const m = plan.accion.metrica;
      if (m === 'hsPct') assert.ok(stats.headshotsPercentage !== undefined, 'HS citado y observado');
      if (m === 'fdMinusFk') assert.ok(stats.firstKills !== undefined && stats.firstDeaths !== undefined, 'FD/FK citados y observados');
      assert.ok(!['legPct', 'sprayTapRatio'].includes(m), 'sin eventos de daño no se cita leg/spray');
    } else {
      assert.strictEqual(plan.estado, 'RECOLECCION_REQUERIDA');
      assert.strictEqual(plan.rutina, null, 'sin acción no hay rutina');
      assert.ok(plan.siguiente_dato.dato.length > 0, 'dato requerido explícito');
    }
    const again = buildPlan(JSON.parse(JSON.stringify(match)), 'Focus#NA1');
    assert.deepStrictEqual(plan, again, 'plan determinista');
  }
});

property('plan demo: nunca habilita acción ni etiqueta observada', () => {
  const synthetic = assembleRawMatchStructure([], 'Ascent', 24, 'F#1', { demo: true });
  synthetic.data.metadata.synthetic = true; // como lo entrega resolveMatchDataResilient en --demo
  const plan = buildPlan(synthetic, 'F#1');
  assert.strictEqual(plan.provenance, 'synthetic_demo', 'procedencia sintética');
  assert.strictEqual(plan.estado, 'SIMULACION_DEMO', 'estado explícito de simulación');
  assert.strictEqual(plan.accion, null, 'sin acción en demo');
  assert.strictEqual(plan.rutina, null, 'sin rutina en demo');
  assert.ok(plan.es_simulacion === true && plan.advertencia, 'advertencia de simulación');
  assert.ok(plan.observado.every(o => o.tipo === 'sintetica' && !/normalized_input/.test(o.fuente)), 'etiquetas sintéticas, jamás normalized_input');
});

console.log(`\n================================================================`);
console.log(`PROPERTY/FUZZ: ${passed} propiedades PASS / ${failed} FAIL (semilla ${SEED})`);
console.log(`================================================================`);
process.exit(failed === 0 ? 0 : 1);
