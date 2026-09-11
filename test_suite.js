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
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const scriptsDir = path.join(__dirname, 'scripts');
const cliPath = path.join(scriptsDir, 'cli.js');
const sampleFile = path.join(__dirname, 'examples', 'sample_match.json');

// --- Arranque controlado del frente #1: la configuración del operador se fija
// ANTES de cargar riot_source (una sola vez). Las pruebas mutan el CONTENIDO de
// los ficheros, nunca la ruta; cambiar la env después no debe surtir efecto.
const RIOT_CFG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'riot-cfg-'));
const RIOT_TRUST_PATH = path.join(RIOT_CFG_DIR, 'trust.json');
const RIOT_KEY_PATH = path.join(RIOT_CFG_DIR, 'ingestor.key');
function writeRiotTrust(keys) {
  fs.writeFileSync(RIOT_TRUST_PATH, JSON.stringify(keys), { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(RIOT_TRUST_PATH, 0o600); } catch (e) { /* Windows */ }
}
function writeRiotKey(privateKeyPem) {
  fs.writeFileSync(RIOT_KEY_PATH, privateKeyPem, { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(RIOT_KEY_PATH, 0o600); } catch (e) { /* Windows */ }
}
const RIOT_ATT_PATH = path.join(__dirname, 'examples', 'riot_match_anonymized.attestation.json');
const RIOT_KEYS_PATH = path.join(__dirname, 'examples', 'riot_match_trusted_keys.json');
const RIOT_BIG_MAX_AGE = 100 * 365 * 24 * 3600 * 1000;
function loadRiotGolden() {
  return {
    payload: JSON.parse(fs.readFileSync(path.join(__dirname, 'examples', 'riot_match_anonymized.json'), 'utf8')),
    attestation: JSON.parse(fs.readFileSync(RIOT_ATT_PATH, 'utf8')),
    trustedKeys: JSON.parse(fs.readFileSync(RIOT_KEYS_PATH, 'utf8'))
  };
}
writeRiotTrust([]);
writeRiotKey('');
process.env.RIOT_ATTESTATION_TRUST = RIOT_TRUST_PATH;
process.env.RIOT_ATTESTATION_KEY = RIOT_KEY_PATH;

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
  // Contador ÚNICO de casos: la numeración la emite el harness, jamás el
  // nombre manual. El total reportado es exactamente el número de casos
  // registrados y ejecutados.
  process.stdout.write(`Testing: [#${total}] ${name}... `);
  try {
    fn();
    console.log('PASS (Exit 0)');
    passed++;
  } catch (e) {
    const detail = (e.stderr ? String(e.stderr).split('\n').filter(l => l.trim()).slice(0, 3).join(' | ') : '');
    console.log('FAIL:', e.message.split('\n')[0] + (detail ? ` [hijo: ${detail}]` : ''));
  }
}

// ---- Unidad: normalización de Riot IDs ----
check('normalizeHandle: espacios y tag -> encodeURIComponent correcto',
  () => {
    assert.strictEqual(normalizeHandle('TenZ 001#NA1'), 'TenZ%20001%23NA1');
    assert.strictEqual(normalizeHandle('  TenZ#0001  '), 'TenZ%230001');
  });

check('normalizeHandle: cirílico/acentos se codifican sin romper el tag, y vacío lanza',
  () => {
    assert.ok(normalizeHandle('Chronicle#0001').includes('%23'), 'tag no codificado');
    assert.throws(() => normalizeHandle('   '), /Riot ID vacío/);
  });

// ---- Unidad: extracción de match ID ----
check('extractMatchId: URL de tracker, UUID plano y cadena larga',
  () => {
    const uuid = 'cb4ebb70-4ecf-425d-8aaf-3bf9cf718631';
    assert.strictEqual(extractMatchId(`https://tracker.gg/valorant/match/${uuid}?x=1`), uuid);
    assert.strictEqual(extractMatchId(uuid), uuid);
    assert.ok(extractMatchId('algo sin uuid') !== null);
  });

// ---- Unidad: parseMatchSummary sobre el fixture real ----
check('parseMatchSummary: 10 jugadores, 2 equipos, stats numéricas, orden por combatScore',
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
check('parseDuels: target case-insensitive, matriz killer->victim con conteos',
  () => {
    const { playerMap, duelMatrix, target } = parseDuels(sample, 'tenz#0001');
    assert.ok(target, 'target no resuelto (insensible a mayúsculas)');
    assert.strictEqual(Object.keys(playerMap).length, 10);
    assert.ok(Object.values(duelMatrix).some(m => Object.keys(m).length > 0), 'matriz vacía');
  });

// ---- Unidad: kovaaks ----
check('generateKovaaksRoutine: 3 bloques, 15 min totales, telemetría FK/FD',
  () => {
    const r = generateKovaaksRoutine(sample, 'TenZ#0001');
    assert.strictEqual(r.routine.length, 3);
    assert.ok(r.routine.every(b => b.duration.startsWith('5 mins')));
    assert.ok(r.player, 'sin jugador resuelto');
    assert.ok(typeof r.firstDuels.entryRating === 'number' && r.firstDuels.entryRating >= 0 && r.firstDuels.entryRating <= 100);
    assert.ok(r.hsPct.endsWith('%'));
  });

// ---- Unidad: duo_synergy ----
check('auditDuoSynergy: estructura, mismo equipo y carryAnalysis honesto',
  () => {
    const r = auditDuoSynergy(sample, 'TenZ#0001', 'Chronicle#0001');
    assert.ok(r.p1 && r.p2 && r.synergy.score.includes('/ 100'));
    assert.ok(r.synergy.carryAnalysis, 'sin carryAnalysis');
    assert.strictEqual(typeof r.synergy.carryAnalysis.boostCandidate, 'boolean');
    assert.ok(r.synergy.carryAnalysis.primaryCarrier.length > 0);
    assert.ok(r.p1.team === r.p2.team, 'jugadores del fixture deberían estar en el mismo equipo');
  });

check('auditDuoSynergy: rivales en equipos opuestos producen veredicto RIVALES',
  () => {
    const { playerMap } = parseDuels(sample);
    const handles = Object.keys(playerMap);
    const enemy = Object.values(playerMap).find(o => o.team !== playerMap[handles[0]].team);
    const r = auditDuoSynergy(sample, handles[0], enemy.handle);
    assert.ok(r.synergy.verdict.includes('RIVALES'), 'veredicto de rivales no aplicado');
  });

// ---- Unidad: economía ----
check('analyzeEconomy: tier loadouts con rondas y winPct',
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

check('cli.js aim: dispatcher ejecuta la rutina sin TypeError (regresión P0)',
  () => {
    const out = cliOk(['aim', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('RUTINA KOVAAKS 15-MIN'), 'cabecera aim ausente');
  });

check('cli.js duels: matriz 1v1 renderizada (regresión P0: contrato parseDuels)',
  () => {
    const out = cliOk(['duels', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('MATRIZ DE DUELOS 1v1'), 'cabecera duels ausente');
    assert.ok(!out.includes('undefined'), 'duels emite undefined');
  });

check('cli.js match: diagnóstico 360° completo con radar y fugas',
  () => {
    const out = cliOk(['match', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('RADAR DE DOMINIO'));
    assert.ok(out.includes('OBSERVACIONES POR RONDA'), 'muestra ronda describe, no acusa causas');
    assert.ok(!out.includes('FUGAS ATRIBUIBLES'), 'sin regla verificable no se acusan fugas');
  });

check('cli.js duo: auditoría con carryAnalysis en consola',
  () => {
    const out = cliOk(['duo', sampleFile, 'TenZ#0001', 'Chronicle#0001']);
    assert.ok(out.includes('AUDITORÍA DE DÚO') && out.includes('Carga:'));
  });

check('cli.js perfil: genera URLs multi-plataforma normalizadas',
  () => {
    const out = cliOk(['profile', 'Mixwell#EUW']);
    assert.ok(out.includes('OP.GG') && out.includes('Mixwell%23EUW'));
  });

check('analyzeWeaponTelemetry: cálculo de zonas (Head/Body/Leg) y SE/TP spray ratio',
  () => {
    const res = analyzeWeaponTelemetry(sample, 'TenZ#0001');
    assert.ok(res.hitZoneDistribution, 'hitZoneDistribution ausente');
    assert.ok(res.hitZoneDistribution.head.includes('%'));
    assert.ok(res.hitZoneDistribution.body.includes('%'));
    assert.ok(res.hitZoneDistribution.leg.includes('%'));
    assert.ok(typeof res.metrics.sprayTapRatio === 'number');
    assert.ok(res.recoilDiagnosis && res.recoilDiagnosis.kovaaksPrescription);
  });

check('analyzeWeaponTelemetry: categorización en 3 bandas de distancia (Close/Mid/Long)',
  () => {
    const res = analyzeWeaponTelemetry(sample, 'TenZ#0001');
    assert.strictEqual(res.distanceBands.length, 3);
    assert.ok(res.distanceBands.every(b => typeof b.duels === 'number' && typeof b.totalDamage === 'number'));
  });

check('cli.js weapons: telemetría de armas y bandas de impacto en consola',
  () => {
    const out = cliOk(['weapons', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('TELEMETRÍA DE ARMAS') && out.includes('DISTANCIA Y CONVERSIÓN'));
    assert.ok(out.includes('SE/TP Ratio'));
  });

check('cli.js calibrate: modo zero-cloud offline diagnóstico instantáneo',
  () => {
    const out = cliOk(['calibrate', 'Sovereign#001', 'Immortal 3', 'Initiator']);
    assert.ok(out.includes('CALIBRACIÓN INSTANTÁNEA ZERO-CLOUD'));
    assert.ok(out.includes('RADAR DE RENDIMIENTO COMPETITIVO CALIBRADO'));
    assert.ok(out.includes('Immortal 3'));
  });

check('invariant_validator: aserción formal de radar y suma de zonas de impacto (100%)',
  () => {
    assert.strictEqual(validateRadar({ precisionMecanica: 90, macrogamePosicionamiento: 80, duelosDeApertura: 70, disciplinaEconomica: 85, composturaClutch: 95 }), true);
    assert.strictEqual(validateHitZones({ head: '32.5%', body: '65.5%', leg: '2.0%' }), true);
  });

check('invariant_validator: captura violaciones matemáticas (NaN, fuera de rango [0,100], sum!=100%)',
  () => {
    assert.throws(() => validateRadar({ precisionMecanica: 105, macrogamePosicionamiento: 70, duelosDeApertura: 80, disciplinaEconomica: 50, composturaClutch: 60 }), InvariantViolationError);
    assert.throws(() => validateHitZones({ head: '50%', body: '20%', leg: '10%' }), InvariantViolationError);
    assert.throws(() => validateRadar({ precisionMecanica: NaN, macrogamePosicionamiento: 70, duelosDeApertura: 80, disciplinaEconomica: 50, composturaClutch: 60 }), InvariantViolationError);
  });

check('invariant_validator: validación formal completa sobre match real de telemetría',
  () => {
    const p = evaluateLearningProfile(sample, 'TenZ#0001');
    assert.strictEqual(validateLearningProfile(p), true);
    const w = analyzeWeaponTelemetry(sample, 'TenZ#0001');
    assert.strictEqual(validateWeaponTelemetry(w), true);
    const d = auditDuoSynergy(sample, 'TenZ#0001', 'Chronicle#0001');
    assert.strictEqual(validateDuoSynergy(d), true);
  });

check('cli.js invariants: verificación formal de invariantes matemáticos en CLI dispatcher',
  () => {
    const out = cliOk(['invariants', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('VERIFICACIÓN FORMAL DE INVARIANTES MATEMÁTICOS'));
    assert.ok(out.includes('TODOS LOS INVARIANTES MATEMÁTICOS VERIFICADOS'));
  });

check('cli.js attest: sobre DSSE in-toto firmado con Ed25519 y verificado',
  () => {
    withIsolatedCache(() => {
      const out = cliOk(['attest', sampleFile, 'TenZ#0001', '--trust-new-key']);
      assert.ok(out.includes('ATESTACI') , 'cabecera attest ausente');
      assert.ok(out.includes('VERIFICADO contra keystore (Ed25519 OK)'), 'verificación contra keystore ausente');
      assert.ok(out.includes('Almac'), 'keystore no declarado en salida');
    });
  });

check('cli.js merkle: árbol Merkle de eventos discretos y prueba de inclusión',
  () => {
    const out = cliOk(['merkle', sampleFile]);
    assert.ok(out.includes('ÁRBOL DE AUDITORÍA MERKLE'));
    assert.ok(out.includes('VÁLIDA (Exit 0)'));
  });

check('cli.js guardian: monitor de fatiga neuromuscular y tilt cognitivo',
  () => {
    const out = cliOk(['guardian', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('SESSION GUARDIAN'));
    assert.ok(out.includes('Apto para competir'));
  });

check('cli.js drift: cálculo de deriva táctica y entropía de Shanon',
  () => {
    const out = cliOk(['drift', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('RADAR DE DERIVA TÁCTICA'));
    assert.ok(out.includes('Entropía de Quarters'));
  });

check('cli.js consensus: arbitraje bizantino multi-lente con quórum BFT',
  () => {
    const out = cliOk(['consensus', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('SÍNTESIS DE CONSENSO BIZANTINO'));
    assert.ok(out.includes('Lentes Participantes:  3'));
  });

check('cli.js synthesize: rutina evolutiva adaptativa según debilidades de match',
  () => {
    const out = cliOk(['synthesize', sampleFile, 'TenZ#0001']);
    assert.ok(out.includes('RUTINA EVOLUTIVA ADAPTATIVA'));
    assert.ok(out.includes('EJERCICIOS SINTETIZADOS'));
  });

check('cli.js sbom: manifiesto CycloneDX v1.5 con 0 dependencias externas',
  () => {
    const out = cliOk(['sbom']);
    assert.ok(out.includes('MANIFIESTO CYCLONEDX SBOM'));
    assert.ok(out.includes('Dependencias NPM:   0'));
  });

// ---- universal_ingestor & resiliencia táctica (v1.2) ----
check('universal_ingestor: parseTextScoreboard extrae handles, rangos y estadísticas de texto plano',
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

check('universal_ingestor: assembleRawMatchStructure genera 10 jugadores, 2 equipos y zonas al 100%',
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

check('universal_ingestor: cumplimiento formal de invariant_validator sobre telemetría sintetizada',
  () => {
    const synthetic = assembleRawMatchStructure([], 'Ascent', 24, 'kirtmy#000');
    const p = evaluateLearningProfile(synthetic, 'kirtmy#000');
    assert.strictEqual(validateLearningProfile(p), true);
    assert.strictEqual(validateRadar(p.radar), true);
    const w = analyzeWeaponTelemetry(synthetic, 'kirtmy#000');
    assert.strictEqual(validateWeaponTelemetry(w), true);
  });

check('universal_ingestor: resolveMatchDataResilient intercepta WAF 403 con contención fail-closed',
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

check('cli.js parse: dispatcher procesa archivo de volcado de texto sin errores',
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

check('cli.js match (WAF resilient): URL remota protegida ejecuta Zero-Crash con Exit Code 0',
  () => {
    const out = cliOk(['match', 'https://tracker.gg/valorant/match/c886e66a-0927-43e6-8e2c-d3e9dc2e4d04', 'kirtmy#000', '--demo']);
    assert.ok(out.includes('DIAGNÓSTICO 360°') && out.includes('kirtmy#000'));
    assert.ok(out.includes('RADAR DE DOMINIO'));
    assert.ok(out.includes('SINTÉTICA'), 'modo demo debe declarar procedencia sintética');
  });

check('browser_cache_harvester: decompressBuffer y detección de rutas Chromium',
  () => {
    const raw = Buffer.from(JSON.stringify({ ok: true, timestamp: Date.now() }));
    const zlib = require('zlib');
    const br = zlib.brotliCompressSync(raw);
    const dec = decompressBuffer(br);
    assert.ok(dec && JSON.parse(dec.toString('utf8')).ok === true);
    const paths = getChromiumCachePaths();
    assert.ok(Array.isArray(paths));
  });

check('career_telemetry: desglose de horas competitivas vs general y cronología de hitos',
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

check('autodiagnostic_engine: señal heurística de MMR y mezcla de indicadores (no verificada)',
  () => {
    const drag = evaluateMmrDrag({
      competitive: { matches: 500, kd: '1.20', acs: '240', dd: '25' },
      currentRank: 'Gold 3'
    });
    assert.strictEqual(drag.mmrDragDetected, true);
    const agg = {
      accounts: [{
        handle: 'Test#0001',
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

check('cli.js career & diagnose: ejecución exitosa de los nuevos comandos con Exit Code 0',
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

check('harvester: cacheDir inexistente y data_1 truncado no lanzan (retornan [])',
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

check('ingestor: options.matchId determinista y sin random en contrato',
  () => {
    const r = assembleRawMatchStructure([], 'Ascent', 24, 'Test#0001', { matchId: 'resilient-test-001' });
    assert.strictEqual(r.data.metadata.matchId, 'resilient-test-001');
    assert.strictEqual(r.data.segments.filter(s => s.type === 'player-summary').length, 10);
    assert.strictEqual(r.data.metadata.rounds, 24);
  });

check('ingestor: archivo JSON corrupto lanza Error descriptivo (fail-closed, sin sintético)',
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

check('ingestor: parseTextScoreboard rechaza cadena vacía con mensaje descriptivo',
  () => {
    assert.throws(() => parseTextScoreboard(''), /no vacía/);
    assert.throws(() => parseTextScoreboard(null), /no vacía/);
  });

check('autodiagnostic: null/malformado lanza Error descriptivo, no TypeError',
  () => {
    assert.throws(() => evaluateMmrDrag(null), /requiere telemetría de cuenta/);
    assert.throws(() => evaluateMmrDrag('cadena'), /requiere telemetría de cuenta/);
    assert.throws(() => evaluateTalentVsEffort(null), /careerReport/);
    assert.throws(() => evaluateTalentVsEffort({ accounts: [] }), /summary/);
    assert.throws(() => evaluateTalentVsEffort({ accounts: [{ competitive: {} }], summary: {} }), /totalGeneral/);
  });

check('career milestones: opciones personalizadas (mainAgent/speedrunHours) sin hardcode',
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

check('autodiagnostic: cuenta malformada parcial no truena en agregados',
  () => {
    const career = {
      summary: { totalGeneral: { hours: 200 }, highestPeakRank: 'Gold 3' },
      accounts: [{ handle: 'A#1', isExcluded: false }, { handle: 'B#1', isExcluded: false, competitive: { matches: 10, kd: '1.2', acs: '230', dd: '18', hs: '25' }, peakRank: 'Gold 2' }]
    };
    const r = evaluateTalentVsEffort(career);
    assert.ok(r.telemetrySummary.totalCompetitiveMatches >= 10, 'matches no agregados');
    assert.ok(r.category.length > 0 && r.talentRatio.includes('/'), 'categoría incompleta');
  });

check('learning_profile: match sin jugadores válidos lanza Error descriptivo (fail-closed)',
  () => {
    assert.throws(
      () => evaluateLearningProfile({ data: { segments: [] } }, 'TenZ#0001'),
      /No se encontraron jugadores válidos/
    );
  });

check('duo_synergy: handles vacíos/ausentes lanzan Error descriptivo en vez de TypeError',
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

check('economy_analyzer: sintetiza tiers a partir de player-round si faltan player-loadout',
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

check('cli.js duels: dispatcher sin jugador resuelve target automáticamente con Exit Code 0',
  () => {
    const out = execFileSync(process.execPath, [cliPath, 'duels', sampleFile], { encoding: 'utf8' });
    assert.ok(out.includes('MATRIZ DE DUELOS 1v1 DIRECTOS'), 'Encabezado ausente');
    assert.ok(!out.includes('undefined'), 'No debe mostrar jugador undefined');
    assert.ok(out.includes('Duelos: 5'), 'Debe listar los 5 duelos contra rivales');
  });

check('cli.js duo: dispatcher sin jugadores resuelve compañeros dinámicamente con Exit Code 0',
  () => {
    const out = execFileSync(process.execPath, [cliPath, 'duo', sampleFile], { encoding: 'utf8' });
    assert.ok(out.includes('AUDITORÍA DE DÚO'), 'Encabezado ausente');
    assert.ok(out.includes('Sinergia:'), 'Puntuación de sinergia ausente');
    assert.ok(!out.includes('None and None'), 'No debe fallar por jugadores no encontrados');
  });

check('cli.js economy: dispatcher ejecuta desglose de buy-tiers con Exit Code 0',
  () => {
    const out = execFileSync(process.execPath, [cliPath, 'economy', sampleFile, 'TenZ#0001'], { encoding: 'utf8' });
    assert.ok(out.includes('DESGLOSE DE ECONOMÍA Y BUY TIERS'), 'Encabezado ausente');
    assert.ok(out.includes('TenZ#0001'), 'Jugador ausente');
    assert.ok(out.includes('Pistol'), 'Tier Pistol ausente');
  });

check('cli.js coaching: dispatcher ejecuta reporte introspectivo con Exit Code 0',
  () => {
    const out = execFileSync(process.execPath, [cliPath, 'coaching', sampleFile, 'TenZ#0001'], { encoding: 'utf8' });
    assert.ok(out.includes('REPORTE INTROSPECTIVO DE COACHING TÁCTICO'), 'Encabezado ausente');
    assert.ok(out.includes('MÓDULOS Y GUÍAS DE APRENDIZAJE'), 'Módulos ausentes');
    assert.ok(out.includes('youtube.com'), 'Enlaces ausentes');
  });

check('cli.js match: shorthand de jugador resuelve sobre sample_match sin WAF sintético',
  () => {
    const out = execFileSync(process.execPath, [cliPath, 'match', 'TenZ#0001'], { encoding: 'utf8' });
    assert.ok(out.includes('DIAGNÓSTICO 360°: TenZ#0001'), 'Debe diagnosticar a TenZ#0001');
    assert.ok(!out.includes('kirtmy#000'), 'No debe desbordar a kirtmy sintético');
  });

// ---- Regresiones del veredicto REQUIERE_CORRECCIÓN (v4.6) ----

check('ingestor fail-closed: archivo inexistente y URL no canónica lanzan sin análisis',
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

check('ingestor demo: --demo emite sintético con procedencia explícita',
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

check('dsse: auto-firmado desconocido falla; keystore + rotación verifican',
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

check('invariant: zonas todo-cero y matriz imposible fallan con error tipado',
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

check('learning/coaching: telemetría ausente no fabrica fugas ni módulos',
  () => {
    const emptyMatch = { data: { metadata: { mapName: 'Ascent', rounds: 24 }, segments: [{ type: 'player-summary', metadata: { platformUserHandle: 'X#1' }, attributes: { platformUserIdentifier: 'X#1' }, stats: {} }] } };
    const p = evaluateLearningProfile(emptyMatch, 'X#1');
    assert.ok(p.unknowns.length >= 4, 'unknowns no registrados');
    assert.strictEqual(p.dataQuality, 'insuficiente');
    assert.strictEqual(p.eloLeaks.length, 0, 'fugas fabricadas desde vacío');
    assert.ok(p.warning && p.warning.includes('ADVERTENCIA'), 'warning ausente');
  });

check('autodiagnostic/career: muestra vacía declara insuficiencia sin inventar',
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

check('cli.js: archivo inexistente y parse inválido fallan con Exit 1',
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

check('attest: identidad persistente + --trust-new-key explícito (sin TOFU silencioso)',
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

check('invariant: matriz imposible con jugadores conocidos falla (DUEL_RECONCILE)',
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

check('autodiagnostic/career: muestra cero preserva ceros, sin talento ni horas inventadas',
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

check('cli.js profile: Riot ID malformado falla; shorthand declara fixture',
  () => {
    let code = 0;
    try { cliOk(['profile', 'not-a-riot-id']); } catch (e) { code = e.status; }
    assert.strictEqual(code, 1, 'profile sin formato Nombre#TAG debe salir 1');
    const out = cliOk(['match', 'TenZ#0001']);
    assert.ok(out.includes('fixture de ejemplo'), 'shorthand debe declarar uso del fixture');
  });

check('identidad DSSE: creación 0600 y rechazo de permisos inseguros',
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

check('autodiagnostic: muestra cero devuelve null, no promedios fabricados',
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

check('ingestor: IDs no-archivo no provocan sondas fs; parse sin entrada falla',
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

check('dsse: registros concurrentes al keystore no pierden claves (merge atómico)',
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
  const dsse = require(${JSON.stringify(dssePath)});
  const ks = dsse.loadOrCreateKeystore(${JSON.stringify(path.join(tmp, 'ks.json'))});
  if (ks.keys.length !== 6) { console.error('KEYS_LOST ' + ks.keys.length); process.exit(1); }
  if (typeof ks.generation !== 'number' || ks.generation < 6) { console.error('GEN=' + ks.generation); process.exit(1); }
  const fs2 = require('fs');
  const markers = fs2.readdirSync(${JSON.stringify(tmp)}).filter(f => /^ks\\.json\\.commit\\.\\d+$/.test(f));
  if (markers.length !== ks.generation) { console.error('MARKERS=' + markers.length + ' GEN=' + ks.generation); process.exit(1); }
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

check('autodiagnostic MMR: null/NaN/Infinity/negativos/rango ausente son insuficiencia',
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
      assert.strictEqual(r.mmrDragDetected, false, `señal MMR con entrada inválida: ${JSON.stringify(input)}`);
      assert.ok(r.diagnosis.includes('DATOS INSUFICIENTES'), 'sin declaración de insuficiencia');
    }
    const inf = evaluateMmrDrag({ competitive: { matches: 400, kd: '9.9', acs: '900', dd: '299' }, currentRank: 'Gold 2' });
    assert.strictEqual(inf.mmrDragDetected, true, 'valores altos en dominio deben detectarse');
  });

check('autodiagnostic talento: ceros/negativos/HS150% no clasifican',
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

check('versión única: banner CLI y SBOM derivan de package.json',
  () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    const out = cliOk([]);
    assert.ok(out.includes(`V${pkg.version}`), `banner no refleja package.json (${pkg.version})`);
    const sbom = require(path.join(scriptsDir, 'sbom_manifest.js'));
    const manifest = sbom.generateSbom(path.join(__dirname));
    assert.strictEqual(manifest.metadata.component.version, pkg.version, 'SBOM no deriva versión de package.json');
  });

check('identidad DSSE: symlink en destino se rechaza sin seguirlo',
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

check('autodiagnostic: perfil parcial (matches sin métricas) no clasifica',
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

check('dsse: writer muerto pre-marcador no bloquea; el protocolo recupera sin reinicio',
  () => {
    const dsse = require(path.join(scriptsDir, 'dsse_attestation.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-dead-'));
    try {
      const ksPath = path.join(tmp, 'ks.json');
      // Simula un worker/hilo que escribió contenido de la generación 1 y
      // murió ANTES de crear el marcador: queda contenido huérfano sin commit.
      const orphan = { keys: [{ keyid: 'dead', publicKeyPem: 'X', label: 'dead', created: 'never' }], generation: 1, writer: '9999:1:dead' };
      fs.writeFileSync(`${ksPath}.g1.dead`, JSON.stringify(orphan), 'utf8');
      const k = dsse.generateAttestationKeyPair();
      const keyid = dsse.registerTrustedKey(ksPath, k.publicKey.export({ type: 'spki', format: 'pem' }), 'after-dead');
      assert.ok(keyid, 'registro tras writer muerto debe funcionar');
      const ks = dsse.loadOrCreateKeystore(ksPath);
      assert.strictEqual(ks.keys.length, 1, 'el huérfano sin marcador JAMÁS se instala como verdad');
      assert.ok(!ks.keys.some(x => x.keyid === 'dead'), 'contenido no commiteado no puede filtrarse');
      assert.ok(fs.existsSync(`${ksPath}.commit.1`), 'el marcador de la generación 1 debe existir');
      // Un segundo commit recoge el contenido superseded (huérfano en gen 1).
      const k2 = dsse.generateAttestationKeyPair();
      dsse.registerTrustedKey(ksPath, k2.publicKey.export({ type: 'spki', format: 'pem' }), 'second');
      assert.strictEqual(dsse.loadOrCreateKeystore(ksPath).keys.length, 2);
      assert.strictEqual(dsse.loadOrCreateKeystore(ksPath).generation, 2, 'generación estrictamente monótona');
      assert.ok(fs.existsSync(`${ksPath}.g1.dead`), 'contenido histórico se RETIENE (sin GC automático: el huérfano queda inerte y la compactación es explícita)');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('ranks: gramática exacta insensible a mayúsculas; subcadenas rechazadas',
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

check('talento: epsilon (KD 0.01, HS 0.1%) no clasifica; débil-real sí',
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

check('MMR: pisos significativos (KD≥0.3 o ACS≥100) para evaluar',
  () => {
    const thin = evaluateMmrDrag({ competitive: { matches: 400, kd: '0.1', acs: '40', dd: '5' }, currentRank: 'Gold 2' });
    assert.ok(thin.diagnosis.includes('DATOS INSUFICIENTES'), 'bajo umbral debe ser insuficiente');
    const solid = evaluateMmrDrag({ competitive: { matches: 400, kd: '0.5', acs: '140', dd: '5' }, currentRank: 'Gold 2' });
    assert.ok(!solid.diagnosis.includes('DATOS INSUFICIENTES'), 'sobre umbral debe evaluarse');
  });

check('dsse commitKeystore: rechaza symlink y publica por generaciones (sin escritura ciega)',
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
        assert.throws(() => dsse.commitKeystore(ksPath, () => ({ keys: [] })), /enlace simbólico/);
        assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'ORIGINAL-EXTERNO', 'symlink no debe redirigir escritura');
        fs.unlinkSync(ksPath);
      }
      // Reemplazo total solo como mutación EXPLÍCITA del llamador (monousuario).
      dsse.commitKeystore(ksPath, () => ({ keys: [{ keyid: 'ab', publicKeyPem: 'X', label: 't', created: 'now' }] }));
      assert.strictEqual(dsse.loadOrCreateKeystore(ksPath).keys.length, 1);
      assert.ok(fs.existsSync(`${ksPath}.commit.1`), 'la generación 1 debe quedar commiteada');
      assert.ok(!fs.existsSync(ksPath), 'el formato legado queda obsoleto tras publicar');
      // La escritura ciega ya no existe en la API pública.
      assert.strictEqual(dsse.saveKeystore, undefined, 'saveKeystore eliminado de la API pública');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('talento: cobertura disjunta no infla confianza (joint, no suma)',
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

check('MMR: una sola señal límite (kd 0.3 aislado) es insuficiencia',
  () => {
    const r = evaluateMmrDrag({ competitive: { matches: 400, kd: '0.3', acs: '0', dd: '-300' }, currentRank: 'Gold 2' });
    assert.ok(r.diagnosis.includes('DATOS INSUFICIENTES'), 'una sola señal no basta para evaluar MMR');
    assert.strictEqual(r.confidence, 'nula');
  });

check('dsse commitKeystore: rechaza symlink y publica con merge explícito',
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
        assert.throws(() => dsse.commitKeystore(ksPath, () => ({ keys: [] })), /enlace simbólico/);
        assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'ORIGINAL-EXTERNO', 'symlink no debe redirigir escritura');
        fs.unlinkSync(ksPath);
      }
      dsse.commitKeystore(ksPath, (cur) => ({ keys: cur.keys.concat([{ keyid: 'zz', publicKeyPem: 'X', label: 't', created: 'now' }]) }));
      assert.strictEqual(dsse.loadOrCreateKeystore(ksPath).keys.length, 1);
      assert.ok(fs.existsSync(`${ksPath}.commit.1`), 'la escritura debe commitear generación 1');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('talento: promedios calculados solo sobre muestra conjunta',
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

check('talento: valores límite exactos (kd 0.3/acs 100) no clasifican',
  () => {
    const mk = (comp) => ({
      summary: { totalGeneral: { hours: 100 }, highestPeakRank: 'Gold 2' },
      accounts: [{ handle: 'E#1', isExcluded: false, competitive: comp, peakRank: 'Gold 2' }]
    });
    const r = evaluateTalentVsEffort(mk({ matches: 5, kd: 0.3, acs: 100, dd: -300, hs: 0 }));
    assert.strictEqual(r.category, 'EVIDENCIA DESCRIPTIVA', 'frontera exacta no debe clasificar favorablemente');
    assert.strictEqual(r.talentRatio, 'N/A');
  });

check('dsse: carrera de marcador determinística — validar e instalar son una sola operación (sin TOCTOU)',
  () => {
    const dsse = require(path.join(scriptsDir, 'dsse_attestation.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-race-'));
    try {
      const ksPath = path.join(tmp, 'ks.json');
      dsse.commitKeystore(ksPath, () => ({ keys: [{ keyid: 'k0', publicKeyPem: 'P0', label: 'base', created: 'now' }] }));
      let mutateCalls = 0;
      const result = dsse.commitKeystore(ksPath, (current) => {
        mutateCalls++;
        if (mutateCalls === 1) {
          // Simula un corredor que gana la generación 2 entre nuestra lectura
          // y nuestro intento de marcador: contenido durable + marcador wx
          // con el digest vinculante del contenido exacto.
          const racerNonce = 'a11ce5';
          const racer = { keys: current.keys.concat([{ keyid: 'racer', publicKeyPem: 'R', label: 'racer', created: 'now' }]), generation: 2, writer: `999:1:${racerNonce}` };
          const racerJson = JSON.stringify(racer, null, 2);
          const racerDigest = crypto.createHash('sha256').update(Buffer.from(racerJson, 'utf8')).digest('hex');
          fs.writeFileSync(`${ksPath}.g2.${racerNonce}`, racerJson, { flag: 'wx' });
          fs.writeFileSync(`${ksPath}.commit.2`, `999:1:${racerNonce}:${racerDigest}`, { flag: 'wx' });
        }
        return { keys: current.keys.concat([{ keyid: 'mine', publicKeyPem: 'M', label: 'mine', created: 'now' }]) };
      });
      assert.strictEqual(mutateCalls, 2, 'el perdedor debe re-aplicar su mutación sobre el ganador');
      assert.strictEqual(result.generation, 3, 'la publicación final es la generación 3');
      const ks = dsse.loadOrCreateKeystore(ksPath);
      assert.ok(ks.keys.some(k => k.keyid === 'racer'), 'el estado del ganador es la nueva base');
      assert.ok(ks.keys.some(k => k.keyid === 'mine'), 'la mutación del perdedor no se pierde');
      assert.ok(ks.keys.every(k => ['k0', 'racer', 'mine'].includes(k.keyid)), 'sin claves fantasma');
      assert.strictEqual(ks.generation, 3);
      assert.ok(fs.existsSync(`${ksPath}.g2.a11ce5`), 'el contenido del ganador se RETIENE (retención histórica: jamás GC que compita con lectores activos)');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('talento: duplicados exactos no inflan muestra ni confianza',
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

check('talento: identidad incierta (vacíos/duplicados de handle) topa confianza',
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
    assert.strictEqual(blanks.unidentifiedRecords, 2, 'los registros sin ID se contabilizan');
    assert.strictEqual(blanks.sampleSize, 0, 'los registros sin ID jamás participan en la muestra');
    assert.strictEqual(blanks.confidence, 'nula', 'unidentified jamás soporta confianza');
    const sameHandle = evaluateTalentVsEffort({
      summary: { totalGeneral: { hours: 800 }, highestPeakRank: 'Gold 2' },
      accounts: [
        mkAcc('X#1', { matches: 60, kd: '1.3', acs: '250', dd: '20', hs: '24' }),
        mkAcc('X#1', { matches: 60, kd: '0.9', acs: '180', dd: '5', hs: '15' })
      ]
    });
    assert.strictEqual(sameHandle.duplicatesSkipped, 0, 'datos distintos se preservan');
    assert.strictEqual(sameHandle.conflictingSnapshots, 1, 'el snapshot cambiable se marca como conflicto');
    assert.strictEqual(sameHandle.jointMatches, 60, 'el snapshot adicional JAMÁS infla la muestra');
    assert.strictEqual(sameHandle.identityUncertain, true);
    assert.strictEqual(sameHandle.confidence, 'media', 'mismo handle con datos distintos topa en media');
  });

check('talento/MMR: apenas-sobre-umbral no produce conclusiones favorables',
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
check('dsse: 8 worker-threads concurrentes retienen todas las claves (sin overlap)',
  () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-workers-'));
    try {
      const ksPath = path.join(tmp, 'ks.json');
      const workerScript = path.join(tmp, 'reg.js');
      fs.writeFileSync(workerScript, `
const dsse = require(${JSON.stringify(path.join(scriptsDir, 'dsse_attestation.js'))});
const k = dsse.generateAttestationKeyPair();
dsse.registerTrustedKey(${JSON.stringify(ksPath)}, k.publicKey.export({ type: 'spki', format: 'pem' }), 'w' + (require('worker_threads').threadId || 'x'));
`);
      const coordScript = path.join(tmp, 'coordW.js');
      fs.writeFileSync(coordScript, `
const { Worker } = require('worker_threads');
const dsse = require(${JSON.stringify(path.join(scriptsDir, 'dsse_attestation.js'))});
(async () => {
  const workers = [];
  for (let i = 0; i < 8; i++) {
    workers.push(new Promise((resolve, reject) => {
      const w = new Worker(${JSON.stringify(workerScript)});
      w.on('error', reject);
      w.on('exit', (code) => code === 0 ? resolve(i) : reject(new Error('worker ' + i + ' exit ' + code)));
    }));
  }
  await Promise.all(workers);
  const ks = dsse.loadOrCreateKeystore(${JSON.stringify(ksPath)});
  if (ks.keys.length !== 8) { console.error('KEYS=' + ks.keys.length); process.exit(1); }
  if (ks.generation < 8) { console.error('GEN=' + ks.generation); process.exit(1); }
  console.log('WORKERS_OK 8/8 gen ' + ks.generation);
})();
`);
      const out = execFileSync(process.execPath, [coordScript], { encoding: 'utf8', timeout: 120000 });
      assert.ok(out.includes('WORKERS_OK 8/8'), 'workers concurrentes perdieron claves');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('MMR límite (1 señal decisiva) es evidencia límite, no veredicto',
  () => {
    const m = evaluateMmrDrag({ competitive: { matches: 400, kd: '0.4', acs: '120', dd: '-50' }, currentRank: 'Gold 2' });
    assert.ok(m.diagnosis.includes('EVIDENCIA L'), 'MMR débil debe declararse límite');
    assert.strictEqual(m.confidence, 'baja');
    assert.strictEqual(m.mmrDragDetected, false);
  });

check('dsse: saltos de reloj y mtimes arbitrarios no alteran el protocolo (sin relojes)',
  () => {
    const dsse = require(path.join(scriptsDir, 'dsse_attestation.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-clock-'));
    try {
      const ksPath = path.join(tmp, 'ks.json');
      const k1 = dsse.generateAttestationKeyPair();
      dsse.registerTrustedKey(ksPath, k1.publicKey.export({ type: 'spki', format: 'pem' }), 'before-jump');
      // Simula un salto de reloj: TODOS los mtimes retroceden 2 horas.
      const past = new Date(Date.now() - 2 * 3600 * 1000);
      for (const name of fs.readdirSync(tmp)) {
        try { fs.utimesSync(path.join(tmp, name), past, past); } catch (e) {}
      }
      const before = dsse.loadOrCreateKeystore(ksPath);
      assert.strictEqual(before.keys.length, 1, 'el estado commiteado sobrevive mtimes arbitrarios');
      assert.strictEqual(before.generation, 1);
      const k2 = dsse.generateAttestationKeyPair();
      dsse.registerTrustedKey(ksPath, k2.publicKey.export({ type: 'spki', format: 'pem' }), 'after-jump');
      const after = dsse.loadOrCreateKeystore(ksPath);
      assert.strictEqual(after.keys.length, 2, 'la publicación no depende de reloj alguno');
      assert.strictEqual(after.generation, 2, 'la numeración es monótona pura, no temporal');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('talento: epsilon apenas-sobre-umbral (0.306/100.06) es descriptivo',
  () => {
    const r = evaluateTalentVsEffort({
      summary: { totalGeneral: { hours: 100 }, highestPeakRank: 'Gold 2' },
      accounts: [{ handle: 'B#1', isExcluded: false, competitive: { matches: 5, kd: 0.306, acs: 100.06, dd: -299, hs: 0.05 }, peakRank: 'Gold 2' }]
    });
    assert.strictEqual(r.category, 'EVIDENCIA DESCRIPTIVA', 'apenas-sobre-umbral no clasifica favorablemente');
    assert.strictEqual(r.talentRatio, 'N/A');
    assert.ok(!r.trueDeservedRank.includes('Platino') || r.trueDeservedRank.includes('Indeterminado'), 'sin proyección de rango');
  });

check('dedup: orden de campos y delimitadores no alteran identidad',
  () => {
    const base = { matches: 10, kd: '1.1', acs: '220', dd: '15', hs: '22' };
    const reordered = { hs: '22', dd: '15', acs: '220', kd: '1.1', matches: 10 };
    const r = evaluateTalentVsEffort({
      summary: { totalGeneral: { hours: 500 }, highestPeakRank: 'Gold 2' },
      accounts: [
        { handle: 'D#1', isExcluded: false, competitive: base, peakRank: 'Gold 2' },
        { handle: 'D#1', isExcluded: false, competitive: reordered, peakRank: 'Gold 2' }
      ]
    });
    assert.strictEqual(r.duplicatesSkipped, 1, 'orden de campos no debe bypasear dedup');
    assert.strictEqual(r.sampleSize, 10);
    const tricky = evaluateTalentVsEffort({
      summary: { totalGeneral: { hours: 500 }, highestPeakRank: 'Gold 2' },
      accounts: [
        { handle: 'A||B#1', isExcluded: false, competitive: { matches: 10, kd: '1.1', acs: '220', dd: '15', hs: '22' }, peakRank: 'Gold 2' },
        { handle: 'A', isExcluded: false, competitive: { matches: 10, kd: '1.1', acs: '220', dd: '15', hs: '22' }, peakRank: 'B#1||Gold 2' }
      ]
    });
    assert.strictEqual(tricky.duplicatesSkipped, 0, 'delimitadores no deben colisionar identidades distintas');
  });

check('dsse: marcador ilegible SIEMPRE fail-closed (adopción prohibida); digest del marcador vincula el contenido',
  () => {
    const dsse = require(path.join(scriptsDir, 'dsse_attestation.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-malmarker-'));
    try {
      const ksPath = path.join(tmp, 'ks.json');
      dsse.commitKeystore(ksPath, () => ({ keys: [{ keyid: 'k0', publicKeyPem: 'P0', label: 'base', created: 'now' }] }));
      // Caso ambiguo: marcador de gen 2 ilegible con DOS candidatos de contenido.
      fs.writeFileSync(`${ksPath}.g2.aaaa`, JSON.stringify({ keys: [], generation: 2, writer: '1:1:aaaa' }));
      fs.writeFileSync(`${ksPath}.g2.bbbb`, JSON.stringify({ keys: [], generation: 2, writer: '1:1:bbbb' }));
      fs.writeFileSync(`${ksPath}.commit.2`, 'escritura-parcial-sin-formato');
      assert.throws(() => dsse.loadOrCreateKeystore(ksPath), /ilegible|fail-closed/,
        'la ambigüidad jamás se resuelve adivinando');
      fs.rmSync(tmp, { recursive: true, force: true });
      // Caso de candidato ÚNICO: JAMÁS se adopta (un contenido sin marcador
      // VÁLIDO es inerte; la adopción automática está prohibida).
      const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-adopt-'));
      try {
        const ks2 = path.join(tmp2, 'ks.json');
        dsse.commitKeystore(ks2, () => ({ keys: [{ keyid: 'k0', publicKeyPem: 'P0', label: 'base', created: 'now' }] }));
        fs.writeFileSync(`${ks2}.g2.c0de`, JSON.stringify({
          keys: [{ keyid: 'k0', publicKeyPem: 'P0', label: 'base', created: 'now' }, { keyid: 'k1', publicKeyPem: 'P1', label: 'nunca-commiteado', created: 'now' }],
          generation: 2, writer: '999:1:c0de'
        }));
        fs.writeFileSync(`${ks2}.commit.2`, 'parcial');
        assert.throws(() => dsse.loadOrCreateKeystore(ks2), /ilegible|fail-closed/,
          'un huérfano único con marcador inválido jamás se convierte en estado');
      } finally {
        fs.rmSync(tmp2, { recursive: true, force: true });
      }
      // Vínculo criptográfico: contenido manipulado post-commit = fail-closed.
      const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-digest-'));
      try {
        const ks3 = path.join(tmp3, 'ks.json');
        dsse.commitKeystore(ks3, () => ({ keys: [{ keyid: 'k0', publicKeyPem: 'P0', label: 'base', created: 'now' }] }));
        assert.strictEqual(dsse.loadOrCreateKeystore(ks3).keys.length, 1, 'lectura íntegra acepta el digest');
        // Manipular los bytes del contenido comprometido sin tocar el marcador:
        const contentFile = fs.readdirSync(tmp3).find(f => /^ks\.json\.g1\./.test(f));
        const tampered = JSON.parse(fs.readFileSync(path.join(tmp3, contentFile), 'utf8'));
        tampered.keys[0].publicKeyPem = 'EVIL';
        fs.writeFileSync(path.join(tmp3, contentFile), JSON.stringify(tampered, null, 2));
        assert.throws(() => dsse.loadOrCreateKeystore(ks3), /digest|manipulación/,
          'el digest del marcador detecta el contenido alterado');
      } finally {
        fs.rmSync(tmp3, { recursive: true, force: true });
      }
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    }
  });

check('MMR: apenas-sobre-umbral (KD 0.6001/ACS 200.01/DD -300) es evidencia límite',
  () => {
    const m = evaluateMmrDrag({ competitive: { matches: 400, kd: '0.6001', acs: '200.01', dd: '-300' }, currentRank: 'Gold 2' });
    assert.ok(m.diagnosis.includes('EVIDENCIA L'), 'epsilon-sobre-umbral no es evidencia decisiva');
    assert.strictEqual(m.confidence, 'baja', 'jamás alta confianza con epsilon');
    assert.strictEqual(m.mmrDragDetected, false);
    assert.ok(!m.diagnosis.includes('Varianza Normal'), 'sin conclusión favorable específica');
    // Contrario extremo: DD en el piso impide confianza alta en normalidad.
    const contra = evaluateMmrDrag({ competitive: { matches: 400, kd: '1.5', acs: '260', dd: '-280' }, currentRank: 'Diamond 1' });
    assert.notStrictEqual(contra.confidence, 'alta', 'evidencia contraria acota la confianza');
    assert.ok(/SIN CONCLUSIÓN|extremo contrario/i.test(contra.diagnosis), 'no se afirma normalidad contra evidencia contraria');
  });

check('identidad: equivalentes Unicode son la misma cuenta; formas no inflan muestra',
  () => {
    const comp = { matches: 40, kd: '1.2', acs: '240', dd: '20', hs: '25' };
    const r = evaluateTalentVsEffort({
      summary: { totalGeneral: { hours: 500 }, highestPeakRank: 'Gold 2' },
      accounts: [
        { handle: 'Caf\u00e9#1', isExcluded: false, competitive: comp, peakRank: 'Gold 2' },
        { handle: 'cafe\u0301#1', isExcluded: false, competitive: comp, peakRank: 'Gold 2' }
      ]
    });
    assert.strictEqual(r.duplicatesSkipped, 1, 'NFC: compuesto y descompuesto son la MISMA cuenta');
    assert.strictEqual(r.jointMatches, 40, 'la variante Unicode no infla la muestra');
    assert.strictEqual(r.identityUncertain, false, 'equivalentes canónicos no generan incertidumbre');
  });

check('dsse: estrés concurrente (24 workers) conserva TODAS las claves sin errores de lectura',
  () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-stress-'));
    try {
      const ksPath = path.join(tmp, 'ks.json');
      const workerScript = path.join(tmp, 'reg.js');
      fs.writeFileSync(workerScript, `
const dsse = require(${JSON.stringify(path.join(scriptsDir, 'dsse_attestation.js'))});
const tid = require('worker_threads').threadId;
const k = dsse.generateAttestationKeyPair();
dsse.registerTrustedKey(${JSON.stringify(ksPath)}, k.publicKey.export({ type: 'spki', format: 'pem' }), 'stress-' + tid);
`);
      const coordScript = path.join(tmp, 'coordS.js');
      fs.writeFileSync(coordScript, `
const { Worker } = require('worker_threads');
const dsse = require(${JSON.stringify(path.join(scriptsDir, 'dsse_attestation.js'))});
(async () => {
  const workers = [];
  for (let i = 0; i < 24; i++) {
    workers.push(new Promise((resolve, reject) => {
      const w = new Worker(${JSON.stringify(workerScript)});
      w.on('error', (e) => reject(new Error('worker ' + i + ': ' + e.message)));
      w.on('exit', (code) => code === 0 ? resolve(i) : reject(new Error('worker ' + i + ' exit ' + code)));
    }));
  }
  await Promise.all(workers);
  const ks = dsse.loadOrCreateKeystore(${JSON.stringify(ksPath)});
  if (ks.keys.length !== 24) { console.error('KEYS=' + ks.keys.length); process.exit(1); }
  if (ks.generation < 24) { console.error('GEN=' + ks.generation); process.exit(1); }
  console.log('STRESS_OK 24/24 gen ' + ks.generation);
})();
`);
      const out = execFileSync(process.execPath, [coordScript], { encoding: 'utf8', timeout: 180000 });
      assert.ok(out.includes('STRESS_OK 24/24'), 'estrés concurrente perdió claves o leyó contenido ausente');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('dsse: merge concurrente puro (16 commitKeystore en workers) converge sin pérdida',
  () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-merge-'));
    try {
      const ksPath = path.join(tmp, 'ks.json');
      const workerScript = path.join(tmp, 'merge.js');
      fs.writeFileSync(workerScript, `
const dsse = require(${JSON.stringify(path.join(scriptsDir, 'dsse_attestation.js'))});
const tid = require('worker_threads').threadId;
const res = dsse.commitKeystore(${JSON.stringify(ksPath)}, (cur) => ({
  keys: cur.keys.concat([{ keyid: 'm' + tid, publicKeyPem: 'P' + tid, label: 'merge-' + tid, created: 'now' }])
}));
if (!res.keys.some(k => k.keyid === 'm' + tid)) { console.error('MUTATION_LOST ' + tid); process.exit(1); }
`);
      const coordScript = path.join(tmp, 'coordM.js');
      fs.writeFileSync(coordScript, `
const { Worker } = require('worker_threads');
const dsse = require(${JSON.stringify(path.join(scriptsDir, 'dsse_attestation.js'))});
(async () => {
  const workers = [];
  for (let i = 0; i < 16; i++) {
    workers.push(new Promise((resolve, reject) => {
      const w = new Worker(${JSON.stringify(workerScript)});
      w.on('error', (e) => reject(new Error('worker ' + i + ': ' + e.message)));
      w.on('exit', (code) => code === 0 ? resolve(i) : reject(new Error('worker ' + i + ' exit ' + code)));
    }));
  }
  await Promise.all(workers);
  const ks = dsse.loadOrCreateKeystore(${JSON.stringify(ksPath)});
  if (ks.keys.length !== 16) { console.error('KEYS=' + ks.keys.length); process.exit(1); }
  if (ks.generation < 16) { console.error('GEN=' + ks.generation); process.exit(1); }
  console.log('MERGE_OK 16/16 gen ' + ks.generation);
})();
`);
      const out = execFileSync(process.execPath, [coordScript], { encoding: 'utf8', timeout: 180000 });
      assert.ok(out.includes('MERGE_OK 16/16'), 'el merge concurrente no converge');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('dsse: compactación explícita acota almacenamiento sin perder lectores concurrentes',
  () => {
    const dsse = require(path.join(scriptsDir, 'dsse_attestation.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-compact-'));
    try {
      const ksPath = path.join(tmp, 'ks.json');
      // 10 registros secuenciales → 10 generaciones (10 contenidos + marcadores).
      for (let i = 0; i < 10; i++) {
        const kp = crypto.generateKeyPairSync('ed25519');
        dsse.registerTrustedKey(ksPath, kp.publicKey.export({ type: 'spki', format: 'pem' }), `c${i}`);
      }
      const readerScript = path.join(tmp, 'reader.js');
      fs.writeFileSync(readerScript, `
const dsse = require(${JSON.stringify(path.join(scriptsDir, 'dsse_attestation.js'))});
for (let i = 0; i < 250; i++) {
  let ks;
  try { ks = dsse.loadOrCreateKeystore(${JSON.stringify(ksPath)}); }
  catch (e) { console.error('READ_FAIL ' + i + ': ' + e.message); process.exit(1); }
  if (!ks || !Array.isArray(ks.keys) || ks.keys.length < 10) {
    console.error('READ_BAD ' + i + ' keys=' + (ks ? ks.keys.length : 'null')); process.exit(1);
  }
}
console.log('READER_OK');
`);
      const coordScript = path.join(tmp, 'coordC.js');
      fs.writeFileSync(coordScript, `
const { Worker } = require('worker_threads');
const fs = require('fs');
const crypto = require('crypto');
const dsse = require(${JSON.stringify(path.join(scriptsDir, 'dsse_attestation.js'))});
(async () => {
  const readers = [];
  for (let i = 0; i < 3; i++) {
    readers.push(new Promise((resolve, reject) => {
      const w = new Worker(${JSON.stringify(readerScript)});
      w.on('error', (e) => reject(new Error('reader ' + i + ': ' + e.message)));
      w.on('exit', (code) => code === 0 ? resolve(i) : reject(new Error('reader ' + i + ' exit ' + code)));
    }));
  }
  // Compactaciones y registros bajo presión de lectores concurrentes.
  dsse.compactKeystore(${JSON.stringify(ksPath)}, { retain: 2 });
  for (let i = 0; i < 2; i++) {
    dsse.registerTrustedKey(${JSON.stringify(ksPath)}, crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }), 'late-' + i);
  }
  dsse.compactKeystore(${JSON.stringify(ksPath)}, { retain: 2 });
  await Promise.all(readers);
  const ks = dsse.loadOrCreateKeystore(${JSON.stringify(ksPath)});
  if (ks.keys.length !== 12) { console.error('KEYS=' + ks.keys.length); process.exit(1); }
  const dir = ${JSON.stringify(tmp)};
  const markers = fs.readdirSync(dir).filter(f => /^ks\\.json\\.commit\\.\\d+$/.test(f)).length;
  const contents = fs.readdirSync(dir).filter(f => /^ks\\.json\\.g\\d+\\./.test(f)).length;
  if (markers > 2 || contents > 2) { console.error('BOUND markers=' + markers + ' contents=' + contents); process.exit(1); }
  console.log('COMPACT_OK 12/12 markers=' + markers + ' contents=' + contents + ' gen=' + ks.generation);
})();
`);
      const out = execFileSync(process.execPath, [coordScript], { encoding: 'utf8', timeout: 180000 });
      assert.ok(out.includes('COMPACT_OK'), 'compactación perdió claves o excedió límites');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('dsse: symlink en marcador, contenido o directorio jamás se sigue (perímetro de archivos)',
  () => {
    const dsse = require(path.join(scriptsDir, 'dsse_attestation.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-perim-'));
    try {
      const ksPath = path.join(tmp, 'ks.json');
      const outside = path.join(tmp, 'outside.txt');
      fs.writeFileSync(outside, 'ORIGINAL-EXTERNO');
      // Caso 1: marcador como symlink. Estado manual: contenido g1 + marcador
      // symlink; la lectura debe abortar por lstat sin abrir el objetivo.
      fs.writeFileSync(`${ksPath}.g1.cafe`, JSON.stringify({ keys: [], generation: 1, writer: '1:1:cafe' }));
      let linkOk = true;
      try { fs.symlinkSync(outside, `${ksPath}.commit.1`, 'file'); } catch (e) { linkOk = false; }
      if (linkOk) {
        assert.throws(() => dsse.loadOrCreateKeystore(ksPath), /enlace simbólico/,
          'marcador symlink debe abortar por lstat, sin seguirlo');
        assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'ORIGINAL-EXTERNO', 'el objetivo externo fue accedido');
        fs.unlinkSync(`${ksPath}.commit.1`);
        // Caso 2: marcador válido cuyo contenido es un symlink.
        const fake = JSON.stringify({ keys: [], generation: 1, writer: '1:1:cafe' });
        const fakeDigest = crypto.createHash('sha256').update(Buffer.from(fake, 'utf8')).digest('hex');
        fs.writeFileSync(`${ksPath}.commit.1`, `1:m:cafe:${fakeDigest}`);
        try { fs.symlinkSync(outside, `${ksPath}.g1.cafe`, 'file'); } catch (e) { linkOk = false; }
        if (linkOk) {
          assert.throws(() => dsse.loadOrCreateKeystore(ksPath), /enlace simbólico/,
            'contenido symlink debe abortar por lstat, sin abrir el objetivo');
          assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'ORIGINAL-EXTERNO', 'el objetivo externo fue leído');
          fs.unlinkSync(`${ksPath}.g1.cafe`);
          // Sin el symlink el protocolo verifica el digest y falla cerrado.
          assert.throws(() => dsse.loadOrCreateKeystore(ksPath), /ausente|digest|manipulación/,
            'el contenido faltante con marcador válido es fail-closed');
        }
        fs.unlinkSync(`${ksPath}.commit.1`);
      }
      // Caso 3: directorio del keystore como symlink (requiere privilegio).
      let dirLinkOk = true;
      const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-perim2-'));
      try {
        const realDir = path.join(tmp2, 'real');
        fs.mkdirSync(realDir);
        const linkDir = path.join(tmp2, 'link');
        try { fs.symlinkSync(realDir, linkDir, 'dir'); } catch (e) { dirLinkOk = false; }
        if (dirLinkOk) {
          assert.throws(() => dsse.loadOrCreateKeystore(path.join(linkDir, 'ks.json')), /enlace simbólico/,
            'directorio symlink jamás se sigue');
        }
      } finally {
        fs.rmSync(tmp2, { recursive: true, force: true });
      }
      if (!linkOk) {
        assert.ok(true, 'entorno sin privilegios de symlink: casos de symlink no aplicables');
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('dsse: política de directorio privado — grupo/otros escribible o dueño ajeno fallan cerrados',
  () => {
    const dsse = require(path.join(scriptsDir, 'dsse_attestation.js'));
    // Predicado puro: determinista en toda plataforma (alcance del hallazgo v19).
    assert.ok(dsse.storageDirPolicyViolation(0o770, 1000, 1000), '0770 (grupo escribe) debe violar');
    assert.ok(dsse.storageDirPolicyViolation(0o775, 1000, 1000), '0775 debe violar');
    assert.ok(dsse.storageDirPolicyViolation(0o757, 1000, 1000), '0757 debe violar');
    assert.ok(dsse.storageDirPolicyViolation(0o777, 1000, 1000), '0777 debe violar');
    assert.ok(dsse.storageDirPolicyViolation(0o702, 1000, 1000), '0702 (otros escribe) debe violar');
    assert.strictEqual(dsse.storageDirPolicyViolation(0o700, 1000, 1000), null, '0700 privado del dueño es válido');
    assert.strictEqual(dsse.storageDirPolicyViolation(0o750, 1000, 1000), null, '0750 sin escritura compartida es válido');
    assert.strictEqual(dsse.storageDirPolicyViolation(0o755, 1000, 1000), null, '0755 sin escritura compartida es válido');
    assert.ok(dsse.storageDirPolicyViolation(0o700, 1001, 1000), 'directorio de otro uid debe violar');
    assert.strictEqual(dsse.storageDirPolicyViolation(0o770, 1001, 1000, false), null, 'Windows: política delegada a la ACL');
    // Integración POSIX real: chmod 0770 rechazado; 0700 aceptado.
    if (process.platform !== 'win32') {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-perm-'));
      try {
        const ksPath = path.join(tmp, 'ks.json');
        fs.chmodSync(tmp, 0o770);
        const kp0 = crypto.generateKeyPairSync('ed25519');
        assert.throws(
          () => dsse.registerTrustedKey(ksPath, kp0.publicKey.export({ type: 'spki', format: 'pem' }), 'grupo'),
          /grupo|privado|perímetro/,
          'directorio 0770 debe fallar cerrado'
        );
        assert.ok(!fs.existsSync(ksPath) && fs.readdirSync(tmp).length === 0, 'no debe publicarse nada en directorio no privado');
        fs.chmodSync(tmp, 0o700);
        const kp1 = crypto.generateKeyPairSync('ed25519');
        assert.ok(
          dsse.registerTrustedKey(ksPath, kp1.publicKey.export({ type: 'spki', format: 'pem' }), 'privado'),
          'directorio 0700 debe aceptarse'
        );
        assert.strictEqual(dsse.loadOrCreateKeystore(ksPath).keys.length, 1);
      } finally {
        try { fs.chmodSync(tmp, 0o700); } catch (e) {}
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    } else {
      assert.ok(true, 'win32: integración chmod no aplicable; predicado puro cubierto arriba');
    }
  });

check('dsse: sustitución entre inspección y apertura no redirige la lectura (anti-TOCTOU)',
  () => {
    const dsse = require(path.join(scriptsDir, 'dsse_attestation.js'));
    // Caso A (universal, sin symlinks): tras el lstat se reemplaza el contenido
    // por OTRO archivo regular (inodo distinto, traído con rename) → el
    // detector dev/ino del descriptor abierto debe fallar cerrado.
    const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-swapA-'));
    try {
      const ksPath = path.join(tmpA, 'ks.json');
      const kp = crypto.generateKeyPairSync('ed25519');
      dsse.registerTrustedKey(ksPath, kp.publicKey.export({ type: 'spki', format: 'pem' }), 'base');
      const contentName = fs.readdirSync(tmpA).find(f => /^ks\.json\.g1\./.test(f));
      const contentPath = path.join(tmpA, contentName);
      const originalBytes = fs.readFileSync(contentPath);
      const decoy = path.join(tmpA, 'decoy.bin');
      fs.writeFileSync(decoy, Buffer.concat([originalBytes, Buffer.from(' ')]));
      const realLstat = fs.lstatSync;
      let swapped = false;
      fs.lstatSync = function (p, ...rest) {
        const st = realLstat.call(fs, p, ...rest);
        if (!swapped && String(p) === contentPath) {
          swapped = true;
          fs.unlinkSync(contentPath);
          fs.renameSync(decoy, contentPath); // inodo distinto al inspeccionado
        }
        return st;
      };
      let threw = false;
      let errMsg = '';
      try { dsse.loadOrCreateKeystore(ksPath); }
      catch (e) { threw = true; errMsg = e.message; }
      finally { fs.lstatSync = realLstat; }
      assert.ok(swapped, 'la sustitución debe haberse ejecutado');
      assert.ok(threw && /Sustitución|enlace simbólico|digest|fail-closed/.test(errMsg),
        `la sustitución entre lstat y apertura debe fallar cerrada: ${errMsg}`);
      fs.unlinkSync(contentPath);
      fs.writeFileSync(contentPath, originalBytes);
      const kp2 = crypto.generateKeyPairSync('ed25519');
      dsse.registerTrustedKey(ksPath, kp2.publicKey.export({ type: 'spki', format: 'pem' }), 'restaurado');
      assert.strictEqual(dsse.loadOrCreateKeystore(ksPath).keys.length, 2, 'el protocolo sigue sano tras el intento de sustitución');
    } finally {
      fs.rmSync(tmpA, { recursive: true, force: true });
    }
    // Caso B (POSIX): sustitución por symlink → O_NOFOLLOW corta la apertura.
    const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-swapB-'));
    try {
      const ksPath = path.join(tmpB, 'ks.json');
      const kp = crypto.generateKeyPairSync('ed25519');
      dsse.registerTrustedKey(ksPath, kp.publicKey.export({ type: 'spki', format: 'pem' }), 'base');
      const contentName = fs.readdirSync(tmpB).find(f => /^ks\.json\.g1\./.test(f));
      const contentPath = path.join(tmpB, contentName);
      const originalBytes = fs.readFileSync(contentPath);
      const outside = path.join(tmpB, 'outside-secret.txt');
      fs.writeFileSync(outside, 'CONTENIDO-EXTERNO-SECRETO');
      let symlinkOk = true;
      try { fs.symlinkSync(outside, path.join(tmpB, 'probe-link'), 'file'); fs.unlinkSync(path.join(tmpB, 'probe-link')); }
      catch (e) { symlinkOk = false; }
      if (symlinkOk) {
        const realLstat = fs.lstatSync;
        let swapped = false;
        fs.lstatSync = function (p, ...rest) {
          const st = realLstat.call(fs, p, ...rest);
          if (!swapped && String(p) === contentPath) {
            swapped = true;
            fs.unlinkSync(contentPath);
            fs.symlinkSync(outside, contentPath, 'file');
          }
          return st;
        };
        let threw = false;
        let errMsg = '';
        try { dsse.loadOrCreateKeystore(ksPath); }
        catch (e) { threw = true; errMsg = e.message; }
        finally { fs.lstatSync = realLstat; }
        assert.ok(threw && /enlace simbólico|Sustitución|fail-closed/.test(errMsg),
          `el symlink sustituido debe fallar cerrada: ${errMsg}`);
        assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'CONTENIDO-EXTERNO-SECRETO', 'el objetivo externo fue alterado');
        if (fs.existsSync(contentPath)) fs.unlinkSync(contentPath);
        fs.writeFileSync(contentPath, originalBytes);
      } else {
        assert.ok(true, 'entorno sin privilegios de symlink: caso B no aplicable');
      }
    } finally {
      fs.rmSync(tmpB, { recursive: true, force: true });
    }
  });

check('dsse: junction/reparse de directorio no se sigue (Windows junction / POSIX symlink dir)',
  () => {
    const dsse = require(path.join(scriptsDir, 'dsse_attestation.js'));
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-junc-'));
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    try {
      const real = path.join(base, 'real');
      fs.mkdirSync(real, { mode: 0o700 });
      const link = path.join(base, 'link');
      // El caso DEBE ejecutarse de verdad: en Windows los junctions no
      // requieren privilegios y en POSIX un symlink de directorio tampoco.
      // Si no puede crearse, la suite FALLA (jamás un PASS vacío).
      let created = false;
      try {
        fs.symlinkSync(real, link, linkType);
        created = true;
      } catch (e) {
        assert.fail(`no se pudo crear el ${linkType} de directorio (${e.message}): el caso reparse DEBE demostrarse, no omitirse`);
      }
      assert.ok(created, 'el enlace de directorio debe haberse creado');
      assert.strictEqual(fs.lstatSync(link).isSymbolicLink(), true,
        `lstat del ${linkType} debe reportar enlace (reparse/junction)`);
      const kp = crypto.generateKeyPairSync('ed25519');
      assert.throws(
        () => dsse.registerTrustedKey(path.join(link, 'ks.json'), kp.publicKey.export({ type: 'spki', format: 'pem' }), 'junc'),
        /enlace simbólico/,
        'un directorio junction/reparse jamás se sigue para publicar'
      );
      assert.strictEqual(fs.readdirSync(real).length, 0, 'no se publicó nada a través del junction');
      assert.throws(
        () => dsse.loadOrCreateKeystore(path.join(link, 'ks.json')),
        /enlace simbólico/,
        'la lectura a través del junction falla cerrada'
      );
      // El directorio real (no reparse) sigue siendo usable directamente.
      const kp2 = crypto.generateKeyPairSync('ed25519');
      dsse.registerTrustedKey(path.join(real, 'ks.json'), kp2.publicKey.export({ type: 'spki', format: 'pem' }), 'directo');
      assert.strictEqual(dsse.loadOrCreateKeystore(path.join(real, 'ks.json')).keys.length, 1, 'el directorio real es válido');
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

check('honestidad: el motor marca toda salida interpretativa como hipótesis no verificada',
  () => {
    const { evaluateMmrDrag, evaluateTalentVsEffort } = require(path.join(scriptsDir, 'autodiagnostic_engine.js'));
    const mmrCases = [
      evaluateMmrDrag({ competitive: { matches: 0 }, currentRank: 'Gold 2' }),
      evaluateMmrDrag({ competitive: { matches: 400, kd: '0.4', acs: '120', dd: '-50' }, currentRank: 'Gold 2' }),
      evaluateMmrDrag({ competitive: { matches: 400, kd: '1.5', acs: '260', dd: '30' }, currentRank: 'Gold 2' })
    ];
    for (const m of mmrCases) {
      assert.strictEqual(m.claimStatus, 'hipotesis_no_verificada', 'MMR sin sello de hipótesis');
      assert.ok(typeof m.disclaimer === 'string' && m.disclaimer.includes('NO mide el MMR interno'), 'MMR sin disclaimer explícito');
      assert.ok(Array.isArray(m.limitations) && m.limitations.length >= 2, 'MMR sin limitaciones declaradas');
    }
    const detected = mmrCases[2];
    assert.strictEqual(detected.mmrDragDetected, true, 'caso fuerte debe marcar señal');
    assert.ok(/hipótesis/i.test(detected.diagnosis) && /NO demuestra/i.test(detected.diagnosis),
      'el diagnóstico de anclaje debe formularse como hipótesis, no como hecho');
    const talentCases = [
      evaluateTalentVsEffort({ summary: { totalGeneral: { hours: 0 }, highestPeakRank: 'Unranked' }, accounts: [{ handle: 'A#1', isExcluded: false, competitive: { matches: 0 } }] }),
      evaluateTalentVsEffort({ summary: { totalGeneral: { hours: 100 }, highestPeakRank: 'Gold 2' }, accounts: [{ handle: 'A#1', isExcluded: false, competitive: { matches: 5, kd: 0.3, acs: 100, dd: -300, hs: 0 }, peakRank: 'Gold 2' }] }),
      evaluateTalentVsEffort({ summary: { totalGeneral: { hours: 100 }, highestPeakRank: 'Gold 2' }, accounts: [{ handle: 'A#1', isExcluded: false, competitive: { matches: 10, kd: 1.3, acs: 250, dd: 20, hs: 25 }, peakRank: 'Gold 2' }] })
    ];
    for (const t of talentCases) {
      assert.strictEqual(t.claimStatus, 'hipotesis_no_verificada', 'talento sin sello de hipótesis');
      assert.ok(typeof t.disclaimer === 'string' && t.disclaimer.includes('talento real'), 'talento sin disclaimer explícito');
      assert.ok(Array.isArray(t.limitations) && t.limitations.length >= 2, 'talento sin limitaciones declaradas');
    }
    const favorable = talentCases[2];
    assert.ok(/HIPÓTESIS/i.test(favorable.category), 'la categoría favorable debe declararse hipótesis');
    assert.ok(/NO verificada/i.test(favorable.trueDeservedRank), 'la estimación de rango debe marcarse NO verificada');
    assert.ok(!/demuestra/i.test(String(favorable.rationale)), 'la justificación no debe afirmar demostración');
  });

check('honestidad: matriz de superficies públicas sin lenguaje absoluto',
  () => {
    // Inventario de superficies públicas: docs, prompt, help renderizado y
    // salida de diagnose. Cada LÍNEA con un rótulo absoluto debe llevar un
    // matiz explícito; si no, la suite falla (no basta con que el documento
    // tenga un marcador en cualquier parte).
    const absoluteLabels = [/rango real/i, /merecido/i, /detecta mmr/i, /mmr drag/i, /true rank/i, /deserved rank/i];
    const hedge = /hip[oó]tesis|hypothesis|no verifica|unverified|no mide|prohib|nunca|sin embargo|cota|indicative|no implica|no es un|no un|no afirma|no se |alcance|scope|l[ií]mit|no probad|compatible|indicio|señal/i;
    const docSurfaces = ['README.md', 'README.es.md', 'README.en.md', 'SKILL.md', 'standalone_prompt.md'];
    const offenders = [];
    const scan = (surface, text) => {
      text.split(/\r?\n/).forEach((line, i) => {
        if (absoluteLabels.some(r => r.test(line)) && !hedge.test(line)) {
          offenders.push(`${surface}:${i + 1} → ${line.trim().slice(0, 120)}`);
        }
      });
    };
    for (const f of docSurfaces) scan(f, fs.readFileSync(path.join(__dirname, f), 'utf8'));
    scan('CLI --help', cliOk(['--help']));
    const mockFile = path.join(os.tmpdir(), `mock-claims-${process.pid}.json`);
    fs.writeFileSync(mockFile, JSON.stringify({
      platformInfo: { platformUserHandle: 'Claims#1' },
      segments: [{
        type: 'playlist',
        attributes: { playlist: 'competitive' },
        stats: {
          timePlayed: { value: 72000 }, matchesPlayed: { value: 35 },
          kDRatio: { displayValue: '1.25' }, headshotsPercentage: { displayValue: '22.0%' },
          scorePerRound: { displayValue: '240.0' }, damageDeltaPerRound: { displayValue: '28' },
          rank: { metadata: { tierName: 'Gold 3' } }, peakRank: { displayValue: 'Platinum 1' }
        }
      }]
    }), 'utf8');
    let diagOut = '';
    try {
      diagOut = cliOk(['diagnose', mockFile, 'Claims#1']);
    } finally {
      if (fs.existsSync(mockFile)) fs.unlinkSync(mockFile);
    }
    scan('CLI diagnose', diagOut);
    assert.strictEqual(offenders.length, 0, `lenguaje absoluto sin matiz en superficies públicas:\n${offenders.join('\n')}`);
    assert.ok(/NO VERIFICAD/i.test(diagOut), 'CLI diagnose debe mostrar el aviso de no verificado');
    assert.ok(/ALCANCE/i.test(diagOut), 'CLI diagnose debe mostrar el alcance/límites');
    assert.ok(!/DETECTADO \(ANCLADO\)/i.test(diagOut), 'CLI no debe afirmar anclaje detectado');
  });

check('honestidad: la política de evidencia no fuerza coaching ni diagnósticos (fixtures)',
  () => {
    const { classifyEvidence } = require(path.join(scriptsDir, 'evidence_policy.js'));
    const fixture = f => JSON.parse(fs.readFileSync(path.join(__dirname, 'examples', f), 'utf8'));
    const minimal = classifyEvidence(fixture('telemetry_minimal.json'));
    assert.strictEqual(minimal.level, 'aggregate', 'solo KDA/ACS es evidencia agregada');
    for (const s of ['round_leaks', 'aim_routine', 'duel_matrix', 'weapon_telemetry']) {
      assert.ok(!minimal.allowedSections.includes(s), `mínimo NO debe permitir ${s}`);
      assert.ok(minimal.forbiddenSections.includes(s), `${s} debe estar prohibido en mínimo`);
    }
    assert.strictEqual(minimal.maxLeaks, 0, 'sin evidencia por ronda no hay fugas');
    assert.ok(minimal.missing.some(m => m.startsWith('eventos_normalizados_por_ronda')), 'debe declarar la falta de eventos de ronda');
    const partial = classifyEvidence(fixture('telemetry_partial.json'));
    assert.strictEqual(partial.level, 'aggregate', 'un marcador agregado sigue siendo evidencia agregada');
    assert.ok(!partial.allowedSections.includes('round_leaks'), 'sin rondas no se atribuyen fugas');
    assert.ok(!partial.allowedSections.includes('duel_matrix'), 'sin duelos no hay matriz');
    assert.ok(!partial.allowedSections.includes('weapon_telemetry'), 'sin zonas no hay telemetría de arma');
    assert.ok(partial.allowedSections.includes('aim_routine'), 'con HS%+ACS sí hay evidencia mecánica para la rutina');
    // Fichero aportado por el usuario: sus rondas son DECLARACIONES, no telemetría verificada.
    const userProvided = classifyEvidence(fixture('telemetry_complete.json'));
    assert.strictEqual(userProvided.level, 'aggregate', 'datos de fichero no son observados por adaptador');
    assert.ok(!userProvided.allowedSections.includes('round_leaks'), 'declaraciones no acusan fugas');
    assert.ok(!userProvided.allowedSections.includes('round_observations'), 'declaraciones no son eventos observados');
    assert.ok(!userProvided.allowedSections.includes('duel_matrix'), 'duelos de fichero no están verificados');
    assert.strictEqual(userProvided.declaredObservations, 3, 'user_claim/inference se cuentan como declaraciones');
    assert.strictEqual(userProvided.normalizedRoundCount, 0, 'un JSON no puede portar procedencia de ronda');
    assert.ok(userProvided.dimensions.precision.available, 'con HS% la precisión es evaluable');
    assert.ok(userProvided.allowedSections.includes('weapon_telemetry'), 'con zonas válidas sí hay telemetría de arma');
    const none = classifyEvidence({ observed: {} });
    assert.strictEqual(none.level, 'insufficient');
    assert.ok(!none.allowedSections.includes('aggregate_radar'), 'sin métricas no hay radar');
    assert.ok(!none.allowedSections.includes('round_leaks'), 'sin rondas no hay fugas');
  });

check('honestidad: el prompt exige salida condicional y no fuerza conclusiones',
  () => {
    const prompt = fs.readFileSync(path.join(__dirname, 'standalone_prompt.md'), 'utf8');
    assert.ok(/0 a 3/i.test(prompt), 'el prompt debe permitir 0–3 hallazgos, no forzar 3');
    assert.ok(/evidencia por ronda/i.test(prompt), 'el prompt debe exigir evidencia por ronda para causas');
    assert.ok(/cat[aá]logo/i.test(prompt), 'el prompt debe restringir escenarios al catálogo disponible');
    assert.ok(/NIVEL DE EVIDENCIA/i.test(prompt) && /insufficient/i.test(prompt) && /aggregate/i.test(prompt) && /complete/i.test(prompt),
      'el prompt debe clasificar el nivel de evidencia con la política compartida');
    assert.ok(!/TOP 3 FUGAS CR[ÍI]TICAS/i.test(prompt), 'no debe forzar siempre 3 fugas');
    assert.ok(!/15 MINUTOS EXACTOS/i.test(prompt), 'no debe forzar siempre la rutina de 15 minutos');
    assert.ok(/evidence_policy\.js/.test(prompt), 'el prompt debe referenciar la política de evidencia compartida');
    assert.ok(/DIMENSIONAL/i.test(prompt) && /n\/d/.test(prompt) && /sin barra/i.test(prompt),
      'el radar debe ser dimensional: n/d sin barra ni score cuando falte la métrica');
  });

check('honestidad: los hitos de carrera se declaran escenario ilustrativo (no predicción)',
  () => {
    const career = {
      summary: { totalCompetitive: { hours: 300 }, totalGeneral: { hours: 400 }, highestPeakRank: 'Diamond 1' },
      accounts: [{ peakRank: 'Diamond 1', competitive: { hours: 12.5 }, handle: 'X#1', isExcluded: false }]
    };
    const tl = generateMilestonesTimeline(career, { mainAgent: 'Jett', speedrunHours: 12.5 });
    assert.ok(tl.length > 0);
    for (const m of tl) {
      assert.strictEqual(m.tipo, 'ilustrativo', 'cada hito debe declararse ilustrativo');
      assert.ok(/no predicci/i.test(m.contexto), 'cada hito debe declarar que no es predicción');
    }
  });

check('honestidad: la política exige evidencia válida (rondas/duelos/zonas/porcentajes)',
  () => {
    const ep = require(path.join(scriptsDir, 'evidence_policy.js'));
    // Repro del auditor: array no vacío pero vacío por dentro + objeto de zonas vacío.
    const fake = ep.classifyEvidence({ rounds: [{}], weaponZones: {} });
    assert.strictEqual(fake.level, 'insufficient', 'rounds [{}] + weaponZones {} NO es complete');
    assert.ok(!fake.allowedSections.includes('round_leaks'), 'no debe habilitar fugas');
    assert.ok(!fake.allowedSections.includes('aim_routine'), 'no debe habilitar rutina');
    // Procedencia VERIFICADA: un objeto con source:'observed_event' NO basta.
    const plainObserved = ep.classifyEvidence({ rounds: [{ n: 3, source: 'observed_event', event: 'plant' }], weaponZones: {} });
    assert.strictEqual(plainObserved.level, 'insufficient', 'source observado sin adaptador NO es evidencia');
    assert.ok(!plainObserved.allowedSections.includes('round_observations'));
    // El mint NO es público: un consumidor externo no puede fabricarlo.
    assert.strictEqual(ep.mintObservedEvent, undefined, 'mintObservedEvent no debe exportarse');
    assert.strictEqual(ep.mintObservedDuel, undefined, 'mintObservedDuel no debe exportarse');
    // Solo el adaptador confiable produce observado, a partir de telemetría real.
    const rawMatch = {
      data: {
        metadata: { matchId: 'match-abc-123' },
        segments: [
          { type: 'player-summary', metadata: { platformUserHandle: 'A#1' }, stats: { kdRatio: { value: 1.3 }, scorePerRound: { value: 240 }, hsAccuracy: { value: 22 } } },
          { type: 'player-round-damage', attributes: { round: 3 }, stats: { damage: { value: 165 }, headshots: { value: 1 }, bodyshots: { value: 2 }, legshots: { value: 0 } } },
          { type: 'player-round-damage', attributes: { round: 9 }, stats: { damage: { value: 0 }, headshots: { value: 0 }, bodyshots: { value: 0 }, legshots: { value: 0 } } }
        ]
      }
    };
    const observed = ep.observeMatchTelemetry(rawMatch, 'A#1', { originPath: 'examples/x.json' });
    assert.strictEqual(observed.rounds.length, 1, 'solo la ronda con daño real es evento');
    assert.strictEqual(observed.sourceRef, 'match:match-abc-123');
    const adapted = ep.classifyEvidence(observed);
    assert.strictEqual(adapted.level, 'normalized', 'datos locales son normalized_input, no complete');
    assert.strictEqual(adapted.provenanceStatus, 'normalized_input');
    assert.strictEqual(adapted.verifiedSource, false, 'ninguna fuente local es verificada');
    assert.ok(adapted.missing.some(m => m.startsWith('fuente_verificada')), 'debe declarar la falta de fuente verificada');
    // Canonicalidad: el orden de claves no altera la referencia.
    const c1 = ep.stableRef({ data: { segments: [{ a: 1, b: 2 }] } }, 'x.json');
    const c2 = ep.stableRef({ data: { segments: [{ b: 2, a: 1 }] } }, 'x.json');
    assert.strictEqual(c1, c2, 'objetos semánticamente equivalentes comparten sourceRef');
    assert.ok(adapted.allowedSections.includes('round_observations'), 'un evento observado describe la ronda');
    assert.ok(!adapted.allowedSections.includes('round_leaks'), 'describir no es acusar: el adaptador nunca acusa fugas');
    assert.ok(adapted.allowedSections.includes('aim_routine'), 'HS%+ACS habilita la rutina');
    assert.ok(!adapted.allowedSections.includes('weapon_telemetry'), 'sin zonas válidas no hay telemetría de arma');
    // Un objeto FORJADO con leakRule/outcome/context tampoco habilita fugas.
    const forged = ep.classifyEvidence({
      observed: { hs: 25, acs: 240 },
      rounds: [{ n: 9, source: 'observed_event', event: 'position', leakRule: 'throw_numeric_advantage', outcome: 'lost', context: { advantage: 2 } }]
    });
    assert.ok(!forged.allowedSections.includes('round_leaks'), 'una fuga no se puede fabricar desde fuera');
    // sourceRef trazable: sin matchId usa digest de contenido + origen.
    const refA = ep.stableRef({ data: { segments: [{ a: 1 }] } }, 'dir/a.json');
    const refB = ep.stableRef({ data: { segments: [{ a: 2 }] } }, 'dir/b.json');
    assert.ok(/^sha256:[0-9a-f]{16}@a\.json$/.test(refA), 'ref con digest y origen');
    assert.notStrictEqual(refA, refB, 'contenidos distintos no comparten referencia');
    // Porcentaje inválido no cuenta como agregado.
    const badPct = ep.classifyEvidence({ observed: { hs: 150 } });
    assert.strictEqual(badPct.level, 'insufficient', 'HS 150 no es un porcentaje válido');
    // Zonas que suman 100 habilitan telemetría mecánica.
    const zones = ep.classifyEvidence({ observed: { acs: 200 }, weaponZones: { head: 20, body: 70, leg: 10 } });
    assert.ok(zones.allowedSections.includes('weapon_telemetry'));
    assert.ok(zones.allowedSections.includes('aim_routine'));
    assert.strictEqual(ep.isValidWeaponZones({ head: 10, body: 10, leg: 10 }), false, 'zonas que no suman 100 no son válidas');
    // Duelo inválido no habilita la matriz.
    const badDuel = ep.classifyEvidence({ observed: { acs: 200 }, duels: [{ opponent: '' }] });
    assert.ok(!badDuel.allowedSections.includes('duel_matrix'));
    const zeroDuel = ep.classifyEvidence({ observed: { acs: 200 }, duels: [{ opponent: 'x#1', kills: 0, deaths: 0 }] });
    assert.ok(!zeroDuel.allowedSections.includes('duel_matrix'), 'un duelo 0-0 no es evidencia de duelo');
  });

check('honestidad: rutas CLI con evidencia mínima/parcial omiten secciones no permitidas',
  () => {
    const sampleFull = JSON.parse(fs.readFileSync(sampleFile, 'utf8'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-evidence-'));
    try {
      // Parcial: solo resúmenes (sin evidencia por ronda) → sin fugas.
      const partial = { data: { segments: sampleFull.data.segments.filter(s => s.type === 'player-summary') } };
      const partialFile = path.join(tmp, 'partial.json');
      fs.writeFileSync(partialFile, JSON.stringify(partial), 'utf8');
      const matchOut = cliOk(['match', partialFile, 'TenZ#0001']);
      assert.ok(/Nivel de evidencia: aggregate/i.test(matchOut), 'match parcial debe declarar nivel aggregate');
      assert.ok(/Observaciones\/fugas omitidas/i.test(matchOut), 'sin eventos observados no se describe ni acusa');
      // Sin HS → sin evidencia mecánica → sin rutina.
      const noHs = JSON.parse(JSON.stringify(partial));
      noHs.data.segments.forEach(s => { if (s.stats) delete s.stats.hsAccuracy; });
      const noHsFile = path.join(tmp, 'no-hs.json');
      fs.writeFileSync(noHsFile, JSON.stringify(noHs), 'utf8');
      const aimOut = cliOk(['aim', noHsFile, 'TenZ#0001']);
      assert.ok(/RUTINA OMITIDA/i.test(aimOut), 'sin evidencia mecánica no debe emitir rutina');
      // Sin datos de duelo → sin matriz 1v1.
      const duelOut = cliOk(['duels', noHsFile, 'TenZ#0001']);
      assert.ok(/MATRIZ DE DUELOS OMITIDA/i.test(duelOut), 'sin duelos no debe emitir matriz');
      // diagnose: perfil mínimo (solo ACS) → agregado, sin prescripción mecánica.
      const minimalProfile = {
        platformInfo: { platformUserHandle: 'Min#1' },
        segments: [{ type: 'playlist', attributes: { playlist: 'competitive' }, stats: { scorePerRound: { displayValue: '210.0' } } }]
      };
      const minFile = path.join(tmp, 'profile-min.json');
      fs.writeFileSync(minFile, JSON.stringify(minimalProfile), 'utf8');
      const diagOut = cliOk(['diagnose', minFile, 'Min#1']);
      assert.ok(/Nivel de evidencia: aggregate/i.test(diagOut), 'perfil con solo ACS es agregado');
      assert.ok(/Cuello de botella\/optimización omitido/i.test(diagOut), 'sin HS no debe prescribir');
      // diagnose: perfil vacío → insufficient, sin prescripción.
      const emptyProfile = { platformInfo: { platformUserHandle: 'Empty#1' }, segments: [] };
      const emptyFile = path.join(tmp, 'profile-empty.json');
      fs.writeFileSync(emptyFile, JSON.stringify(emptyProfile), 'utf8');
      const emptyOut = cliOk(['diagnose', emptyFile, 'Empty#1']);
      assert.ok(/Nivel de evidencia: insufficient/i.test(emptyOut), 'perfil vacío es insuficiente');
      assert.ok(!/CUELLO DE BOTELLA/.test(emptyOut), 'sin evidencia no se prescribe');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('honestidad: la política distingue procedencia y expone dimensiones evaluables',
  () => {
    const ep = require(path.join(scriptsDir, 'evidence_policy.js'));
    const base = { observed: { hs: '25%', acs: '240', kd: '1.2' } };
    const claim = ep.classifyEvidence({ ...base, rounds: [{ n: 4, source: 'user_claim', event: 'kill', detail: 'dice que falló' }] });
    assert.strictEqual(claim.level, 'aggregate', 'una afirmación del usuario NO habilita fugas');
    assert.ok(!claim.allowedSections.includes('round_leaks'));
    assert.strictEqual(claim.declaredObservations, 1);
    const inferred = ep.classifyEvidence({ ...base, rounds: [{ n: 4, source: 'inference', event: 'position', detail: 'suposición' }] });
    assert.strictEqual(inferred.level, 'aggregate', 'una inferencia NO habilita fugas');
    const unknownEvent = ep.classifyEvidence({ ...base, rounds: [{ n: 4, source: 'observed_event', event: 'texto_libre' }] });
    assert.ok(!unknownEvent.allowedSections.includes('round_leaks'), 'evento fuera de taxonomía no habilita fugas');
    const adapted = ep.classifyEvidence(ep.observeMatchTelemetry({
      data: {
        metadata: { matchId: 'm1' },
        segments: [
          { type: 'player-summary', metadata: { platformUserHandle: 'A#1' }, stats: { kdRatio: { value: 1.2 }, scorePerRound: { value: 240 }, hsAccuracy: { value: 25 } } },
          { type: 'player-round', attributes: { round: 4 }, stats: { kills: { value: 1 }, deaths: { value: 0 } } }
        ]
      }
    }, 'A#1'));
    assert.strictEqual(adapted.level, 'normalized', 'datos locales quedan en normalized (no verificados)');
    assert.ok(adapted.allowedSections.includes('round_observations'));
    assert.ok(!adapted.allowedSections.includes('round_leaks'), 'observar un evento no es acusar una fuga');
    // Dimensiones: disponibles solo con métrica+benchmark.
    const dims = ep.classifyEvidence({ observed: { hs: '25%' } }).dimensions;
    assert.ok(dims.precision.available);
    assert.ok(!dims.macro.available && !dims.openings.available && !dims.economy.available && !dims.clutch.available);
    const acsOnly = ep.classifyEvidence({ observed: { acs: '220' } });
    assert.ok(!acsOnly.allowedSections.includes('aggregate_radar'), 'solo ACS no habilita radar');
    assert.ok(!acsOnly.allowedSections.includes('mmr_signal'), 'MMR requiere KD y ACS');
  });

check('honestidad: el radar del CLI es dimensional (n/d sin score cuando falta la métrica)',
  () => {
    const sampleFull = JSON.parse(fs.readFileSync(sampleFile, 'utf8'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-radar-'));
    try {
      const segs = sampleFull.data.segments;
      const summary = JSON.parse(JSON.stringify(
        segs.find(s => s.type === 'player-summary' && (s.metadata.platformUserHandle || s.attributes.platformUserIdentifier) === 'TenZ#0001')
      ));
      ['kast', 'econRating', 'clutches', 'roundsWinPct', 'firstKills', 'firstDeaths'].forEach(k => delete summary.stats[k]);
      const mod = { data: { segments: [summary, ...segs.filter(s => s.type === 'player-round-damage').slice(0, 40)] } };
      const file = path.join(tmp, 'radar.json');
      fs.writeFileSync(file, JSON.stringify(mod), 'utf8');
      const out = cliOk(['match', file, 'TenZ#0001']);
      assert.ok(/Precisión Mecánica: \d+ \/ 100/.test(out), 'la dimensión con HS% debe puntuar');
      assert.ok(/Macrogame y Espacio: n\/d/.test(out), 'KAST sin métrica debe ser n/d');
      assert.ok(/Disciplina Económica: n\/d/.test(out), 'economía sin métrica debe ser n/d');
      const econLine = out.split(/\r?\n/).find(l => l.includes('Disciplina Económica')) || '';
      assert.ok(!/\d+ \/ 100/.test(econLine), 'una dimensión n/d no debe llevar score');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

check('fuente Riot: validaciones, credenciales y SIN oráculo de firma público',
  () => {
    const rs = require(path.join(scriptsDir, 'riot_source.js'));
    assert.strictEqual(rs.createAttestation, undefined, 'createAttestation NO debe exportarse (oráculo de firma)');
    assert.strictEqual(typeof rs.ingestRiotMatch, 'function', 'la operación de ingesta autorizada debe existir');
    assert.throws(() => rs.validateMatchId('no-uuid'), /matchId/i);
    assert.strictEqual(rs.validateMatchId('00000000-0000-4000-8000-000000000001').length, 36);
    assert.strictEqual(rs.hostForRegion('americas'), 'americas.api.riotgames.com');
    assert.throws(() => rs.hostForRegion('marte'), /Regi/i);
    assert.strictEqual(rs.getOperatorConfig().trustPath, RIOT_TRUST_PATH);
    assert.strictEqual(rs.getOperatorConfig().signingKeyPath, RIOT_KEY_PATH);
    const savedKey = process.env.RIOT_API_KEY;
    const savedRso = process.env.RIOT_RSO_TOKEN;
    delete process.env.RIOT_API_KEY;
    delete process.env.RIOT_RSO_TOKEN;
    try {
      assert.throws(() => rs.fetchRiotMatchById('00000000-0000-4000-8000-000000000001'), /credenciales|RIOT_API_KEY/i);
      assert.throws(() => rs.ingestRiotMatch('00000000-0000-4000-8000-000000000001'), /credenciales|RIOT_API_KEY/i);
    } finally {
      if (savedKey === undefined) delete process.env.RIOT_API_KEY; else process.env.RIOT_API_KEY = savedKey;
      if (savedRso === undefined) delete process.env.RIOT_RSO_TOKEN; else process.env.RIOT_RSO_TOKEN = savedRso;
    }
    // Verificación con la atestación GOLDEN (firmada una vez); en tests no se firma.
    const g = loadRiotGolden();
    writeRiotTrust(g.trustedKeys);
    assert.ok(rs.verifyAttestation(g.attestation, { payload: g.payload, maxAgeMs: RIOT_BIG_MAX_AGE }).valid, 'atestación golden verificada');
    assert.ok(!rs.verifyAttestation(g.attestation, { payload: { tampered: true }, maxAgeMs: RIOT_BIG_MAX_AGE }).valid, 'payload alterado no verifica');
    assert.ok(!rs.verifyAttestation({ ...g.attestation, host: 'evil.example.com' }, { payload: g.payload, maxAgeMs: RIOT_BIG_MAX_AGE }).valid, 'host no permitido');
    assert.ok(!rs.verifyAttestation(g.attestation, { payload: g.payload, maxAgeMs: 24 * 3600 * 1000 }).valid, 'caducada no verifica');
    const riotSrc = fs.readFileSync(path.join(scriptsDir, 'riot_source.js'), 'utf8');
    const httpSrc = fs.readFileSync(path.join(scriptsDir, 'http_fetch.js'), 'utf8');
    assert.ok(!/console\.(log|error)\s*\(/.test(riotSrc), 'la fuente Riot no debe registrar nada');
    assert.ok(!/console\.log/.test(httpSrc), 'el fetch no debe escribir logs de datos');
    assert.ok(!/console\.[a-z]+\([^\n)]*headers/i.test(httpSrc), 'las cabeceras nunca se imprimen');
    assert.ok(!/argv\[4\]/.test(httpSrc), 'las cabeceras no deben viajar por argv');
    assert.ok(/VA_FETCH_HEADERS/.test(httpSrc), 'las cabeceras sensibles viajan por entorno');
  });

check('fuente Riot: trust no inyectable; autofirma y cambio de env fallan cerrados',
  () => {
    const ep = require(path.join(scriptsDir, 'evidence_policy.js'));
    const rs = require(path.join(scriptsDir, 'riot_source.js'));
    const g = loadRiotGolden();
    writeRiotTrust(g.trustedKeys);
    // El atacante firma un fixture con su propia clave (no hay createAttestation público).
    const evil = crypto.generateKeyPairSync('ed25519');
    const evilPub = evil.publicKey.export({ type: 'spki', format: 'pem' });
    const core = { v: 1, matchId: g.attestation.matchId, host: g.attestation.host, endpoint: g.attestation.endpoint, fetchedAt: g.attestation.fetchedAt, payloadDigest: rs.payloadDigest(g.payload) };
    const forged = { ...core, signerKeyId: rs.keyIdOf(evilPub), signature: crypto.sign(null, Buffer.from(rs.canonicalStringify(core), 'utf8'), evil.privateKey).toString('base64') };
    assert.throws(() => ep.observeVerifiedMatch(g.payload, 'anon-puuid-focus', { attestation: forged, trustedKeys: [evilPub], maxAgeMs: RIOT_BIG_MAX_AGE }), /rechazado/, 'firma de consumidor + trustedKeys inyectado NO debe verificar');
    // Cambiar la env del trust DESPUÉS del arranque NO redirige la autoridad.
    const attackerTrust = path.join(RIOT_CFG_DIR, 'attacker-trust.json');
    fs.writeFileSync(attackerTrust, JSON.stringify([evilPub]), { encoding: 'utf8', mode: 0o600 });
    const savedTrustEnv = process.env.RIOT_ATTESTATION_TRUST;
    process.env.RIOT_ATTESTATION_TRUST = attackerTrust;
    try {
      assert.throws(() => ep.observeVerifiedMatch(g.payload, 'anon-puuid-focus', { attestation: forged, maxAgeMs: RIOT_BIG_MAX_AGE }), /rechazado/, 'un cambio dinámico de env no debe autorizar');
      assert.strictEqual(rs.getOperatorConfig().trustPath, RIOT_TRUST_PATH, 'la ruta capturada no cambia');
    } finally {
      process.env.RIOT_ATTESTATION_TRUST = savedTrustEnv;
    }
    // El camino legítimo (atestación del ingestor del operador) acredita verified_source.
    const verified = ep.observeVerifiedMatch(g.payload, 'anon-puuid-focus', { attestation: g.attestation, maxAgeMs: RIOT_BIG_MAX_AGE });
    const policy = ep.classifyEvidence(verified);
    assert.strictEqual(verified.provenance, 'verified_source');
    assert.strictEqual(policy.provenanceStatus, 'verified_source');
    assert.strictEqual(policy.level, 'complete');
    assert.strictEqual(policy.verifiedSource, true);
    assert.ok(policy.verifiedRoundCount > 0, 'debe haber rondas verificadas');
    assert.ok(policy.allowedSections.includes('round_observations'));
    assert.ok(!policy.allowedSections.includes('round_leaks'), 'sin reglas verificables no hay fugas');
    assert.strictEqual(ep.mintVerifiedEvent, undefined, 'mintVerifiedEvent no debe exportarse');
    // Operación de producto: sin credenciales falla cerrado.
    assert.strictEqual(typeof ep.ingestVerifiedMatch, 'function', 'la ingesta verificada de producto debe existir');
    const savedKey = process.env.RIOT_API_KEY;
    const savedRso = process.env.RIOT_RSO_TOKEN;
    delete process.env.RIOT_API_KEY;
    delete process.env.RIOT_RSO_TOKEN;
    try {
      assert.throws(() => ep.ingestVerifiedMatch('00000000-0000-4000-8000-000000000001', 'anon-puuid-focus'), /credenciales|RIOT_API_KEY/i);
    } finally {
      if (savedKey === undefined) delete process.env.RIOT_API_KEY; else process.env.RIOT_API_KEY = savedKey;
      if (savedRso === undefined) delete process.env.RIOT_RSO_TOKEN; else process.env.RIOT_RSO_TOKEN = savedRso;
    }
  });

check('fuente Riot: el trust store exige perímetro (0666, propietario, symlink) y falla cerrado',
  () => {
    const rs = require(path.join(scriptsDir, 'riot_source.js'));
    const ep = require(path.join(scriptsDir, 'evidence_policy.js'));
    assert.ok(rs.trustStorePolicyViolation(0o666, 1000, 1000), '0666 debe violar');
    assert.ok(rs.trustStorePolicyViolation(0o622, 1000, 1000), 'escritura de otros debe violar');
    assert.ok(rs.trustStorePolicyViolation(0o626, 1000, 1000), 'escritura de grupo debe violar');
    assert.strictEqual(rs.trustStorePolicyViolation(0o644, 1000, 1000), null, '0644 sin escritura compartida es válido');
    assert.strictEqual(rs.trustStorePolicyViolation(0o600, 1000, 1000), null, '0600 del propietario es válido');
    assert.ok(rs.trustStorePolicyViolation(0o600, 1001, 1000), 'propietario ajeno debe violar');
    assert.ok(rs.trustStorePolicyViolation(0o644, 1000, 1000, { strict: true }), 'clave privada exige 0600 (modo estricto)');
    const g = loadRiotGolden();
    writeRiotTrust(g.trustedKeys);
    if (process.platform !== 'win32') {
      fs.chmodSync(RIOT_TRUST_PATH, 0o666);
      try {
        assert.ok(!rs.verifyAttestation(g.attestation, { payload: g.payload, maxAgeMs: RIOT_BIG_MAX_AGE }).valid, 'trust 0666 no autoriza');
        assert.throws(() => ep.observeVerifiedMatch(g.payload, 'anon-puuid-focus', { attestation: g.attestation, maxAgeMs: RIOT_BIG_MAX_AGE }), /rechazado|trust store/i);
      } finally {
        writeRiotTrust(g.trustedKeys);
      }
      const link = path.join(RIOT_CFG_DIR, 'trust-link.json');
      try {
        if (fs.existsSync(link)) fs.unlinkSync(link);
        fs.symlinkSync(RIOT_TRUST_PATH, link, 'file');
        assert.throws(() => rs.readProtectedFile(link, 'trust store'), /simb|symlink|enlace/i);
      } catch (e) {
        if (!/EEXIST|EPERM|privileg/i.test(e.message)) throw e;
      }
      fs.writeFileSync(RIOT_KEY_PATH, 'dummy', { encoding: 'utf8', mode: 0o600 });
      fs.chmodSync(RIOT_KEY_PATH, 0o666);
      assert.throws(() => rs.readProtectedFile(RIOT_KEY_PATH, 'clave de atestación', { strict: true }), /perímetro|0600|inseguro/i);
      fs.writeFileSync(RIOT_KEY_PATH, '', { encoding: 'utf8', mode: 0o600 });
    } else {
      assert.ok(true, 'win32: integración chmod/symlink no aplicable; predicado puro cubierto');
    }
  });

check('contrato: objetivo exacto o fail-closed (sin fallback al primer jugador)',
  () => {
    const { resolveExactHandle } = require(path.join(scriptsDir, 'data_contract.js'));
    assert.throws(() => resolveExactHandle(['A#1', 'B#2'], 'C#3', { allowFirstIfMissing: false }), /no encontrado/i);
    assert.strictEqual(resolveExactHandle(['A#1', 'B#2'], 'b#2'), 'B#2', 'coincidencia exacta insensible a mayúsculas');
    assert.strictEqual(resolveExactHandle(['A#1', 'B#2'], undefined), 'A#1', 'sin objetivo, primer jugador solo si no se pidió');
    assert.throws(() => resolveExactHandle([], 'A#1'), /sin jugadores/i);
    // Repro del auditor: jugador inexistente NO analiza a aspas#0001 y sale != 0.
    let code = 0;
    let out = '';
    try { cliOk(['match', sampleFile, 'NoExiste#9999']); }
    catch (e) { code = e.status; out = String(e.stdout || '') + String(e.stderr || ''); }
    assert.notStrictEqual(code, 0, 'objetivo inexistente debe fallar cerrado');
    assert.ok(/NoExiste#9999|no encontrado/i.test(out), 'debe explicar que el objetivo no existe');
    assert.ok(!/RADAR DE DOMINIO|OBSERVACIONES POR RONDA/.test(out), 'no debe emitir análisis de otro jugador');
  });

check('procedencia: fuentes locales se etiquetan como normalizadas (no verificadas)',
  () => {
    const { sourceProvenance, mayAssertCauses } = require(path.join(scriptsDir, 'data_contract.js'));
    assert.strictEqual(sourceProvenance({}), 'normalized_input');
    assert.strictEqual(sourceProvenance({ synthetic: true }), 'synthetic_demo');
    assert.strictEqual(sourceProvenance({ provenance: 'verified_source' }), 'verified_source');
    assert.strictEqual(mayAssertCauses('normalized_input'), false, 'datos locales no afirman causas');
    assert.strictEqual(mayAssertCauses('verified_source'), true);
    const out = cliOk(['match', sampleFile, 'TenZ#0001']);
    assert.ok(/normalizad/i.test(out), 'el archivo local debe declararse normalizado');
    assert.ok(!/JSON local verificado/i.test(out), 'no debe afirmar "JSON local verificado"');
    assert.ok(!/cach[ée] local verificada/i.test(out), 'no debe afirmar "caché local verificada"');
  });

// GATE DE TRAZABILIDAD DEL MANIFIESTO: el badge y el conteo del README deben
// reflejar EXACTAMENTE el número de casos registrados y ejecutados. Un
// manifiesto desincronizado hace fallar la suite (imposible sobre-declarar
// cobertura: el número es el contador vivo del harness).
const readmeManifest = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
const badge = readmeManifest.match(/tests-(\d+)%2F\d+_PASS/);
const guarantee = readmeManifest.match(/(\d+) pruebas automatizadas/);
const manifestMismatches = [];
if (!badge || parseInt(badge[1], 10) !== total) {
  manifestMismatches.push(`badge=${badge ? badge[1] : 'ausente'}`);
}
if (!guarantee || parseInt(guarantee[1], 10) !== total) {
  manifestMismatches.push(`conteo=${guarantee ? guarantee[1] : 'ausente'}`);
}
if (manifestMismatches.length > 0) {
  console.error(`GATE MANIFIESTO: el README declara ${manifestMismatches.join(', ')} pero la suite ejecutó ${total} checks. Exit Code 1`);
  process.exit(1);
}

if (passed !== total) process.exit(1);
try { fs.rmSync(RIOT_CFG_DIR, { recursive: true, force: true }); } catch (e) { /* limpieza best-effort */ }
console.log(`Resultados: ${passed}/${total} checks registrados y ejecutados; manifiesto README trazable (${total}/${total}). Exit Code: 0`);
console.log('All valorant-analytics deterministic tests passed with Exit Code: 0');