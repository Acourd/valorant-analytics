#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const sampleFile = path.join(__dirname, '..', 'examples', 'sample_match.json');
const sample = JSON.parse(fs.readFileSync(sampleFile, 'utf8'));

const { analyzeEconomy } = require(path.join(__dirname, '..', 'scripts', 'economy_analyzer'));
const { analyzeWeaponTelemetry } = require(path.join(__dirname, '..', 'scripts', 'weapon_telemetry'));

console.log('[TEST] Iniciando verificación de Economía y Telemetría de Armas...');

// 1. Economía
const eco = analyzeEconomy(sample, 'TenZ#0001');
assert.ok(eco.player, 'Jugador de economía debe estar definido');
assert.ok(Array.isArray(eco.tiers) && eco.tiers.length > 0, 'Debe identificar loadout tiers');
assert.ok(eco.tiers.every(t => typeof t.rounds === 'number' && typeof t.won === 'number' && typeof t.lost === 'number'));

// 2. Telemetría de armas: zonas observadas y distancia n/d (sin loadout)
const weapons = analyzeWeaponTelemetry(sample, 'TenZ#0001');
assert.ok(weapons.hitZoneDistribution, 'Zonas de impacto deben estar presentes');
assert.ok(weapons.hitZoneDistribution.head && weapons.hitZoneDistribution.body && weapons.hitZoneDistribution.leg);
assert.strictEqual(weapons.zoneMetrics.observed, true, 'Debe haber impactos observados');
assert.strictEqual(weapons.distanceBands, null, 'Sin posiciones no se infieren bandas de distancia');
assert.ok(/n\/d/.test(weapons.distanceNote), 'La ausencia de distancia debe declararse n/d');
assert.ok(typeof weapons.metrics.sprayTapRatio === 'number', 'Ratio SE/TP debe ser numérico');
assert.ok(weapons.recoilDiagnosis.metric && weapons.recoilDiagnosis.threshold && weapons.recoilDiagnosis.limitation, 'Diagnóstico con métrica/umbral/limitación');
if (weapons.recoilDiagnosis.kovaaksPrescription !== null) {
  assert.ok(weapons.recoilDiagnosis.prescriptionBasis.length > 0, 'Prescripción exige base/umbral documentado');
}
// Sin eventos de daño: no se prescribe y no se inventan zonas.
const empty = { data: { metadata: { matchId: 'x' }, segments: [{ type: 'player-summary', attributes: { platformUserIdentifier: 'A#1' }, metadata: { platformUserHandle: 'A#1' }, stats: {} }] } };
const none = analyzeWeaponTelemetry(empty, 'A#1');
assert.strictEqual(none.zoneMetrics.observed, false);
assert.strictEqual(none.metrics.sprayTapRatio, null, 'Sin daño no hay ratio');
assert.strictEqual(none.recoilDiagnosis.kovaaksPrescription, null, 'Sin daño no se prescribe');

console.log('✓ Todas las aserciones de Economía y Armas pasaron exitosamente (Exit Code 0).');
