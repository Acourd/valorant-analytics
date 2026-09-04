'use strict';

/**
 * test_career_autodiagnostic.js - Tests deterministas para Telemetría de Carrera,
 * Cosecha de Caché de Navegadores y Motor de Autodiagnóstico de Rango Real.
 */

const assert = require('assert');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

const { decompressBuffer, getChromiumCachePaths } = require('../scripts/browser_cache_harvester');
const { extractAccountTelemetry, aggregateCareerTelemetry, generateMilestonesTimeline, formatHours } = require('../scripts/career_telemetry');
const { evaluateMmrDrag, evaluateTalentVsEffort } = require('../scripts/autodiagnostic_engine');

// 1. Test decompressBuffer
const sampleJson = JSON.stringify({ status: "success", data: { test: 123 } });
const brotliBuf = zlib.brotliCompressSync(Buffer.from(sampleJson));
const decompBrotli = decompressBuffer(brotliBuf);
assert.ok(decompBrotli, 'Brotli debe descomprimirse con éxito');
assert.strictEqual(JSON.parse(decompBrotli.toString('utf8')).data.test, 123);

const gzipBuf = zlib.gzipSync(Buffer.from(sampleJson));
const decompGzip = decompressBuffer(gzipBuf);
assert.ok(decompGzip, 'Gzip debe descomprimirse con éxito');
assert.strictEqual(JSON.parse(decompGzip.toString('utf8')).data.test, 123);

// 2. Test formatHours
assert.strictEqual(formatHours(3600), '1h');
assert.strictEqual(formatHours(3660), '1h 1m');
assert.strictEqual(formatHours(1800), '30m');

// 3. Test extractAccountTelemetry
const mockProfile = {
  platformInfo: { platformUserHandle: 'TestUser#000' },
  metadata: { accountLevel: 111 },
  segments: [
    {
      type: 'playlist',
      attributes: { playlist: 'competitive' },
      stats: {
        timePlayed: { value: 36000, displayValue: '10h' },
        matchesPlayed: { value: 20 },
        matchesWon: { value: 12 },
        kDRatio: { displayValue: '1.40' },
        headshotsPercentage: { displayValue: '25.0%' },
        scorePerRound: { displayValue: '260.0' },
        damageDeltaPerRound: { displayValue: '35' },
        rank: { metadata: { tierName: 'Gold 3' } },
        peakRank: { displayValue: 'Diamond 1' }
      }
    },
    {
      type: 'playlist',
      attributes: { playlist: 'unrated' },
      stats: {
        timePlayed: { value: 7200, displayValue: '2h' }
      }
    }
  ]
};

const tel = extractAccountTelemetry(mockProfile, { handle: 'TestUser#000' });
assert.strictEqual(tel.handle, 'TestUser#000');
assert.strictEqual(tel.competitive.hours, 10);
assert.strictEqual(tel.casual.hours, 2);
assert.strictEqual(tel.general.hours, 12);
assert.strictEqual(tel.currentRank, 'Gold 3');
assert.strictEqual(tel.peakRank, 'Diamond 1');

// 4. Test aggregateCareerTelemetry
const mockExcluded = {
  platformInfo: { platformUserHandle: 'Brother#123' },
  segments: [
    {
      type: 'playlist',
      attributes: { playlist: 'competitive' },
      stats: { timePlayed: { value: 72000 } }
    }
  ]
};

const agg = aggregateCareerTelemetry([
  { data: mockProfile, options: { isExcluded: false } },
  { data: mockExcluded, options: { isExcluded: true } }
]);

assert.strictEqual(agg.summary.totalAccounts, 2);
assert.strictEqual(agg.summary.personalAccounts, 1);
assert.strictEqual(agg.summary.excludedAccounts, 1);
assert.strictEqual(agg.summary.totalCompetitive.hours, 10);

// 5. Test generateMilestonesTimeline
const timeline = generateMilestonesTimeline(agg);
assert.ok(Array.isArray(timeline));
assert.strictEqual(timeline.length, 6);
assert.strictEqual(timeline[0].rango, 'Hierro 3 (Inicio)');
assert.strictEqual(timeline[5].rango, 'Diamante 1');

// 6. Test evaluateMmrDrag
const dragHigh = evaluateMmrDrag({
  competitive: { matches: 650, kd: '1.25', acs: '250', dd: '30' },
  currentRank: 'Gold 3'
});
assert.strictEqual(dragHigh.mmrDragDetected, true);

const dragNormal = evaluateMmrDrag({
  competitive: { matches: 25, kd: '1.50', acs: '270', dd: '50' },
  currentRank: 'Diamond 1'
});
assert.strictEqual(dragNormal.mmrDragDetected, false);

// 7. Test evaluateTalentVsEffort
const talentEval = evaluateTalentVsEffort(agg);
assert.ok(talentEval.category.length > 0);
assert.ok(talentEval.talentRatio.includes('Talento'));
assert.ok(talentEval.trueDeservedRank.includes('Platino') || talentEval.trueDeservedRank.includes('Diamante'));

console.log('✓ Todos los tests unitarios de carrera y autodiagnóstico pasaron con éxito.');
