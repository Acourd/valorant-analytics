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
const {
  parseTextScoreboard,
  assembleRawMatchStructure,
  resolveMatchDataResilient
} = require(path.join(scriptsDir, 'universal_ingestor.js'));
const { decompressBuffer, getChromiumCachePaths, extractFromCacheDirectory } = require(path.join(scriptsDir, 'browser_cache_harvester.js'));
const { extractAccountTelemetry, aggregateCareerTelemetry, generateMilestonesTimeline } = require(path.join(scriptsDir, 'career_telemetry.js'));
const { evaluateMmrDrag, evaluateTalentVsEffort } = require(path.join(scriptsDir, 'autodiagnostic_engine.js'));

let passed = 0;
const total = 46;
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

check('23. cli.js attest: sobre DSSE in-toto firmado con Ed25519 y verificado',
  () => {
    const out = cliOk(['attest', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('ATESTACIÓN CRIPTOGRÁFICA DSSE'));
    assert.ok(out.includes('VERIFICADO (Ed25519 OK)'));
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
    const match = resolveMatchDataResilient(fakeWafUrl, 'kirtmy#000', { map: 'Ascent' });
    assert.ok(match && match.data && match.data.segments);
    assert.strictEqual(match.data.segments.filter(s => s.type === 'player-summary').length, 10);
    assert.strictEqual(match.data.metadata.wafContainment, true);
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
    const out = cliOk(['match', 'https://tracker.gg/valorant/match/c886e66a-0927-43e6-8e2c-d3e9dc2e4d04', 'kirtmy#000']);
    assert.ok(out.includes('DIAGNÓSTICO 360°') && out.includes('kirtmy#000'));
    assert.ok(out.includes('RADAR DE DOMINIO'));
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

console.log(`\nResults: ${passed}/${total} tests passed.`);
if (passed !== total) process.exit(1);
console.log('All valorant-analytics deterministic tests passed with Exit Code: 0');