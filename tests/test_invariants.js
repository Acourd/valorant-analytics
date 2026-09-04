#!/usr/bin/env node
'use strict';

/**
 * test_invariants.js - Formal Mathematical Invariant Suite
 * Verifies bounds, non-NaN constraints, hit-zone convergence, and typed error handling.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  InvariantViolationError,
  validateRadar,
  validateHitZones,
  validateLearningProfile,
  validateWeaponTelemetry,
  validateDuoSynergy,
  validateDuelMatrix
} = require('../scripts/invariant_validator.js');
const { evaluateLearningProfile } = require('../scripts/learning_profile.js');
const { analyzeWeaponTelemetry } = require('../scripts/weapon_telemetry.js');
const { auditDuoSynergy } = require('../scripts/duo_synergy.js');
const { parseDuels } = require('../scripts/duel_matrix.js');

const sampleFile = path.join(__dirname, '..', 'examples', 'sample_match.json');
assert.ok(fs.existsSync(sampleFile), 'sample_match.json must exist');
const sample = JSON.parse(fs.readFileSync(sampleFile, 'utf8'));

console.log('=== TEST: FORMAL INVARIANT VERIFICATION ===');

// 1. Positive Radar Invariant
validateRadar({
  precisionMecanica: 92,
  macrogamePosicionamiento: 78,
  duelosDeApertura: 85,
  disciplinaEconomica: 80,
  composturaClutch: 75
});
console.log('✓ Radar bounds [0, 100] verified');

// 2. Positive Hit-Zones Invariant
validateHitZones({
  head: '30.0%',
  body: '68.5%',
  leg: '1.5%'
});
console.log('✓ Hit-zones sum convergence (100% +/- 0.6%) verified');

// 3. Negative Radar Invariant (Out of bounds)
assert.throws(() => {
  validateRadar({
    precisionMecanica: 110,
    macrogamePosicionamiento: 78,
    duelosDeApertura: 85,
    disciplinaEconomica: 80,
    composturaClutch: 75
  });
}, InvariantViolationError);
console.log('✓ Out-of-bounds radar properly caught by InvariantViolationError');

// 4. Negative Radar Invariant (NaN detection)
assert.throws(() => {
  validateRadar({
    precisionMecanica: NaN,
    macrogamePosicionamiento: 78,
    duelosDeApertura: 85,
    disciplinaEconomica: 80,
    composturaClutch: 75
  });
}, InvariantViolationError);
console.log('✓ NaN in radar properly caught by InvariantViolationError');

// 5. Negative Hit-Zones (Sum divergence)
assert.throws(() => {
  validateHitZones({
    head: '40.0%',
    body: '40.0%',
    leg: '10.0%' // sums to 90%
  });
}, InvariantViolationError);
console.log('✓ Divergent hit-zone sum properly caught');

// 6. Match Fixture Full Vector Invariant Validation
const profile = evaluateLearningProfile(sample, 'TenZ#0001');
validateLearningProfile(profile);

const weaponTelemetry = analyzeWeaponTelemetry(sample, 'TenZ#0001');
validateWeaponTelemetry(weaponTelemetry);

const duoSynergy = auditDuoSynergy(sample, 'TenZ#0001', 'Chronicle#0001');
validateDuoSynergy(duoSynergy);

const duelMatrix = parseDuels(sample, 'TenZ#0001');
validateDuelMatrix(duelMatrix);

console.log('✓ Full match fixture formal invariants verified');
console.log('\nPASS: All formal invariant assertions passed with Exit Code 0.');
