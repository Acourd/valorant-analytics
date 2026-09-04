#!/usr/bin/env node
'use strict';

/**
 * test_cli.js - Integration Suite for Master CLI Dispatcher
 */

const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');

const cliPath = path.join(__dirname, '..', 'scripts', 'cli.js');
const sampleFile = path.join(__dirname, '..', 'examples', 'sample_match.json');

function cliOk(args) {
  return execFileSync(process.execPath, [cliPath].concat(args), { encoding: 'utf8' });
}

console.log('=== TEST: MASTER CLI INTEGRATION SUITE ===');

// 1. match
const outMatch = cliOk(['match', sampleFile, 'TenZ#0001']);
assert.ok(outMatch.includes('DIAGNÓSTICO 360°') && outMatch.includes('RADAR DE DOMINIO'));
console.log('✓ CLI: match command verified');

// 2. weapons
const outWeapons = cliOk(['weapons', sampleFile, 'TenZ#0001']);
assert.ok(outWeapons.includes('TELEMETRÍA DE ARMAS') && outWeapons.includes('DISTANCIA Y CONVERSIÓN'));
console.log('✓ CLI: weapons command verified');

// 3. duo
const outDuo = cliOk(['duo', sampleFile, 'TenZ#0001', 'Chronicle#0001']);
assert.ok(outDuo.includes('AUDITORÍA DE DÚO'));
console.log('✓ CLI: duo command verified');

// 4. aim
const outAim = cliOk(['aim', sampleFile, 'TenZ#0001']);
assert.ok(outAim.includes('RUTINA KOVAAKS 15-MIN'));
console.log('✓ CLI: aim command verified');

// 5. duels
const outDuels = cliOk(['duels', sampleFile, 'TenZ#0001']);
assert.ok(outDuels.includes('MATRIZ DE DUELOS 1v1'));
console.log('✓ CLI: duels command verified');

// 6. profile
const outProfile = cliOk(['profile', 'Derke#0001']);
assert.ok(outProfile.includes('OP.GG') && outProfile.includes('Derke%230001'));
console.log('✓ CLI: profile command verified');

// 7. calibrate
const outCalibrate = cliOk(['calibrate', 'Sovereign#001', 'Immortal 3', 'Duelist']);
assert.ok(outCalibrate.includes('CALIBRACIÓN INSTANTÁNEA ZERO-CLOUD'));
console.log('✓ CLI: calibrate command verified');

// 8. invariants
const outInvariants = cliOk(['invariants', sampleFile, 'TenZ#0001']);
assert.ok(outInvariants.includes('VERIFICACIÓN FORMAL DE INVARIANTES MATEMÁTICOS'));
console.log('✓ CLI: invariants command verified');

console.log('\nPASS: All Master CLI integration assertions passed with Exit Code 0.');
