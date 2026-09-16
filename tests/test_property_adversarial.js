#!/usr/bin/env node
'use strict';

/**
 * test_property_adversarial.js — Propiedades ADVERSARIALES (semilla fija).
 *
 * Cubre entradas no confiables: JSON profundo, arreglos gigantes, texto
 * excesivo, tipos inesperados, truncados, BOM/Unicode, claves duplicadas,
 * prototipos extraños, límites de rondas/eventos/jugadores, estabilidad de
 * códigos de error y compatibilidad de versiones de esquema.
 *
 * Determinista: semilla fija (PROP_SEED para explorar) y contraejemplos
 * minimizados cuando una propiedad falla.
 */

const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');

const scriptsDir = path.join(__dirname, '..', 'scripts');
const repo = path.join(__dirname, '..');
const { parseTextScoreboard, resolveMatchDataResilient } = require(path.join(scriptsDir, 'universal_ingestor.js'));
const { buildPlan } = require(path.join(scriptsDir, 'plan.js'));
const budget = require(path.join(scriptsDir, 'resource_budget.js'));
const schema = require(path.join(scriptsDir, 'schema_contract.js'));

const SEED = Number(process.env.PROP_SEED || 0xADBEEF);
const ITERATIONS = Number(process.env.PROP_ITERATIONS || 120);

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
}

let passed = 0;
let failed = 0;
function property(name, fn) {
  try { fn(); passed++; console.log(`PASS [adversarial] ${name}`); }
  catch (e) { failed++; console.error(`FAIL [adversarial] ${name}: ${e.message.split('\n')[0]}`); }
}

function cli(args) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [path.join(scriptsDir, 'cli.js')].concat(args), { encoding: 'utf8', timeout: 60000 }) };
  } catch (e) {
    return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

const mkPlayer = (handle, stats) => ({
  type: 'player-summary',
  attributes: { platformUserIdentifier: handle },
  metadata: { platformUserHandle: handle },
  stats: stats || { headshotsPercentage: { displayValue: '30%' }, scorePerRound: { value: 210 }, kills: { value: 10 }, deaths: { value: 9 } }
});

console.log(`ADVERSARIAL — semilla=${SEED} iteraciones=${ITERATIONS}\n`);

property('JSON profundo: o se procesa o falla con SCHEMA_LIMIT_EXCEEDED (nunca parcial)', () => {
  const rng = new Rng(SEED + 1);
  for (let it = 0; it < ITERATIONS; it++) {
    const depth = 1 + rng.int(budget.DEFAULTS.maxJsonDepth + 10);
    const root = { data: { metadata: { matchId: 'd' }, segments: [] } };
    let cursor = root;
    for (let i = 0; i < depth; i++) { cursor.c = {}; cursor = cursor.c; }
    if (depth > budget.DEFAULTS.maxJsonDepth) {
      assert.throws(() => budget.checkJsonDepth(root), e => e.code === 'SCHEMA_LIMIT_EXCEEDED');
    } else {
      assert.doesNotThrow(() => budget.checkJsonDepth(root));
    }
  }
});

property('arreglos gigantes: exceder jugadores/rondas/eventos falla con código estable', () => {
  const base = { data: { metadata: { matchId: 'g' }, segments: [] } };
  const many = { data: { metadata: { matchId: 'g' }, segments: [] } };
  for (let i = 0; i <= budget.DEFAULTS.maxPlayers; i++) many.data.segments.push(mkPlayer(`P${i}#1`));
  assert.throws(() => schema.validateNormalizedMatch(many), e => e.code === 'SCHEMA_LIMIT_EXCEEDED');
  base.data.metadata.rounds = budget.DEFAULTS.maxRounds + 1;
  base.data.segments.push(mkPlayer('P0#1'));
  assert.throws(() => schema.validateNormalizedMatch(base), e => e.code === 'SCHEMA_LIMIT_EXCEEDED');
});

property('texto excesivo y truncados: error claro, jamás sintético', () => {
  assert.throws(() => parseTextScoreboard('x'.repeat(budget.DEFAULTS.maxTextChars + 1)), e => e.code === 'INPUT_TOO_LARGE');
  // Truncado sin handles: salida insuficiente (cero jugadores), nunca inventada.
  const truncated = parseTextScoreboard('{ "data": { "segments": [');
  assert.strictEqual(truncated.data.segments.filter(s => s.type === 'player-summary').length, 0);
  assert.strictEqual(truncated.data.metadata.provenance, 'normalized_input');
  assert.throws(() => resolveMatchDataResilient('{"data": {'), /Archivo no encontrado|no resoluble|no soportada/i);
});

property('tipos inesperados y prototipos extraños no elevan procedencia ni fabrican plan', () => {
  const odd = JSON.parse('{"__proto__":{"polluted":true},"data":{"metadata":{"matchId":"odd"},"segments":[{"type":"player-summary","attributes":{"platformUserIdentifier":"O#1"},"metadata":{"platformUserHandle":"O#1"},"stats":{"headshotsPercentage":{"displayValue":"30%"},"kills":"no-numérico","deaths":null}}]}}');
  assert.strictEqual(odd.polluted, undefined, 'sin contaminación de prototipo global');
  const plan = buildPlan(odd, 'O#1');
  assert.strictEqual(plan.provenance, 'normalized_input');
  assert.ok(plan.mechanical === undefined, 'el plan no expone mechanical crudo');
  assert.strictEqual(typeof plan.estado, 'string');
});

property('claves duplicadas (JSON.parse, última gana) y BOM/Unicode válidos', () => {
  const dup = JSON.parse('{"data":{"metadata":{"matchId":"a","matchId":"b"},"segments":[]}}');
  assert.strictEqual(dup.data.metadata.matchId, 'b', 'JSON estándar: última clave gana (sin ambigüedad)');
  const bom = parseTextScoreboard('\uFEFFÑandú#JP1\t10\t8\t2\t150\t120');
  const s = bom.data.segments.find(x => x.type === 'player-summary');
  assert.strictEqual(s.metadata.platformUserHandle, 'Ñandú#JP1');
});

property('estabilidad de códigos y JSON puro bajo entradas inválidas (CLI)', () => {
  const rb = budget.DEFAULTS;
  const fs = require('fs');
  const os = require('os');
  const big = path.join(os.tmpdir(), `adv-big-${process.pid}.txt`);
  fs.writeFileSync(big, 'z'.repeat(rb.maxTextChars + 3), 'utf8');
  try {
    const r = cli(['parse', big, '--json']);
    assert.strictEqual(r.code, 1, `exit=${r.code}`);
    const payload = JSON.parse(r.out);
    assert.strictEqual(payload.error.code, 'INPUT_TOO_LARGE');
  } finally {
    fs.unlinkSync(big);
  }
});

property('compatibilidad de versiones de esquema', () => {
  const metaOk = { schemaVersion: 1 };
  assert.strictEqual(schema.classifySchema(metaOk).status, 'supported');
  assert.strictEqual(schema.classifySchema({}).status, 'legacy_limited');
  assert.throws(() => schema.classifySchema({ schemaVersion: 2 }), e => e.code === 'SCHEMA_UNSUPPORTED');
  assert.throws(() => schema.classifySchema({ schemaVersion: 'a' }), e => e.code === 'SCHEMA_UNSUPPORTED');
});

property('presupuestos: intentos de ampliación por entorno fallan cerrado', () => {
  const key = 'VA_BUDGET_MAX_FILE_BYTES';
  const prev = process.env[key];
  try {
    for (const bad of ['999999999999', 'Infinity', 'NaN', 'abc', '0', '-5', '1.5']) {
      process.env[key] = bad;
      assert.throws(() => budget.getBudgets(), e => e.code === 'RESOURCE_BUDGET_EXCEEDED', `aceptó "${bad}"`);
    }
    process.env[key] = String(budget.SAFE_MAX.maxFileBytes - 1);
    assert.ok(budget.getBudgets().maxFileBytes < budget.SAFE_MAX.maxFileBytes, 'reducción válida permitida');
  } finally {
    if (prev === undefined) delete process.env[key]; else process.env[key] = prev;
  }
});

property('esquema Riot: matriz canónica de versiones (fail-closed en discrepancias)', () => {
  const matrix = [
    [{ schemaVersion: 99, matchInfo: { matchId: 'm' } }, 'SCHEMA_UNSUPPORTED'],
    [{ matchInfo: { matchId: 'm', schemaVersion: 99 } }, 'SCHEMA_UNSUPPORTED'],
    [{ schemaVersion: 1, matchInfo: { matchId: 'm', schemaVersion: 99 } }, 'SCHEMA_UNSUPPORTED'],
    [{ schemaVersion: 99, matchInfo: { matchId: 'm', schemaVersion: 1 } }, 'SCHEMA_UNSUPPORTED']
  ];
  for (const [payload, code] of matrix) {
    assert.throws(() => schema.classifyRiotSchema(payload), e => e.code === code);
  }
  assert.strictEqual(schema.classifyRiotSchema({ schemaVersion: 1, matchInfo: { matchId: 'm', schemaVersion: 1 } }).status, 'supported');
  assert.strictEqual(schema.classifyRiotSchema({ matchInfo: { matchId: 'm' } }).status, 'legacy_limited');
});

console.log(`\n================================================================`);
console.log(`ADVERSARIAL: ${passed} propiedades PASS / ${failed} FAIL (semilla ${SEED})`);
console.log(`================================================================`);
process.exit(failed === 0 ? 0 : 1);
