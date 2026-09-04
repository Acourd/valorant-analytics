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
assert.ok(Array.isArray(profile.eloLeaks) && profile.eloLeaks.length > 0, 'Debe identificar fugas de ELO');
assert.ok(profile.prescripcionInmediata.reglaMental, 'Regla mental debe estar definida');

// 3. Coaching Report
const coaching = generateCoachingReport(sample, 'TenZ#0001');
assert.ok(coaching.player.handle, 'Handle de coaching debe estar presente');
assert.ok(Array.isArray(coaching.hardOpponents), 'hardOpponents debe ser un array');
assert.ok(coaching.resources.iso_site_entry, 'Módulo de recursos iso_site_entry debe estar presente');

console.log('✓ Todas las aserciones de Duelos y Coaching pasaron exitosamente (Exit Code 0).');
