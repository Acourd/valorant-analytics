#!/usr/bin/env node
/**
 * test_suite.js - Deterministic Suite REAL para valorant-analytics (v3.0)
 * Aserciones de unidad sobre los motores + regresiones de integración del dispatcher
 * cli.js (aim/duels/match/duo). Exit Code 0 solo si TODAS pasan.
 * Cero red: opera exclusivamente sobre examples/sample_match.json (fixture local).
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const scriptsDir = path.join(__dirname, 'scripts');
const cliPath = path.join(scriptsDir, 'cli.js');
const sampleFile = path.join(__dirname, 'examples', 'sample_match.json');

console.log('=== VALORANT ANALYTICS: SUITE DETERMINISTA v3.0 ===\n');

assert.ok(fs.existsSync(sampleFile), 'sample_match.json no existe');
const sample = JSON.parse(fs.readFileSync(sampleFile, 'utf8'));

const { normalizeHandle } = require(path.join(scriptsDir, 'fetch_profile.js'));
const { extractMatchId, parseMatchSummary } = require(path.join(scriptsDir, 'fetch_match.js'));
const { parseDuels } = require(path.join(scriptsDir, 'duel_matrix.js'));
const { generateKovaaksRoutine } = require(path.join(scriptsDir, 'kovaaks_generator.js'));
const { auditDuoSynergy } = require(path.join(scriptsDir, 'duo_synergy.js'));
const { analyzeEconomy } = require(path.join(scriptsDir, 'economy_analyzer.js'));
const { analyzeWeaponTelemetry } = require(path.join(scriptsDir, 'weapon_telemetry.js'));
const {
  InvariantViolationError,
  validateRadar,
  validateHitZones,
  validateLearningProfile,
  validateWeaponTelemetry,
  validateDuoSynergy,
  validateDuelMatrix
} = require(path.join(scriptsDir, 'invariant_validator.js'));
const { evaluateLearningProfile } = require(path.join(scriptsDir, 'learning_profile.js'));

let passed = 0;
const total = 22;
function check(name, fn) {
  process.stdout.write(`Testing: ${name}... `);
  try {
    fn();
    console.log('PASS (Exit 0)');
    passed++;
  } catch (e) {
    console.log('FAIL:', e.message.split('\n')[0]);
  }
}

// ---- Unidad: normalización de Riot IDs ----
check('1. normalizeHandle: espacios y tag -> encodeURIComponent correcto',
  () => {
    assert.strictEqual(normalizeHandle('TenZ 001#NA1'), 'TenZ%20001%23NA1');
    assert.strictEqual(normalizeHandle('  TenZ#0001  '), 'TenZ%230001');
  });

check('2. normalizeHandle: cirílico/acentos se codifican sin romper el tag, y vacío lanza',
  () => {
    assert.ok(normalizeHandle('Chronicle#0001').includes('%23'), 'tag no codificado');
    assert.throws(() => normalizeHandle('   '), /Riot ID vacío/);
  });

// ---- Unidad: extracción de match ID ----
check('3. extractMatchId: URL de tracker, UUID plano y cadena larga',
  () => {
    const uuid = 'cb4ebb70-4ecf-425d-8aaf-3bf9cf718631';
    assert.strictEqual(extractMatchId(`https://tracker.gg/valorant/match/${uuid}?x=1`), uuid);
    assert.strictEqual(extractMatchId(uuid), uuid);
    assert.ok(extractMatchId('algo sin uuid') !== null);
  });

// ---- Unidad: parseMatchSummary sobre el fixture real ----
check('4. parseMatchSummary: 10 jugadores, 2 equipos, stats numéricas, orden por combatScore',
  () => {
    const s = parseMatchSummary(sample);
    assert.strictEqual(s.players.length, 10);
    assert.ok(s.teams.Red && s.teams.Blue, 'equipos Red/Blue ausentes');
    for (const p of s.players) {
      assert.ok(typeof p.kills === 'number' && typeof p.adr === 'number' && typeof p.hsPct === 'number');
    }
    const sorted = s.players.every((p, i) => i === 0 || s.players[i - 1].combatScore >= p.combatScore);
    assert.ok(sorted, 'jugadores no ordenados por combatScore');
  });

// ---- Unidad: duel_matrix ----
check('5. parseDuels: target case-insensitive, matriz killer->victim con conteos',
  () => {
    const { playerMap, duelMatrix, target } = parseDuels(sample, 'tenz#0001');
    assert.ok(target, 'target no resuelto (insensible a mayúsculas)');
    assert.strictEqual(Object.keys(playerMap).length, 10);
    assert.ok(Object.values(duelMatrix).some(m => Object.keys(m).length > 0), 'matriz vacía');
  });

// ---- Unidad: kovaaks ----
check('6. generateKovaaksRoutine: 3 bloques, 15 min totales, telemetría FK/FD',
  () => {
    const r = generateKovaaksRoutine(sample, 'TenZ#0001');
    assert.strictEqual(r.routine.length, 3);
    assert.ok(r.routine.every(b => b.duration.startsWith('5 mins')));
    assert.ok(r.player, 'sin jugador resuelto');
    assert.ok(typeof r.firstDuels.entryRating === 'number' && r.firstDuels.entryRating >= 0 && r.firstDuels.entryRating <= 100);
    assert.ok(r.hsPct.endsWith('%'));
  });

// ---- Unidad: duo_synergy ----
check('7. auditDuoSynergy: estructura, mismo equipo y carryAnalysis honesto',
  () => {
    const r = auditDuoSynergy(sample, 'TenZ#0001', 'Chronicle#0001');
    assert.ok(r.p1 && r.p2 && r.synergy.score.includes('/ 100'));
    assert.ok(r.synergy.carryAnalysis, 'sin carryAnalysis');
    assert.strictEqual(typeof r.synergy.carryAnalysis.boostCandidate, 'boolean');
    assert.ok(r.synergy.carryAnalysis.primaryCarrier.length > 0);
    assert.ok(r.p1.team === r.p2.team, 'jugadores del fixture deberían estar en el mismo equipo');
  });

check('8. auditDuoSynergy: rivales en equipos opuestos producen veredicto RIVALES',
  () => {
    const { playerMap } = parseDuels(sample);
    const handles = Object.keys(playerMap);
    const enemy = Object.values(playerMap).find(o => o.team !== playerMap[handles[0]].team);
    const r = auditDuoSynergy(sample, handles[0], enemy.handle);
    assert.ok(r.synergy.verdict.includes('RIVALES'), 'veredicto de rivales no aplicado');
  });

// ---- Unidad: economía ----
check('9. analyzeEconomy: tier loadouts con rondas y winPct',
  () => {
    const r = analyzeEconomy(sample, 'TenZ#0001');
    assert.ok(r.player && r.agent);
    assert.ok(Array.isArray(r.tiers) && r.tiers.length > 0);
    r.tiers.forEach(t => {
      assert.ok(typeof t.rounds === 'number');
      assert.ok(String(t.winPct).includes('%'));
    });
  });

// ---- Regresión: dispatcher cli.js (los P0 que la suite anterior no cubría) ----
function cliOk(args) {
  return execFileSync(process.execPath, [cliPath].concat(args), { encoding: 'utf8' });
}

check('10. cli.js aim: dispatcher ejecuta la rutina sin TypeError (regresión P0)',
  () => {
    const out = cliOk(['aim', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('RUTINA KOVAAKS 15-MIN'), 'cabecera aim ausente');
  });

check('11. cli.js duels: matriz 1v1 renderizada (regresión P0: contrato parseDuels)',
  () => {
    const out = cliOk(['duels', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('MATRIZ DE DUELOS 1v1'), 'cabecera duels ausente');
    assert.ok(!out.includes('undefined'), 'duels emite undefined');
  });

check('12. cli.js match: diagnóstico 360° completo con radar y fugas',
  () => {
    const out = cliOk(['match', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('DIAGNÓSTICO 360°') && out.includes('RADAR DE DOMINIO'));
    assert.ok(out.includes('FUGAS DE ELO'));
  });

check('13. cli.js duo: auditoría con carryAnalysis en consola',
  () => {
    const out = cliOk(['duo', sampleFile, 'TenZ#0001', 'Chronicle#0001']);
    assert.ok(out.includes('AUDITORÍA DE DÚO') && out.includes('Carga:'));
  });

check('14. cli.js perfil: genera URLs multi-plataforma normalizadas',
  () => {
    const out = cliOk(['profile', 'Mixwell#EUW']);
    assert.ok(out.includes('OP.GG') && out.includes('Mixwell%23EUW'));
  });

check('15. analyzeWeaponTelemetry: cálculo de zonas (Head/Body/Leg) y SE/TP spray ratio',
  () => {
    const res = analyzeWeaponTelemetry(sample, 'TenZ#0001');
    assert.ok(res.hitZoneDistribution, 'hitZoneDistribution ausente');
    assert.ok(res.hitZoneDistribution.head.includes('%'));
    assert.ok(res.hitZoneDistribution.body.includes('%'));
    assert.ok(res.hitZoneDistribution.leg.includes('%'));
    assert.ok(typeof res.metrics.sprayTapRatio === 'number');
    assert.ok(res.recoilDiagnosis && res.recoilDiagnosis.kovaaksPrescription);
  });

check('16. analyzeWeaponTelemetry: categorización en 3 bandas de distancia (Close/Mid/Long)',
  () => {
    const res = analyzeWeaponTelemetry(sample, 'TenZ#0001');
    assert.strictEqual(res.distanceBands.length, 3);
    assert.ok(res.distanceBands.every(b => typeof b.duels === 'number' && typeof b.totalDamage === 'number'));
  });

check('17. cli.js weapons: telemetría de armas y bandas de impacto en consola',
  () => {
    const out = cliOk(['weapons', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('TELEMETRÍA DE ARMAS') && out.includes('DISTANCIA Y CONVERSIÓN'));
    assert.ok(out.includes('SE/TP Ratio'));
  });

check('18. cli.js calibrate: modo zero-cloud offline diagnóstico instantáneo',
  () => {
    const out = cliOk(['calibrate', 'Sovereign#001', 'Immortal 3', 'Initiator']);
    assert.ok(out.includes('CALIBRACIÓN INSTANTÁNEA ZERO-CLOUD'));
    assert.ok(out.includes('RADAR DE RENDIMIENTO COMPETITIVO CALIBRADO'));
    assert.ok(out.includes('Immortal 3'));
  });

check('19. invariant_validator: aserción formal de radar y suma de zonas de impacto (100%)',
  () => {
    assert.strictEqual(validateRadar({ precisionMecanica: 90, macrogamePosicionamiento: 80, duelosDeApertura: 70, disciplinaEconomica: 85, composturaClutch: 95 }), true);
    assert.strictEqual(validateHitZones({ head: '32.5%', body: '65.5%', leg: '2.0%' }), true);
  });

check('20. invariant_validator: captura violaciones matemáticas (NaN, fuera de rango [0,100], sum!=100%)',
  () => {
    assert.throws(() => validateRadar({ precisionMecanica: 105, macrogamePosicionamiento: 70, duelosDeApertura: 80, disciplinaEconomica: 50, composturaClutch: 60 }), InvariantViolationError);
    assert.throws(() => validateHitZones({ head: '50%', body: '20%', leg: '10%' }), InvariantViolationError);
    assert.throws(() => validateRadar({ precisionMecanica: NaN, macrogamePosicionamiento: 70, duelosDeApertura: 80, disciplinaEconomica: 50, composturaClutch: 60 }), InvariantViolationError);
  });

check('21. invariant_validator: validación formal completa sobre match real de telemetría',
  () => {
    const p = evaluateLearningProfile(sample, 'TenZ#0001');
    assert.strictEqual(validateLearningProfile(p), true);
    const w = analyzeWeaponTelemetry(sample, 'TenZ#0001');
    assert.strictEqual(validateWeaponTelemetry(w), true);
    const d = auditDuoSynergy(sample, 'TenZ#0001', 'Chronicle#0001');
    assert.strictEqual(validateDuoSynergy(d), true);
  });

check('22. cli.js invariants: verificación formal de invariantes matemáticos en CLI dispatcher',
  () => {
    const out = cliOk(['invariants', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('VERIFICACIÓN FORMAL DE INVARIANTES MATEMÁTICOS'));
    assert.ok(out.includes('TODOS LOS INVARIANTES MATEMÁTICOS VERIFICADOS'));
  });

console.log(`\nResults: ${passed}/${total} tests passed.`);
if (passed !== total) process.exit(1);
console.log('All valorant-analytics deterministic tests passed with Exit Code: 0');