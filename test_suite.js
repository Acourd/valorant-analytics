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
const os = require('os');
const { execFileSync } = require('child_process');

const scriptsDir = path.join(__dirname, 'scripts');
const cliPath = path.join(scriptsDir, 'cli.js');
const sampleFile = path.join(__dirname, 'examples', 'sample_match.json');

console.log('=== VALORANT ANALYTICS: SUITE DETERMINISTA v3.0 ===\n');

assert.ok(fs.existsSync(sampleFile), 'sample_match.json no existe');
const sample = JSON.parse(fs.readFileSync(sampleFile, 'utf8'));

const { normalizeHandle } = require(path.join(scriptsDir, 'fetch_profile.js'));
const { extractMatchId, parseMatchSummary, fetchMatch, CANONICAL_MATCH_ID } = require(path.join(scriptsDir, 'fetch_match.js'));
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
  validateDuelMatrix,
  reconcileDuelMatrix
} = require(path.join(scriptsDir, 'invariant_validator.js'));
const { evaluateLearningProfile } = require(path.join(scriptsDir, 'learning_profile.js'));
const {
  parseTextScoreboard,
  assembleRawMatchStructure,
  resolveMatchDataResilient
} = require(path.join(scriptsDir, 'universal_ingestor.js'));
const { decompressBuffer, getChromiumCachePaths, extractFromCacheDirectory } = require(path.join(scriptsDir, 'browser_cache_harvester.js'));
const { extractAccountTelemetry, aggregateCareerTelemetry, generateMilestonesTimeline } = require(path.join(scriptsDir, 'career_telemetry.js'));
const { evaluateMmrDrag, evaluateTalentVsEffort } = require(path.join(scriptsDir, 'autodiagnostic_engine.js'));

let passed = 0;
let total = 0;
function check(name, fn) {
  total++;
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

function isolatedCache() {
  const tmpCache = fs.mkdtempSync(path.join(os.tmpdir(), 'va-cache-'));
  const prev = process.env.VALORANT_CACHE_DIR;
  process.env.VALORANT_CACHE_DIR = tmpCache;
  return {
    tmpCache,
    restore() {
      if (prev === undefined) delete process.env.VALORANT_CACHE_DIR;
      else process.env.VALORANT_CACHE_DIR = prev;
      fs.rmSync(tmpCache, { recursive: true, force: true });
    }
  };
}

function withIsolatedCache(fn) {
  const iso = isolatedCache();
  try {
    return fn(iso.tmpCache);
  } finally {
    iso.restore();
  }
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

check('23. cli.js attest: sobre DSSE in-toto firmado con Ed25519 y verificado',
  () => {
    withIsolatedCache(() => {
      const out = cliOk(['attest', sampleFile, 'TenZ#0001', '--trust-new-key']);
      assert.ok(out.includes('ATESTACI') , 'cabecera attest ausente');
      assert.ok(out.includes('VERIFICADO contra keystore (Ed25519 OK)'), 'verificación contra keystore ausente');
      assert.ok(out.includes('Almac'), 'keystore no declarado en salida');
    });
  });

check('24. cli.js merkle: árbol Merkle de eventos discretos y prueba de inclusión',
  () => {
    const out = cliOk(['merkle', sampleFile]);
    assert.ok(out.includes('ÁRBOL DE AUDITORÍA MERKLE'));
    assert.ok(out.includes('VÁLIDA (Exit 0)'));
  });

check('25. cli.js guardian: monitor de fatiga neuromuscular y tilt cognitivo',
  () => {
    const out = cliOk(['guardian', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('SESSION GUARDIAN'));
    assert.ok(out.includes('Apto para competir'));
  });

check('26. cli.js drift: cálculo de deriva táctica y entropía de Shanon',
  () => {
    const out = cliOk(['drift', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('RADAR DE DERIVA TÁCTICA'));
    assert.ok(out.includes('Entropía de Quarters'));
  });

check('27. cli.js consensus: arbitraje bizantino multi-lente con quórum BFT',
  () => {
    const out = cliOk(['consensus', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('SÍNTESIS DE CONSENSO BIZANTINO'));
    assert.ok(out.includes('Lentes Participantes:  3'));
  });

check('28. cli.js synthesize: rutina evolutiva adaptativa según debilidades de match',
  () => {
    const out = cliOk(['synthesize', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('RUTINA EVOLUTIVA ADAPTATIVA'));
    assert.ok(out.includes('EJERCICIOS SINTETIZADOS'));
  });

check('29. cli.js sbom: manifiesto CycloneDX v1.5 con 0 dependencias externas',
  () => {
    const out = cliOk(['sbom']);
    assert.ok(out.includes('MANIFIESTO CYCLONEDX SBOM'));
    assert.ok(out.includes('Dependencias NPM:   0'));
  });

// ---- universal_ingestor & resiliencia táctica (v1.2) ----
check('30. universal_ingestor: parseTextScoreboard extrae handles, rangos y estadísticas de texto plano',
  () => {
    const raw = `
kirtmy#000	Iso	Gold 2	21	14	5	245	162	26%
Chronicle#0001	Sova	Gold 3	17	15	8	210	140	22%
TenZ#0001	Omen	Platinum 1	19	16	4	225	150	28%
    `.trim();
    const match = parseTextScoreboard(raw, { map: 'Haven', rounds: 24, targetPlayer: 'kirtmy#000' });
    assert.strictEqual(match.data.metadata.mapName, 'Haven');
    const summaries = match.data.segments.filter(s => s.type === 'player-summary');
    assert.strictEqual(summaries.length, 10);
    const k = summaries.find(s => s.metadata.platformUserHandle === 'kirtmy#000');
    assert.ok(k && k.stats.kills.value === 21 && k.stats.deaths.value === 14);
  });

check('31. universal_ingestor: assembleRawMatchStructure genera 10 jugadores, 2 equipos y zonas al 100%',
  () => {
    const synthetic = assembleRawMatchStructure([], 'Ascent', 24, 'kirtmy#000');
    assert.strictEqual(synthetic.data.segments.filter(s => s.type === 'team-summary').length, 2);
    const summaries = synthetic.data.segments.filter(s => s.type === 'player-summary');
    assert.strictEqual(summaries.length, 10);
    summaries.forEach(p => {
      const hs = parseFloat(p.stats.headshotsPercentage.displayValue);
      const hz = {
        head: `${hs}%`,
        body: `${(72 - hs * 0.4).toFixed(1)}%`,
        leg: `${Math.max(0, 100 - hs - (72 - hs * 0.4)).toFixed(1)}%`
      };
      assert.strictEqual(validateHitZones(hz), true);
    });
  });

check('32. universal_ingestor: cumplimiento formal de invariant_validator sobre telemetría sintetizada',
  () => {
    const synthetic = assembleRawMatchStructure([], 'Ascent', 24, 'kirtmy#000');
    const p = evaluateLearningProfile(synthetic, 'kirtmy#000');
    assert.strictEqual(validateLearningProfile(p), true);
    assert.strictEqual(validateRadar(p.radar), true);
    const w = analyzeWeaponTelemetry(synthetic, 'kirtmy#000');
    assert.strictEqual(validateWeaponTelemetry(w), true);
  });

check('33. universal_ingestor: resolveMatchDataResilient intercepta WAF 403 con contención fail-closed',
  () => {
    const fakeWafUrl = 'https://tracker.gg/valorant/match/c886e66a-0927-43e6-8e2c-d3e9dc2e4d04';
    assert.throws(
      () => resolveMatchDataResilient(fakeWafUrl, 'kirtmy#000', { map: 'Ascent' }),
      /Sin telemetría verificable/
    );
    const match = resolveMatchDataResilient(fakeWafUrl, 'kirtmy#000', { map: 'Ascent', allowSynthetic: true });
    assert.ok(match && match.data && match.data.segments);
    assert.strictEqual(match.data.segments.filter(s => s.type === 'player-summary').length, 10);
    assert.strictEqual(match.data.metadata.wafContainment, true);
    assert.strictEqual(match.data.metadata.synthetic, true);
  });

check('34. cli.js parse: dispatcher procesa archivo de volcado de texto sin errores',
  () => {
    const tmpScoreboard = path.join(scriptsDir, '..', 'examples', 'scoreboard_sample.txt');
    fs.writeFileSync(tmpScoreboard, 'kirtmy#000\tIso\tGold 2\t21\t14\t5\t245\t162\t26%\n', 'utf8');
    try {
      const out = cliOk(['parse', tmpScoreboard, 'kirtmy#000']);
      assert.ok(out.includes('INGESTA UNIVERSAL') && out.includes('kirtmy#000'));
    } finally {
      if (fs.existsSync(tmpScoreboard)) fs.unlinkSync(tmpScoreboard);
    }
  });

check('35. cli.js match (WAF resilient): URL remota protegida ejecuta Zero-Crash con Exit Code 0',
  () => {
    const out = cliOk(['match', 'https://tracker.gg/valorant/match/c886e66a-0927-43e6-8e2c-d3e9dc2e4d04', 'kirtmy#000', '--demo']);
    assert.ok(out.includes('DIAGNÓSTICO 360°') && out.includes('kirtmy#000'));
    assert.ok(out.includes('RADAR DE DOMINIO'));
    assert.ok(out.includes('SINTÉTICA'), 'modo demo debe declarar procedencia sintética');
  });

check('36. browser_cache_harvester: decompressBuffer y detección de rutas Chromium',
  () => {
    const raw = Buffer.from(JSON.stringify({ ok: true, timestamp: Date.now() }));
    const zlib = require('zlib');
    const br = zlib.brotliCompressSync(raw);
    const dec = decompressBuffer(br);
    assert.ok(dec && JSON.parse(dec.toString('utf8')).ok === true);
    const paths = getChromiumCachePaths();
    assert.ok(Array.isArray(paths));
  });

check('37. career_telemetry: desglose de horas competitivas vs general y cronología de hitos',
  () => {
    const mock = {
      platformInfo: { platformUserHandle: 'kirtmy#000' },
      segments: [{
        type: 'playlist',
        attributes: { playlist: 'competitive' },
        stats: {
          timePlayed: { value: 360000, displayValue: '100h' },
          matchesPlayed: { value: 180 },
          rank: { metadata: { tierName: 'Gold 3' } },
          peakRank: { displayValue: 'Platinum 1' }
        }
      }]
    };
    const tel = extractAccountTelemetry(mock, { handle: 'kirtmy#000' });
    assert.strictEqual(tel.competitive.hours, 100);
    const agg = aggregateCareerTelemetry([{ telemetry: tel }]);
    const tl = generateMilestonesTimeline(agg);
    assert.strictEqual(tl.length, 6);
    assert.strictEqual(tl[0].rango, 'Hierro 3 (Inicio)');
  });

check('38. autodiagnostic_engine: diagnóstico de MMR drag, verdadero rango merecido y ratio de talento',
  () => {
    const drag = evaluateMmrDrag({
      competitive: { matches: 500, kd: '1.20', acs: '240', dd: '25' },
      currentRank: 'Gold 3'
    });
    assert.strictEqual(drag.mmrDragDetected, true);
    const agg = {
      accounts: [{
        isExcluded: false,
        competitive: { matches: 18, kd: '1.53', acs: '277', dd: '52', hs: '23.8%' },
        peakRank: 'Diamond 1'
      }],
      summary: {
        totalGeneral: { hours: 650 },
        highestPeakRank: 'Diamond 1'
      }
    };
    const evalRes = evaluateTalentVsEffort(agg);
    assert.ok(evalRes.category.includes('TALENTO'));
    assert.ok(evalRes.trueDeservedRank.includes('Platino') || evalRes.trueDeservedRank.includes('Diamante'));
  });

check('39. cli.js career & diagnose: ejecución exitosa de los nuevos comandos con Exit Code 0',
  () => {
    const mockFile = path.join(__dirname, 'examples', 'mock_profile.json');
    const mockData = {
      platformInfo: { platformUserHandle: 'Test#0001' },
      segments: [{
        type: 'playlist',
        attributes: { playlist: 'competitive' },
        stats: {
          timePlayed: { value: 72000, displayValue: '20h' },
          matchesPlayed: { value: 35 },
          kDRatio: { displayValue: '1.25' },
          headshotsPercentage: { displayValue: '22.0%' },
          scorePerRound: { displayValue: '240.0' },
          damageDeltaPerRound: { displayValue: '28' },
          rank: { metadata: { tierName: 'Gold 3' } },
          peakRank: { displayValue: 'Platinum 1' }
        }
      }]
    };
    fs.writeFileSync(mockFile, JSON.stringify(mockData), 'utf8');
    try {
      const careerOut = cliOk(['career', mockFile, 'Test#0001']);
      assert.ok(careerOut.includes('AUDITORÍA DE CARRERA'));
      const diagOut = cliOk(['diagnose', mockFile, 'Test#0001']);
      assert.ok(diagOut.includes('AUTODIAGNÓSTICO INTEGRAL'));
    } finally {
      if (fs.existsSync(mockFile)) fs.unlinkSync(mockFile);
    }
  });

// ---- Blindaje adversarial v4.1: casos límite y edge cases ----

check('40. harvester: cacheDir inexistente y data_1 truncado no lanzan (retornan [])',
  () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harv-edge-'));
    try {
      assert.deepStrictEqual(extractFromCacheDirectory(path.join(tmp, 'no-existe'), null), []);
      const truncDir = path.join(tmp, 'trunc');
      fs.mkdirSync(truncDir);
      fs.writeFileSync(path.join(truncDir, 'data_1'), Buffer.alloc(100));
      const res = extractFromCacheDirectory(truncDir, null);
      assert.ok(Array.isArray(res), 'debe retornar array aunque el blockfile esté truncado');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('41. ingestor: options.matchId determinista y sin random en contrato',
  () => {
    const r = assembleRawMatchStructure([], 'Ascent', 24, 'Test#0001', { matchId: 'resilient-test-001' });
    assert.strictEqual(r.data.metadata.matchId, 'resilient-test-001');
    assert.strictEqual(r.data.segments.filter(s => s.type === 'player-summary').length, 10);
    assert.strictEqual(r.data.metadata.rounds, 24);
  });

check('42. ingestor: archivo JSON corrupto lanza Error descriptivo (fail-closed, sin sintético)',
  () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ing-edge-'));
    try {
      const bad = path.join(tmp, 'corrupto.json');
      fs.writeFileSync(bad, '{"data": {"segments": [INVALIDO');
      assert.throws(() => resolveMatchDataResilient(bad, 'Test#0001'), /JSON corrupto/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('43. ingestor: parseTextScoreboard rechaza cadena vacía con mensaje descriptivo',
  () => {
    assert.throws(() => parseTextScoreboard(''), /no vacía/);
    assert.throws(() => parseTextScoreboard(null), /no vacía/);
  });

check('44. autodiagnostic: null/malformado lanza Error descriptivo, no TypeError',
  () => {
    assert.throws(() => evaluateMmrDrag(null), /requiere telemetría de cuenta/);
    assert.throws(() => evaluateMmrDrag('cadena'), /requiere telemetría de cuenta/);
    assert.throws(() => evaluateTalentVsEffort(null), /careerReport/);
    assert.throws(() => evaluateTalentVsEffort({ accounts: [] }), /summary/);
    assert.throws(() => evaluateTalentVsEffort({ accounts: [{ competitive: {} }], summary: {} }), /totalGeneral/);
  });

check('45. career milestones: opciones personalizadas (mainAgent/speedrunHours) sin hardcode',
  () => {
    const career = {
      summary: {
        totalCompetitive: { hours: 300 },
        totalGeneral: { hours: 400 },
        highestPeakRank: 'Diamond 1'
      },
      accounts: [{ peakRank: 'Diamond 1', competitive: { hours: 12.5 }, handle: 'X#1', isExcluded: false }]
    };
    const t1 = generateMilestonesTimeline(career, { mainAgent: 'Jett', speedrunHours: 12.5 });
    assert.ok(t1.some(m => m.contexto.includes('Jett')), 'mainAgent no aplicado');
    assert.ok(t1.some(m => m.tramoHoras === 12.5), 'speedrunHours no aplicado');
    const t2 = generateMilestonesTimeline(career);
    assert.ok(t2.some(m => m.contexto.includes('Iso')), 'default Iso no preservado');
  });

check('46. autodiagnostic: cuenta malformada parcial no truena en agregados',
  () => {
    const career = {
      summary: { totalGeneral: { hours: 200 }, highestPeakRank: 'Gold 3' },
      accounts: [{ handle: 'A#1', isExcluded: false }, { handle: 'B#1', isExcluded: false, competitive: { matches: 10, kd: '1.2', acs: '230', dd: '18', hs: '25' }, peakRank: 'Gold 2' }]
    };
    const r = evaluateTalentVsEffort(career);
    assert.ok(r.telemetrySummary.totalCompetitiveMatches >= 10, 'matches no agregados');
    assert.ok(r.category.length > 0 && r.talentRatio.includes('/'), 'categoría incompleta');
  });

check('47. learning_profile: match sin jugadores válidos lanza Error descriptivo (fail-closed)',
  () => {
    assert.throws(
      () => evaluateLearningProfile({ data: { segments: [] } }, 'TenZ#0001'),
      /No se encontraron jugadores válidos/
    );
  });

check('48. duo_synergy: handles vacíos/ausentes lanzan Error descriptivo en vez de TypeError',
  () => {
    assert.throws(
      () => auditDuoSynergy(sample, null, 'Chronicle#0001'),
      /auditDuoSynergy requiere dos Riot IDs/
    );
    assert.throws(
      () => auditDuoSynergy(sample, 'TenZ#0001', undefined),
      /auditDuoSynergy requiere dos Riot IDs/
    );
  });

check('49. economy_analyzer: sintetiza tiers a partir de player-round si faltan player-loadout',
  () => {
    const matchWithoutLoadouts = {
      data: {
        segments: [
          { type: 'player-summary', attributes: { platformUserIdentifier: 'User#123' }, metadata: { platformUserHandle: 'User#123', agentName: 'Iso' } },
          { type: 'player-round', attributes: { platformUserIdentifier: 'User#123', round: 1 }, stats: { loadoutValue: { value: 800 }, kills: { value: 1 }, deaths: { value: 0 }, damage: { value: 150 }, score: { value: 200 } }, metadata: { hasWon: true } },
          { type: 'player-round', attributes: { platformUserIdentifier: 'User#123', round: 2 }, stats: { loadoutValue: { value: 4200 }, kills: { value: 2 }, deaths: { value: 1 }, damage: { value: 280 }, score: { value: 350 } }, metadata: { hasWon: false } }
        ]
      }
    };
    const eco = analyzeEconomy(matchWithoutLoadouts, 'User#123');
    assert.strictEqual(eco.player, 'User#123');
    assert.ok(eco.tiers.length > 0, 'Debe sintetizar tiers desde player-round');
    assert.ok(eco.tiers.some(t => t.tier === 'Pistol'));
    assert.ok(eco.tiers.some(t => t.tier === 'Full-Buy'));
  });

check('50. cli.js duels: dispatcher sin jugador resuelve target automáticamente con Exit Code 0',
  () => {
    const out = execFileSync(process.execPath, [cliPath, 'duels', sampleFile], { encoding: 'utf8' });
    assert.ok(out.includes('MATRIZ DE DUELOS 1v1 DIRECTOS'), 'Encabezado ausente');
    assert.ok(!out.includes('undefined'), 'No debe mostrar jugador undefined');
    assert.ok(out.includes('Duelos: 5'), 'Debe listar los 5 duelos contra rivales');
  });

check('51. cli.js duo: dispatcher sin jugadores resuelve compañeros dinámicamente con Exit Code 0',
  () => {
    const out = execFileSync(process.execPath, [cliPath, 'duo', sampleFile], { encoding: 'utf8' });
    assert.ok(out.includes('AUDITORÍA DE DÚO'), 'Encabezado ausente');
    assert.ok(out.includes('Sinergia:'), 'Puntuación de sinergia ausente');
    assert.ok(!out.includes('None and None'), 'No debe fallar por jugadores no encontrados');
  });

check('52. cli.js economy: dispatcher ejecuta desglose de buy-tiers con Exit Code 0',
  () => {
    const out = execFileSync(process.execPath, [cliPath, 'economy', sampleFile, 'TenZ#0001'], { encoding: 'utf8' });
    assert.ok(out.includes('DESGLOSE DE ECONOMÍA Y BUY TIERS'), 'Encabezado ausente');
    assert.ok(out.includes('TenZ#0001'), 'Jugador ausente');
    assert.ok(out.includes('Pistol'), 'Tier Pistol ausente');
  });

check('53. cli.js coaching: dispatcher ejecuta reporte introspectivo con Exit Code 0',
  () => {
    const out = execFileSync(process.execPath, [cliPath, 'coaching', sampleFile, 'TenZ#0001'], { encoding: 'utf8' });
    assert.ok(out.includes('REPORTE INTROSPECTIVO DE COACHING TÁCTICO'), 'Encabezado ausente');
    assert.ok(out.includes('MÓDULOS Y GUÍAS DE APRENDIZAJE'), 'Módulos ausentes');
    assert.ok(out.includes('youtube.com'), 'Enlaces ausentes');
  });

check('54. cli.js match: shorthand de jugador resuelve sobre sample_match sin WAF sintético',
  () => {
    const out = execFileSync(process.execPath, [cliPath, 'match', 'TenZ#0001'], { encoding: 'utf8' });
    assert.ok(out.includes('DIAGNÓSTICO 360°: TenZ#0001'), 'Debe diagnosticar a TenZ#0001');
    assert.ok(!out.includes('kirtmy#000'), 'No debe desbordar a kirtmy sintético');
  });

// ---- Regresiones del veredicto REQUIERE_CORRECCIÓN (v4.6) ----

check('55. ingestor fail-closed: archivo inexistente y URL no canónica lanzan sin análisis',
  () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ing-fc-'));
    try {
      const missing = path.join(tmp, 'no-existe.json');
      assert.throws(() => resolveMatchDataResilient(missing, 'Test#0001'), /no encontrado|no resoluble|Sin telemetría/i);
      assert.throws(() => resolveMatchDataResilient('../../examples/sample_match.json', 'Test#0001'), /canónico|no resoluble|Sin telemetría/i);
      assert.throws(() => fetchMatch('../../examples/sample_match.json'), /canónico/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('56. ingestor demo: --demo emite sintético con procedencia explícita',
  () => {
    const fm = require(path.join(scriptsDir, 'fetch_match.js'));
    const orig = fm.fetchMatch;
    fm.fetchMatch = () => { throw new Error('Simulated WAF 403'); };
    try {
      const r = resolveMatchDataResilient('https://tracker.gg/valorant/match/c886e66a-0927-43e6-8e2c-d3e9dc2e4d04', 'Test#0001', { allowSynthetic: true });
      assert.strictEqual(r.data.metadata.synthetic, true);
      assert.strictEqual(r.data.metadata.wafContainment, true);
      assert.ok(Array.isArray(r.data.metadata.ingestionDiagnostics) && r.data.metadata.ingestionDiagnostics.length > 0);
      assert.throws(
        () => resolveMatchDataResilient('https://tracker.gg/valorant/match/c886e66a-0927-43e6-8e2c-d3e9dc2e4d04', 'Test#0001'),
        /--demo/
      );
    } finally {
      fm.fetchMatch = orig;
    }
  });

check('57. dsse: auto-firmado desconocido falla; keystore + rotación verifican',
  () => {
    const dsse = require(path.join(scriptsDir, 'dsse_attestation.js'));
    const rep = { player: 'Test#0001', map: 'Ascent' };
    const k1 = dsse.generateAttestationKeyPair();
    const env1 = dsse.signTelemetryReport(rep, k1);
    const denied = dsse.verifyTelemetryAttestation(env1);
    assert.strictEqual(denied.verified, false, 'auto-firmado debe fallar por defecto');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-ks-'));
    try {
      const ksPath = path.join(tmp, 'ks.json');
      dsse.registerTrustedKey(ksPath, env1.publicKeyPem, 't1');
      const ok = dsse.verifyTelemetryAttestation(env1, null, { trustedKeystore: dsse.loadOrCreateKeystore(ksPath).keys });
      assert.strictEqual(ok.verified, true, 'clave registrada debe verificar');
      const k2 = dsse.generateAttestationKeyPair();
      const env2 = dsse.signTelemetryReport(rep, k2);
      assert.strictEqual(dsse.verifyTelemetryAttestation(env2, null, { trustedKeystore: dsse.loadOrCreateKeystore(ksPath).keys }).verified, false, 'clave no registrada debe fallar');
      dsse.registerTrustedKey(ksPath, env2.publicKeyPem, 't2-rotated');
      assert.strictEqual(dsse.verifyTelemetryAttestation(env2, null, { trustedKeystore: dsse.loadOrCreateKeystore(ksPath).keys }).verified, true, 'rotación debe verificar');
      const evil = JSON.parse(JSON.stringify(env1));
      evil.payload = Buffer.from(JSON.stringify({ hacked: true })).toString('base64');
      assert.strictEqual(dsse.verifyTelemetryAttestation(evil, null, { trustedKeystore: dsse.loadOrCreateKeystore(ksPath).keys }).verified, false, 'payload manipulado debe fallar');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('58. invariant: zonas todo-cero y matriz imposible fallan con error tipado',
  () => {
    assert.throws(() => validateHitZones({ head: '0%', body: '0%', leg: '0%' }), /HIT_ZONES_EMPTY/);
    const phantom = {
      playerMap: { 'A#1': { kills: 5, deaths: 5 } },
      duelMatrix: { 'A#1': { 'Fantasma#9': 40 }, 'Fantasma#9': { 'A#1': 2 } }
    };
    assert.throws(() => validateDuelMatrix(phantom), /DUEL_UNKNOWN_PLAYER/);
    const real = parseDuels(sample, 'TenZ#0001');
    assert.strictEqual(validateDuelMatrix(real), true);
    const rec = reconcileDuelMatrix(real);
    assert.ok(rec.reconciled === true && rec.knownPlayers === true, 'muestra real debe reconciliar');
  });

check('59. learning/coaching: telemetría ausente no fabrica fugas ni módulos',
  () => {
    const emptyMatch = { data: { metadata: { mapName: 'Ascent', rounds: 24 }, segments: [{ type: 'player-summary', metadata: { platformUserHandle: 'X#1' }, attributes: { platformUserIdentifier: 'X#1' }, stats: {} }] } };
    const p = evaluateLearningProfile(emptyMatch, 'X#1');
    assert.ok(p.unknowns.length >= 4, 'unknowns no registrados');
    assert.strictEqual(p.dataQuality, 'insuficiente');
    assert.strictEqual(p.eloLeaks.length, 0, 'fugas fabricadas desde vacío');
    assert.ok(p.warning && p.warning.includes('ADVERTENCIA'), 'warning ausente');
  });

check('60. autodiagnostic/career: muestra vacía declara insuficiencia sin inventar',
  () => {
    const tel = extractAccountTelemetry({}, { handle: 'X#1' });
    assert.strictEqual(tel.insufficientData, true);
    const agg = aggregateCareerTelemetry([{ telemetry: tel }]);
    assert.strictEqual(agg.dataQuality, 'insuficiente');
    const mmr = evaluateMmrDrag({ competitive: { matches: 0 }, currentRank: 'Gold 3' });
    assert.ok(mmr.diagnosis.includes('DATOS INSUFICIENTES') && mmr.confidence === 'nula');
    assert.ok(mmr.formula && typeof mmr.sampleSize === 'number');
    const tl = generateMilestonesTimeline(agg);
    assert.strictEqual(tl.length, 1);
    assert.ok(tl[0].contexto.includes('Datos insuficientes'));
  });

check('61. cli.js: archivo inexistente y parse inválido fallan con Exit 1',
  () => {
    let code1 = 0;
    try { cliOk(['match', './no-existe-xyz.json']); } catch (e) { code1 = e.status; }
    assert.strictEqual(code1, 1, 'match sobre archivo inexistente debe salir 1');
    let code2 = 0;
    try { cliOk(['parse', './no-existe-xyz.json', 'X#1']); } catch (e) { code2 = e.status; }
    assert.strictEqual(code2, 1, 'parse sobre archivo inexistente debe salir 1');
    let code3 = 0;
    try { cliOk(['parse', sampleFile, 'jugador-sin-tag']); } catch (e) { code3 = e.status; }
    assert.strictEqual(code3, 1, 'parse con Riot ID inválido debe salir 1');
  });

check('62. attest: identidad persistente + --trust-new-key explícito (sin TOFU silencioso)',
  () => {
    withIsolatedCache(() => {
      let code1 = 0;
      try { cliOk(['attest', sampleFile, 'TenZ#0001']); } catch (e) { code1 = e.status; }
      assert.strictEqual(code1, 1, 'attest con firmante desconocido debe fallar (no TOFU)');
      const out = cliOk(['attest', sampleFile, 'TenZ#0001', '--trust-new-key']);
      assert.ok(out.includes('VERIFICADO contra keystore'), 'aprovisionamiento explícito debe verificar');
      const out2 = cliOk(['attest', sampleFile, 'TenZ#0001']);
      assert.ok(out2.includes('VERIFICADO contra keystore'), 'identidad persistente debe seguir verificando');
    });
  });

check('63. invariant: matriz imposible con jugadores conocidos falla (DUEL_RECONCILE)',
  () => {
    const { reconcileDuelMatrix } = require(path.join(scriptsDir, 'invariant_validator.js'));
    const impossible = {
      playerMap: { 'A#1': { kills: 5, deaths: 5 }, 'B#2': { kills: 4, deaths: 6 } },
      duelMatrix: { 'A#1': { 'B#2': 999 }, 'B#2': { 'A#1': 1 } }
    };
    const rec = reconcileDuelMatrix(impossible);
    assert.strictEqual(rec.reconciled, false, 'matriz 999 vs 9 kills debe marcarse irreconciliada');
    assert.throws(() => validateDuelMatrix(impossible), /DUEL_RECONCILE/);
    const real = reconcileDuelMatrix(parseDuels(sample, 'TenZ#0001'));
    assert.strictEqual(real.reconciled, true, 'muestra real debe reconciliar dentro de tolerancia');
  });

check('64. autodiagnostic/career: muestra cero preserva ceros, sin talento ni horas inventadas',
  () => {
    const empty = evaluateTalentVsEffort({
      summary: { totalGeneral: { hours: 0 }, highestPeakRank: 'Unranked' },
      accounts: [{ handle: 'X#1', isExcluded: false, competitive: { matches: 0 }, peakRank: 'Unranked' }]
    });
    assert.strictEqual(empty.sampleSize, 0, 'matches 0 no debe convertirse en 1');
    assert.strictEqual(empty.category, 'DATOS INSUFICIENTES');
    assert.ok(!String(empty.talentRatio).includes('%') || empty.talentRatio === 'N/A', 'sin porcentajes de talento');
    const levelOnly = extractAccountTelemetry({ metadata: { accountLevel: 30 } }, { handle: 'Y#2' });
    assert.strictEqual(levelOnly.casual.seconds, 0, 'sin telemetría observada no hay allowance de 25h');
    assert.strictEqual(levelOnly.insufficientData, true);
  });

check('65. cli.js profile: Riot ID malformado falla; shorthand declara fixture',
  () => {
    let code = 0;
    try { cliOk(['profile', 'not-a-riot-id']); } catch (e) { code = e.status; }
    assert.strictEqual(code, 1, 'profile sin formato Nombre#TAG debe salir 1');
    const out = cliOk(['match', 'TenZ#0001']);
    assert.ok(out.includes('fixture de ejemplo'), 'shorthand debe declarar uso del fixture');
  });

check('66. identidad DSSE: creación 0600 y rechazo de permisos inseguros',
  () => {
    withIsolatedCache((tmpCache) => {
      const idFile = path.join(tmpCache, 'attest_identity.json');
      const out = cliOk(['attest', sampleFile, 'TenZ#0001', '--trust-new-key']);
      assert.ok(out.includes('VERIFICADO contra keystore'), 'aprovisionamiento debe verificar');
      assert.ok(fs.existsSync(idFile), 'identidad no creada');
      if (process.platform !== 'win32') {
        const mode = fs.statSync(idFile).mode & 0o777;
        assert.strictEqual(mode & 0o077, 0, `identidad con permisos ${mode.toString(8)}, se exige 0600`);
        fs.chmodSync(idFile, 0o644);
        let code = 0;
        let stderr = '';
        try { cliOk(['attest', sampleFile, 'TenZ#0001', '--trust-new-key']); }
        catch (e) { code = e.status; stderr = String(e.stdout || '') + String(e.stderr || '') + String(e.message || ''); }
        assert.strictEqual(code, 1, 'identidad 0644 debe rechazarse');
        assert.ok(stderr.includes('permisos inseguros'), 'debe explicar permisos inseguros');
      }
    });
  });

check('67. autodiagnostic: muestra cero devuelve null, no promedios fabricados',
  () => {
    const r = evaluateTalentVsEffort({
      summary: { totalGeneral: { hours: 0 }, highestPeakRank: 'Unranked' },
      accounts: [{ handle: 'X#1', isExcluded: false, competitive: { matches: 0 }, peakRank: 'Unranked' }]
    });
    assert.strictEqual(r.telemetrySummary.averageKd, null);
    assert.strictEqual(r.telemetrySummary.averageAcs, null);
    assert.strictEqual(r.telemetrySummary.averageDd, null);
    assert.strictEqual(r.telemetrySummary.averageHs, null);
  });

check('68. ingestor: IDs no-archivo no provocan sondas fs; parse sin entrada falla',
  () => {
    let code = 0;
    try { cliOk(['parse']); } catch (e) { code = e.status; }
    assert.strictEqual(code, 1, 'parse sin entrada debe salir 1');
    const fsMod = require('fs');
    const origExists = fsMod.existsSync;
    const origStat = fsMod.statSync;
    const probed = [];
    fsMod.existsSync = (...a) => { probed.push('existsSync'); return origExists(...a); };
    fsMod.statSync = (...a) => { probed.push('statSync'); return origStat(...a); };
    try {
      assert.throws(() => resolveMatchDataResilient('..%2f..%2fx', 'X#1'), /canónico/);
    } finally {
      fsMod.existsSync = origExists;
      fsMod.statSync = origStat;
    }
    assert.strictEqual(probed.length, 0, `sondas fs inesperadas: ${probed.join(',')}`);
  });

check('71. dsse: registros concurrentes al keystore no pierden claves (merge atómico)',
  () => {
    const dssePath = path.join(scriptsDir, 'dsse_attestation.js').replace(/\\/g, '/');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-conc-'));
    const ksPath = path.join(tmp, 'ks.json').replace(/\\/g, '/');
    const coord = path.join(tmp, 'coordinator.js');
    fs.writeFileSync(coord, `
const { spawn } = require('child_process');
const fs = require('fs');
const KS = ${JSON.stringify(ksPath)};
const DSSE = ${JSON.stringify(dssePath)};
(async () => {
  const procs = [];
  for (let i = 0; i < 6; i++) {
    const p = spawn(process.execPath, ['-e', "const d=require('" + DSSE + "');const k=d.generateAttestationKeyPair();d.registerTrustedKey('" + KS + "',k.publicKey.export({type:'spki',format:'pem'}),'c" + i + "');"], { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    procs.push(new Promise((resolve) => p.on('close', (code) => resolve({ i, code, err: err.slice(0, 300) }))));
  }
  const results = await Promise.all(procs);
  const bad = results.filter(r => r.code !== 0);
  if (bad.length) { console.error('CHILD_FAIL ' + JSON.stringify(bad)); process.exit(1); }
  const ks = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(tmp, 'ks.json'))}, 'utf8'));
  if (ks.keys.length !== 6) { console.error('KEYS_LOST ' + ks.keys.length); process.exit(1); }
  if (fs.existsSync(${JSON.stringify(path.join(tmp, 'ks.json.lock'))})) { console.error('ORPHAN_LOCK'); process.exit(1); }
  console.log('CONCURRENT_MERGE_OK 6/6');
})();
`);
    try {
      const out = execFileSync(process.execPath, [coord], { encoding: 'utf8', timeout: 60000 });
      assert.ok(out.includes('CONCURRENT_MERGE_OK 6/6'), 'merge concurrente incompleto');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('72. autodiagnostic MMR: null/NaN/Infinity/negativos/rango ausente son insuficiencia',
  () => {
    const bad = [
      { competitive: { matches: 400, kd: null, acs: null, dd: null }, currentRank: 'Gold 2' },
      { competitive: { matches: 400, kd: 'NaN', acs: 'Infinity', dd: '-5' }, currentRank: 'Gold 2' },
      { competitive: { matches: -10, kd: '1.5', acs: '250', dd: '30' }, currentRank: 'Gold 2' },
      { competitive: { matches: 400, kd: '1.5', acs: '250', dd: '30' }, currentRank: '' },
      { competitive: { matches: 400, kd: '1.5', acs: '250', dd: '30' } }
    ];
    for (const input of bad) {
      const r = evaluateMmrDrag(input);
      assert.strictEqual(r.mmrDragDetected, false, `MMR drag con entrada inválida: ${JSON.stringify(input)}`);
      assert.ok(r.diagnosis.includes('DATOS INSUFICIENTES'), 'sin declaración de insuficiencia');
    }
    const inf = evaluateMmrDrag({ competitive: { matches: 400, kd: '9.9', acs: '900', dd: '299' }, currentRank: 'Gold 2' });
    assert.strictEqual(inf.mmrDragDetected, true, 'valores altos en dominio deben detectarse');
  });

check('73. autodiagnostic talento: ceros/negativos/HS150% no clasifican',
  () => {
    const mk = (comp) => ({
      summary: { totalGeneral: { hours: 100 }, highestPeakRank: 'Gold 2' },
      accounts: [{ handle: 'Z#1', isExcluded: false, competitive: comp, peakRank: 'Gold 2' }]
    });
    const allZero = evaluateTalentVsEffort(mk({ matches: 10, kd: 0, acs: 0, dd: 0, hs: 0 }));
    assert.strictEqual(allZero.category, 'EVIDENCIA DESCRIPTIVA', 'ceros deben describirse, no clasificarse favorablemente');
    assert.strictEqual(allZero.talentRatio, 'N/A');
    assert.ok(allZero.trueDeservedRank.includes('Indeterminado'), 'sin proyección de rango');
    const neg = evaluateTalentVsEffort(mk({ matches: 10, kd: -1, acs: -50, dd: -400, hs: -5 }));
    assert.strictEqual(neg.category, 'DATOS INSUFICIENTES', 'negativos fuera de dominio son insuficiencia');
    const hs150 = evaluateTalentVsEffort(mk({ matches: 10, kd: 1.2, acs: 230, dd: 18, hs: 150 }));
    assert.strictEqual(hs150.category, 'DATOS INSUFICIENTES', 'HS150 fuera de dominio es insuficiencia');
  });

check('74. versión única: banner CLI y SBOM derivan de package.json',
  () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    const out = cliOk([]);
    assert.ok(out.includes(`V${pkg.version}`), `banner no refleja package.json (${pkg.version})`);
    const sbom = require(path.join(scriptsDir, 'sbom_manifest.js'));
    const manifest = sbom.generateSbom(path.join(__dirname));
    assert.strictEqual(manifest.metadata.component.version, pkg.version, 'SBOM no deriva versión de package.json');
  });

check('69. identidad DSSE: symlink en destino se rechaza sin seguirlo',
  () => {
    withIsolatedCache((tmpCache) => {
      const idFile = path.join(tmpCache, 'attest_identity.json');
      const outside = path.join(os.tmpdir(), 'attest-outside-target.txt');
      fs.writeFileSync(outside, 'ORIGINAL-EXTERNO');
      let linkOk = true;
      try {
        fs.symlinkSync(outside, idFile, 'file');
      } catch (e) {
        linkOk = false;
      }
      try {
        if (!linkOk) {
          assert.ok(true, 'entorno sin privilegios de symlink: caso no aplicable');
          return;
        }
        let code = 0;
        let out = '';
        try { cliOk(['attest', sampleFile, 'TenZ#0001', '--trust-new-key']); }
        catch (e) { code = e.status; out = String(e.stdout || '') + String(e.stderr || '') + String(e.message || ''); }
        assert.strictEqual(code, 1, 'symlink en identidad debe fallar');
        assert.ok(out.includes('enlace simb'), 'debe explicar el symlink');
        assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'ORIGINAL-EXTERNO', 'el objetivo externo fue sobrescrito');
        const lst = fs.lstatSync(idFile);
        assert.ok(lst.isSymbolicLink(), 'la identidad debe seguir siendo symlink (no reemplazada)');
      } finally {
        try { fs.unlinkSync(outside); } catch (e) {}
      }
    });
  });

check('70. autodiagnostic: perfil parcial (matches sin métricas) no clasifica',
  () => {
    const r = evaluateTalentVsEffort({
      summary: { totalGeneral: { hours: 50 }, highestPeakRank: 'Gold 2' },
      accounts: [{ handle: 'P#1', isExcluded: false, competitive: { matches: 10 }, peakRank: 'Gold 2' }]
    });
    assert.strictEqual(r.category, 'DATOS INSUFICIENTES');
    assert.strictEqual(r.talentRatio, 'N/A');
    assert.ok(r.formula.includes('kd, acs, dd, hs') || r.formula.includes('faltan'), 'fórmula debe listar métricas faltantes');
    assert.strictEqual(r.telemetrySummary.averageKd, null);
    const m = evaluateMmrDrag({ competitive: { matches: 400 }, currentRank: 'Gold 2' });
    assert.ok(m.diagnosis.includes('DATOS INSUFICIENTES'), 'MMR sin métricas de impacto debe declararse insuficiente');
  });

check('75. dsse: lock rancio se recupera y lock malformado no bloquea',
  () => {
    const dsse = require(path.join(scriptsDir, 'dsse_attestation.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-lock-'));
    try {
      const ksPath = path.join(tmp, 'ks.json');
      fs.writeFileSync(ksPath + '.lock', `999999:${Date.now() - 120000}:deadbeef`);
      const k = dsse.generateAttestationKeyPair();
      const keyid = dsse.registerTrustedKey(ksPath, k.publicKey.export({ type: 'spki', format: 'pem' }), 'stale-test');
      assert.ok(keyid, 'registro tras lock rancio debe funcionar');
      assert.ok(!fs.existsSync(ksPath + '.lock'), 'lock rancio debe liberarse');
      fs.writeFileSync(ksPath + '.lock', 'basura-sin-formato');
      const k2 = dsse.generateAttestationKeyPair();
      dsse.registerTrustedKey(ksPath, k2.publicKey.export({ type: 'spki', format: 'pem' }), 'spoof-test');
      const ks = JSON.parse(fs.readFileSync(ksPath, 'utf8'));
      assert.strictEqual(ks.keys.length, 2, 'locks malformados no deben bloquear ni perder claves');
      assert.ok(!fs.existsSync(ksPath + '.lock'), 'lock malformado debe liberarse');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('76. ranks: gramática exacta insensible a mayúsculas; subcadenas rechazadas',
  () => {
    const prober = { competitive: { matches: 400, kd: '1.5', acs: '250', dd: '30' }, currentRank: 'GOLD 2' };
    const upper = evaluateMmrDrag(prober);
    const lower = evaluateMmrDrag({ competitive: { matches: 400, kd: '1.5', acs: '250', dd: '30' }, currentRank: 'gold 2' });
    assert.strictEqual(upper.mmrDragDetected, lower.mmrDragDetected, 'casing no debe cambiar el veredicto');
    assert.strictEqual(upper.mmrDragDetected, true);
    for (const bad of ['xxGoldfish', 'Goldfish', 'Master 5', 'Oro 3', '']) {
      const r = evaluateMmrDrag({ competitive: { matches: 400, kd: '1.5', acs: '250', dd: '30' }, currentRank: bad });
      assert.ok(r.diagnosis.includes('DATOS INSUFICIENTES'), `rango '${bad}' debe ser insuficiente`);
    }
  });

check('77. talento: epsilon (KD 0.01, HS 0.1%) no clasifica; débil-real sí',
  () => {
    const mk = (comp) => ({
      summary: { totalGeneral: { hours: 100 }, highestPeakRank: 'Gold 2' },
      accounts: [{ handle: 'E#1', isExcluded: false, competitive: comp, peakRank: 'Gold 2' }]
    });
    const eps = evaluateTalentVsEffort(mk({ matches: 20, kd: 0.01, acs: 1, dd: -290, hs: 0.1 }));
    assert.strictEqual(eps.category, 'EVIDENCIA DESCRIPTIVA', 'epsilon debe describirse, no clasificarse favorablemente');
    assert.strictEqual(eps.talentRatio, 'N/A');
    assert.ok(eps.trueDeservedRank.includes('Indeterminado'), 'sin proyección de rango');
    const weak = evaluateTalentVsEffort(mk({ matches: 50, kd: 0.8, acs: 150, dd: -5, hs: 12 }));
    assert.ok(weak.category !== 'DATOS INSUFICIENTES', 'rendimiento débil-real debe clasificarse');
    assert.ok(weak.confidence === 'media' || weak.confidence === 'baja', 'confianza calibrada por muestra');
  });

check('78. MMR: pisos significativos (KD≥0.3 o ACS≥100) para evaluar',
  () => {
    const thin = evaluateMmrDrag({ competitive: { matches: 400, kd: '0.1', acs: '40', dd: '5' }, currentRank: 'Gold 2' });
    assert.ok(thin.diagnosis.includes('DATOS INSUFICIENTES'), 'bajo umbral debe ser insuficiente');
    const solid = evaluateMmrDrag({ competitive: { matches: 400, kd: '0.5', acs: '140', dd: '5' }, currentRank: 'Gold 2' });
    assert.ok(!solid.diagnosis.includes('DATOS INSUFICIENTES'), 'sobre umbral debe evaluarse');
  });

check('79. dsse saveKeystore público: rechaza symlink y escribe atómicamente bajo lock',
  () => {
    const dsse = require(path.join(scriptsDir, 'dsse_attestation.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-save-'));
    try {
      const ksPath = path.join(tmp, 'ks.json');
      const outside = path.join(tmp, 'outside.txt');
      fs.writeFileSync(outside, 'ORIGINAL-EXTERNO');
      let linkOk = true;
      try { fs.symlinkSync(outside, ksPath, 'file'); } catch (e) { linkOk = false; }
      if (linkOk) {
        assert.throws(() => dsse.saveKeystore(ksPath, { keys: [] }), /enlace simbólico/);
        assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'ORIGINAL-EXTERNO', 'symlink no debe redirigir escritura');
        fs.unlinkSync(ksPath);
      }
      dsse.saveKeystore(ksPath, { keys: [{ keyid: 'ab', publicKeyPem: 'X', label: 't', created: 'now' }] });
      assert.strictEqual(dsse.loadOrCreateKeystore(ksPath).keys.length, 1);
      assert.ok(!fs.existsSync(ksPath + '.lock'), 'lock liberado tras escritura');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('80. talento: cobertura disjunta no infla confianza (joint, no suma)',
  () => {
    const r = evaluateTalentVsEffort({
      summary: { totalGeneral: { hours: 500 }, highestPeakRank: 'Gold 2' },
      accounts: [
        { handle: 'A#1', isExcluded: false, competitive: { matches: 1000, kd: '1.4' }, peakRank: 'Gold 2' },
        { handle: 'B#1', isExcluded: false, competitive: { matches: 5, kd: '1.1', acs: '220', dd: '15', hs: '22' }, peakRank: 'Gold 2' }
      ]
    });
    assert.strictEqual(r.sampleSize, 5, 'muestra debe ser cobertura conjunta, no suma');
    assert.strictEqual(r.confidence, 'baja', 'cobertura disjunta jamás da alta confianza');
    assert.strictEqual(r.jointMatches, 5);
  });

check('81. MMR: una sola señal límite (kd 0.3 aislado) es insuficiencia',
  () => {
    const r = evaluateMmrDrag({ competitive: { matches: 400, kd: '0.3', acs: '0', dd: '-300' }, currentRank: 'Gold 2' });
    assert.ok(r.diagnosis.includes('DATOS INSUFICIENTES'), 'una sola señal no basta para evaluar MMR');
    assert.strictEqual(r.confidence, 'nula');
  });

check('82. dsse saveKeystore público: rechaza symlink y escribe bajo lock',
  () => {
    const dsse = require(path.join(scriptsDir, 'dsse_attestation.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-save-'));
    try {
      const ksPath = path.join(tmp, 'ks.json');
      const outside = path.join(tmp, 'outside.txt');
      fs.writeFileSync(outside, 'ORIGINAL-EXTERNO');
      let linkOk = true;
      try { fs.symlinkSync(outside, ksPath, 'file'); } catch (e) { linkOk = false; }
      if (linkOk) {
        assert.throws(() => dsse.saveKeystore(ksPath, { keys: [] }), /enlace simbólico/);
        assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'ORIGINAL-EXTERNO', 'symlink no debe redirigir escritura');
        fs.unlinkSync(ksPath);
      }
      dsse.saveKeystore(ksPath, { keys: [{ keyid: 'zz', publicKeyPem: 'X', label: 't', created: 'now' }] });
      assert.strictEqual(dsse.loadOrCreateKeystore(ksPath).keys.length, 1);
      assert.ok(!fs.existsSync(ksPath + '.lock'), 'lock liberado tras escritura pública');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('83. talento: promedios calculados solo sobre muestra conjunta',
  () => {
    const r = evaluateTalentVsEffort({
      summary: { totalGeneral: { hours: 500 }, highestPeakRank: 'Gold 2' },
      accounts: [
        { handle: 'A#1', isExcluded: false, competitive: { matches: 2000, kd: '9.9', acs: '900', dd: '290', hs: '90' }, peakRank: 'Gold 2' },
        { handle: 'B#1', isExcluded: false, competitive: { matches: 5, kd: '1.1', acs: '220', dd: '15', hs: '22' }, peakRank: 'Gold 2' }
      ]
    });
    assert.strictEqual(r.jointMatches, 2005);
    assert.strictEqual(r.telemetrySummary.averageKd, 9.88, 'promedio debe reflejar conjunto, no solo disjoint');
    assert.ok(r.confidence === 'alta', 'joint 2005 debe dar alta confianza');
  });

check('84. talento: valores límite exactos (kd 0.3/acs 100) no clasifican',
  () => {
    const mk = (comp) => ({
      summary: { totalGeneral: { hours: 100 }, highestPeakRank: 'Gold 2' },
      accounts: [{ handle: 'E#1', isExcluded: false, competitive: comp, peakRank: 'Gold 2' }]
    });
    const r = evaluateTalentVsEffort(mk({ matches: 5, kd: 0.3, acs: 100, dd: -300, hs: 0 }));
    assert.strictEqual(r.category, 'EVIDENCIA DESCRIPTIVA', 'frontera exacta no debe clasificar favorablemente');
    assert.strictEqual(r.talentRatio, 'N/A');
  });

check('85. dsse: holder vivo nunca es desalojado (sin overlap)',
  () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-live-'));
    try {
      const ksPath = path.join(tmp, 'ks.json');
      const lockPath = ksPath + '.lock';
      const heldFile = path.join(tmp, 'held.txt');
      const holderScript = path.join(tmp, 'holder.js');
      const coordScript = path.join(tmp, 'coord.js');
      fs.writeFileSync(holderScript, `
const dsse = require(${JSON.stringify(path.join(scriptsDir, 'dsse_attestation.js'))});
dsse.withFileLock(${JSON.stringify(lockPath)}, () => {
  require('fs').writeFileSync(${JSON.stringify(heldFile)}, 'held');
  const end = Date.now() + 3000;
  while (Date.now() < end) {}
  return 'held-ok';
}, { retries: 200, waitMs: 50 });
`);
      fs.writeFileSync(coordScript, `
const { spawn } = require('child_process');
const fs = require('fs');
const dsse = require(${JSON.stringify(path.join(scriptsDir, 'dsse_attestation.js'))});
(async () => {
  const holder = spawn(process.execPath, [${JSON.stringify(holderScript)}], { stdio: ['ignore', 'pipe', 'pipe'] });
  let herr = '';
  holder.stderr.on('data', d => { herr += d; });
  await new Promise(r => setTimeout(r, 800));
  const k = dsse.generateAttestationKeyPair();
  dsse.registerTrustedKey(${JSON.stringify(ksPath)}, k.publicKey.export({ type: 'spki', format: 'pem' }), 'after-live');
  const code = await new Promise((res) => holder.on('close', res));
  if (code !== 0) { console.error('HOLDER_FAIL ' + herr.slice(0, 300)); process.exit(1); }
  if (!fs.existsSync(${JSON.stringify(heldFile)})) { console.error('HOLDER_NO_HELD'); process.exit(1); }
  const ks = dsse.loadOrCreateKeystore(${JSON.stringify(ksPath)});
  if (ks.keys.length !== 1) { console.error('KEYS=' + ks.keys.length); process.exit(1); }
  if (fs.existsSync(${JSON.stringify(lockPath)})) { console.error('ORPHAN_LOCK'); process.exit(1); }
  console.log('LIVE_NO_OVERLAP_OK');
})();
`);
      const out = execFileSync(process.execPath, [coordScript], { encoding: 'utf8', timeout: 60000 });
      assert.ok(out.includes('LIVE_NO_OVERLAP_OK'), 'overlap o fallo en holder vivo');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('86. talento: duplicados exactos no inflan muestra ni confianza',
  () => {
    const one = { handle: 'D#1', isExcluded: false, competitive: { matches: 10, kd: '1.1', acs: '220', dd: '15', hs: '22' }, peakRank: 'Gold 2' };
    const ten = Array.from({ length: 10 }, () => JSON.parse(JSON.stringify(one)));
    const r = evaluateTalentVsEffort({
      summary: { totalGeneral: { hours: 500 }, highestPeakRank: 'Gold 2' },
      accounts: ten
    });
    assert.strictEqual(r.duplicatesSkipped, 9, 'repetidos exactos deben contarse');
    assert.strictEqual(r.sampleSize, 10, 'muestra debe ser 10, no 100');
    assert.strictEqual(r.jointMatches, 10);
    assert.ok(r.confidence !== 'alta', 'duplicados jamás dan alta confianza');
  });

check('87. talento: identidad incierta (vacíos/duplicados de handle) topa confianza',
  () => {
    const mkAcc = (handle, comp) => ({ handle, isExcluded: false, competitive: comp, peakRank: 'Gold 2' });
    const blanks = evaluateTalentVsEffort({
      summary: { totalGeneral: { hours: 800 }, highestPeakRank: 'Gold 2' },
      accounts: [
        mkAcc('', { matches: 60, kd: '1.3', acs: '250', dd: '20', hs: '24' }),
        mkAcc('  ', { matches: 60, kd: '1.3', acs: '250', dd: '20', hs: '24' })
      ]
    });
    assert.strictEqual(blanks.duplicatesSkipped, 0, 'handles vacíos jamás se fusionan');
    assert.strictEqual(blanks.identityUncertain, true);
    assert.strictEqual(blanks.confidence, 'media', 'identidad incierta topa en media aunque joint>=100');
    const sameHandle = evaluateTalentVsEffort({
      summary: { totalGeneral: { hours: 800 }, highestPeakRank: 'Gold 2' },
      accounts: [
        mkAcc('X#1', { matches: 60, kd: '1.3', acs: '250', dd: '20', hs: '24' }),
        mkAcc('X#1', { matches: 60, kd: '0.9', acs: '180', dd: '5', hs: '15' })
      ]
    });
    assert.strictEqual(sameHandle.duplicatesSkipped, 0, 'datos distintos se preservan');
    assert.strictEqual(sameHandle.identityUncertain, true);
    assert.strictEqual(sameHandle.confidence, 'media', 'mismo handle con datos distintos topa en media');
  });

check('88. talento/MMR: apenas-sobre-umbral no produce conclusiones favorables',
  () => {
    const r = evaluateTalentVsEffort({
      summary: { totalGeneral: { hours: 100 }, highestPeakRank: 'Gold 2' },
      accounts: [{ handle: 'B#1', isExcluded: false, competitive: { matches: 5, kd: 0.306, acs: 100.06, dd: -300, hs: 0 }, peakRank: 'Gold 2' }]
    });
    assert.strictEqual(r.category, 'EVIDENCIA DESCRIPTIVA', 'límite apenas-superado no clasifica favorablemente');
    assert.strictEqual(r.talentRatio, 'N/A');
    const m = evaluateMmrDrag({ competitive: { matches: 400, kd: '0.31', acs: '101', dd: '5' }, currentRank: 'Gold 2' });
    assert.ok(m.confidence === 'media' || m.confidence === 'baja', 'MMR límite no debe dar alta confianza');
    assert.ok(m.confidence !== 'alta', 'MMR límite jamás alta confianza');
  });
if (passed !== total) process.exit(1);
console.log('All valorant-analytics deterministic tests passed with Exit Code: 0');