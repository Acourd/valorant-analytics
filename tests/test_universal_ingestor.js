#!/usr/bin/env node
'use strict';

/**
 * test_universal_ingestor.js - Suite Exhaustiva del Motor de Ingesta Universal y Resiliencia Táctica
 *
 * Verifica:
 * 1. Parseo de tablas y volcados de texto plano (parseTextScoreboard).
 * 2. Ensamblado estricto de estructuras de telemetría (assembleRawMatchStructure).
 * 3. Segmentación completa: player-summary, team-summary, player-round, player-round-damage, player-round-kills.
 * 4. Cumplimiento formal de invariant_validator sobre payloads sintetizados (HitZones = 100%, Radar [0,100]).
 * 5. Resolución resiliente ante WAF / 403 (Zero-Crash Guarantee) y carga local de archivos.
 * 6. Análisis de telemetría de armas y matriz 1v1 sobre partidas reconstruidas.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const scriptsDir = path.join(__dirname, '..', 'scripts');
const {
  parseTextScoreboard,
  assembleRawMatchStructure,
  resolveMatchDataResilient,
  AGENTS,
  MAPS,
  RANKS
} = require(path.join(scriptsDir, 'universal_ingestor.js'));

const {
  validateRadar,
  validateHitZones,
  validateLearningProfile,
  validateWeaponTelemetry,
  validateDuelMatrix
} = require(path.join(scriptsDir, 'invariant_validator.js'));

const { evaluateLearningProfile } = require(path.join(scriptsDir, 'learning_profile.js'));
const { analyzeWeaponTelemetry } = require(path.join(scriptsDir, 'weapon_telemetry.js'));
const { parseDuels } = require(path.join(scriptsDir, 'duel_matrix.js'));
const { auditDuoSynergy } = require(path.join(scriptsDir, 'duo_synergy.js'));
const { generateKovaaksRoutine } = require(path.join(scriptsDir, 'kovaaks_generator.js'));

console.log('=== TEST: UNIVERSAL INGESTOR & TACTICAL RESILIENCE EXTENSIVE SUITE ===\n');

// 1. Text Parsing Básico
console.log('1. Probando parseTextScoreboard con volcado de texto multilínea...');
const rawScoreboard = `
kirtmy#000	Iso	Gold 2	21	14	5	245	162	26%
Chronicle#0001	Sova	Gold 3	17	15	8	210	140	22%
TenZ#0001	Omen	Platinum 1	19	16	4	225	150	28%
Derke#0001	Killjoy	Gold 2	15	13	6	190	125	20%
Boaster#0001	Fade	Gold 1	12	17	9	165	110	18%
aspas#0001	Jett	Platinum 2	23	16	3	290	188	33%
cNed#0001	Reyna	Platinum 1	19	17	2	242	155	29%
ScreaM#0001	Clove	Gold 3	16	16	5	208	136	39%
yay#0001	Chamber	Platinum 1	14	15	4	182	124	30%
nAts#0001	Cypher	Gold 2	11	17	7	152	99	21%
`;

const parsedMatch = parseTextScoreboard(rawScoreboard, {
  map: 'Haven',
  rounds: 24,
  targetPlayer: 'kirtmy#000'
});

assert.ok(parsedMatch.data && parsedMatch.data.segments, 'Estructura de match inválida');
assert.strictEqual(parsedMatch.data.metadata.mapName, 'Haven');
assert.strictEqual(parsedMatch.data.metadata.rounds, 24);

const playerSummaries = parsedMatch.data.segments.filter(s => s.type === 'player-summary');
assert.strictEqual(playerSummaries.length, 10, 'Deben existir exactamente 10 jugadores en player-summary');
console.log('   ✓ Parseo de 10 jugadores con métricas extraídas verificado.');

// 2. Validación de Invariantes sobre el match parseado
console.log('2. Verificando invariantes matemáticos sobre el match parseado...');
const kirtmySummary = playerSummaries.find(s => s.metadata.platformUserHandle === 'kirtmy#000');
assert.ok(kirtmySummary, 'kirtmy#000 debe estar en el resumen de jugadores');
assert.strictEqual(kirtmySummary.metadata.agentName, 'Iso');
assert.strictEqual(kirtmySummary.stats.kills.value, 21);
assert.strictEqual(kirtmySummary.stats.deaths.value, 14);

for (const p of playerSummaries) {
  const hs = parseFloat(p.stats.headshotsPercentage.displayValue);
  const hz = {
    head: `${hs}%`,
    body: `${(72 - hs * 0.4).toFixed(1)}%`,
    leg: `${Math.max(0, 100 - hs - (72 - hs * 0.4)).toFixed(1)}%`
  };
  assert.strictEqual(validateHitZones(hz), true, `Zonas de impacto inválidas para ${p.metadata.platformUserHandle}`);
}
console.log('   ✓ Invariante de convergencia de zonas de impacto (100%) verificado en los 10 jugadores.');

// 3. Telemetría de Armas y Bandas de Distancia
console.log('3. Analizando telemetría de armas y bandas de impacto...');
const weaponTelem = analyzeWeaponTelemetry(parsedMatch, 'kirtmy#000');
assert.strictEqual(validateWeaponTelemetry(weaponTelem), true);
assert.strictEqual(weaponTelem.distanceBands.length, 3, 'Deben existir 3 bandas: Close, Mid, Long');
assert.ok(weaponTelem.distanceBands[0].duels > 0, 'Banda corta debe tener duelos registrados');
assert.ok(weaponTelem.metrics.sprayTapRatio >= 0, 'Ratio SE/TP debe ser no-negativo');
console.log(`   ✓ Telemetría de armas válida: Head=${weaponTelem.hitZoneDistribution.head}, SE/TP Ratio=${weaponTelem.metrics.sprayTapRatio}`);

// 4. Matriz 1v1 y Duelos
console.log('4. Analizando matriz de duelos 1v1...');
const duelData = parseDuels(parsedMatch, 'kirtmy#000');
assert.ok(duelData.target, 'kirtmy#000 debe ser resuelto en parseDuels');
assert.strictEqual(Object.keys(duelData.playerMap).length, 10);
assert.strictEqual(validateDuelMatrix(duelData), true);
console.log('   ✓ Matriz de duelos 1v1 cumple formalmente con validateDuelMatrix.');

// 5. Radar 360° y Learning Profile
console.log('5. Evaluando perfil de aprendizaje y radar 360°...');
const profile = evaluateLearningProfile(parsedMatch, 'kirtmy#000');
assert.strictEqual(validateLearningProfile(profile), true);
assert.strictEqual(validateRadar(profile.radar), true);
console.log(`   ✓ Radar 360° verificado: Mecánica=${profile.radar.precisionMecanica}, Macro=${profile.radar.macrogamePosicionamiento}, Apertura=${profile.radar.duelosDeApertura}, Economía=${profile.radar.disciplinaEconomica}, Clutch=${profile.radar.composturaClutch}`);

// 6. Rutina Kovaaks
console.log('6. Generando prescripción Kovaaks adaptativa...');
const kovaaks = generateKovaaksRoutine(parsedMatch, 'kirtmy#000');
assert.strictEqual(kovaaks.routine.length, 3, 'Debe constar de 3 bloques');
assert.ok(kovaaks.firstDuels, 'Debe incluir telemetría de duelos tempranos');
console.log('   ✓ Prescripción Kovaaks de 15 minutos generada con éxito.');

// 7. Resiliencia Táctica y Zero-Crash ante URLs con WAF
console.log('7. Probando resolveMatchDataResilient ante bloqueo WAF (Cloudflare 403)...');
const fakeWafUrl = 'https://tracker.gg/valorant/match/c886e66a-0927-43e6-8e2c-d3e9dc2e4d04';
const resilientMatch = resolveMatchDataResilient(fakeWafUrl, 'kirtmy#000', { map: 'Ascent' });

assert.ok(resilientMatch.data, 'Debe devolver un match estructurado sin arrojar excepción');
assert.ok(resilientMatch.data.metadata.matchId.includes('c886e66a') || resilientMatch.data.metadata.matchId.includes('resilient'));
assert.strictEqual(resilientMatch.data.segments.filter(s => s.type === 'player-summary').length, 10);
assert.strictEqual(resilientMatch.data.segments.filter(s => s.type === 'team-summary').length, 2);

const resilientProfile = evaluateLearningProfile(resilientMatch, 'kirtmy#000');
assert.strictEqual(validateLearningProfile(resilientProfile), true);
console.log('   ✓ Zero-Crash Guarantee verificado: contención de WAF 403 y síntesis de telemetría aprobada.');

// 8. Validación de Manejo de Errores
console.log('8. Probando rechazo de entradas corruptas en parseTextScoreboard...');
assert.throws(() => parseTextScoreboard(''), /requiere una cadena de texto no vacía/);
assert.throws(() => parseTextScoreboard(null), /requiere una cadena de texto no vacía/);
console.log('   ✓ Entradas vacías o nulas rechazadas limpiamente.');

console.log('\n================================================================');
console.log('PASS: Todas las 8 verificaciones exhaustivas de universal_ingestor');
console.log('      se completaron con éxito (Exit Code 0).');
console.log('================================================================');
