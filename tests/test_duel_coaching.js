#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const sampleFile = path.join(__dirname, '..', 'examples', 'sample_match.json');
const sample = JSON.parse(fs.readFileSync(sampleFile, 'utf8'));

const { parseDuels } = require(path.join(__dirname, '..', 'scripts', 'duel_matrix'));
const { evaluateLearningProfile } = require(path.join(__dirname, '..', 'scripts', 'learning_profile'));
const { generateCoachingReport } = require(path.join(__dirname, '..', 'scripts', 'coaching_engine'));

console.log('[TEST] Iniciando verificación de Duelos 1v1 y Coaching...');

// 1. Matriz de Duelos 1v1
const duels = parseDuels(sample, 'TenZ#0001');
assert.ok(duels.target, 'Target de duelos debe resolverse');
assert.strictEqual(Object.keys(duels.playerMap).length, 10, 'Deben existir 10 jugadores en la partida');
assert.ok(duels.duelMatrix[duels.target], 'La matriz del target debe existir');

// 2. Learning Profile (Radar 360 y Fugas)
const profile = evaluateLearningProfile(sample, 'TenZ#0001');
assert.ok(profile.radar, 'Radar de 5 pilares debe estar presente');
assert.strictEqual(profile.provenance, 'normalized_input', 'la muestra local es normalized_input (no verificada)');
assert.deepStrictEqual(profile.eloLeaks, [], 'datos normalizados no fabrican causas/fugas');
assert.ok(profile.prescripcionInmediata === null || typeof profile.prescripcionInmediata.tipo === 'string', 'Prescripción estructurada solo con HS observado');

// 3. Coaching Report
const coaching = generateCoachingReport(sample, 'TenZ#0001');
assert.ok(coaching.player.handle, 'Handle de coaching debe estar presente');
assert.ok(Array.isArray(coaching.hardOpponents), 'hardOpponents debe ser un array');
assert.ok(Array.isArray(coaching.recommendations), 'recommendations debe ser un array');
assert.ok(coaching.limitations.length > 0, 'limitaciones declaradas');
for (const r of coaching.recommendations) {
  assert.ok(r.metric && r.threshold && r.provenance && r.limitation, 'recomendación con métrica/umbral/procedencia/limitación');
  assert.ok(coaching.resources[r.module], 'recurso recomendado presente');
}
for (const key of Object.keys(coaching.resources)) {
  assert.ok(coaching.recommendations.some(r => r.module === key), 'solo recursos recomendados se exponen');
}

console.log('✓ Todas las aserciones de Duelos y Coaching pasaron exitosamente (Exit Code 0).');
