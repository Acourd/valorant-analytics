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

// 2. Telemetría de armas y bandas de distancia
const weapons = analyzeWeaponTelemetry(sample, 'TenZ#0001');
assert.ok(weapons.hitZoneDistribution, 'Zonas de impacto deben estar presentes');
assert.ok(weapons.hitZoneDistribution.head && weapons.hitZoneDistribution.body && weapons.hitZoneDistribution.leg);
assert.strictEqual(weapons.distanceBands.length, 3, 'Deben existir exactamente 3 bandas de distancia (Close/Mid/Long)');
assert.ok(typeof weapons.metrics.sprayTapRatio === 'number', 'Ratio SE/TP debe ser numérico');
assert.ok(weapons.recoilDiagnosis.kovaaksPrescription.length > 0, 'Debe prescribir ejercicio de Kovaaks para recoil');

console.log('✓ Todas las aserciones de Economía y Armas pasaron exitosamente (Exit Code 0).');
