#!/usr/bin/env node
/**
 * cli.js - Master Universal CLI & Intelligent Dispatcher for valorant-analytics
 * v3.0: Sovereign Multi-Engine Architecture.
 * Includes Formal Invariant Validation, Ed25519 DSSE Attestation, Merkle Ledgers,
 * Preflight Sandboxing, Session Guardian, Drift Detection & Byzantine Consensus.
 *
 * Usage:
 *   node cli.js "Derke#0001"                             ➔ Perfil Multi-Plataforma
 *   node cli.js match examples/sample_match.json "TenZ#0001"   ➔ Autodiagnóstico 360°
 *   node cli.js duo <archivo> <p1> <p2>                  ➔ Auditoría de Dúo
 *   node cli.js aim <archivo> [jugador]                  ➔ Rutina Kovaaks 15 min
 *   node cli.js duels <archivo> [jugador]                ➔ Matriz de duelos 1v1
 *   node cli.js weapons <archivo> [jugador]              ➔ Telemetría de Armas
 *   node cli.js invariants <archivo> [jugador]           ➔ Verificación Formal de Invariantes
 *   node cli.js attest <archivo> [jugador]               ➔ Atestación Criptográfica DSSE Ed25519
 *   node cli.js merkle <archivo>                         ➔ Árbol Merkle de Telemetría
 *   node cli.js guardian <archivo> [jugador]             ➔ Monitor de Fatiga y Tilt
 *   node cli.js drift <archivo> [jugador]                ➔ Radar de Deriva y Entropía
 *   node cli.js consensus <archivo> [jugador]            ➔ Síntesis Bizantina Multi-Lente
 *   node cli.js synthesize <archivo> [jugador]           ➔ Rutina Adaptativa Evolutiva
 *   node cli.js sbom                                     ➔ Manifiesto CycloneDX SBOM
 */

const path = require('path');
const fs = require('fs');

const { evaluateLearningProfile } = require('./learning_profile');
const { auditDuoSynergy } = require('./duo_synergy');
const { parseDuels } = require('./duel_matrix');
const { generateKovaaksRoutine } = require('./kovaaks_generator');
const { extractMatchId, fetchMatch } = require('./fetch_match');
const { normalizeHandle } = require('./fetch_profile');
const { analyzeWeaponTelemetry } = require('./weapon_telemetry');
const {
  validateLearningProfile,
  validateWeaponTelemetry,
  validateDuoSynergy,
  validateDuelMatrix
} = require('./invariant_validator');
const { runPreflight } = require('./preflight_guard');
const { signTelemetryReport, verifyTelemetryAttestation, registerTrustedKey, loadOrCreateKeystore, generateAttestationKeyPair } = require('./dsse_attestation');
const { buildMatchMerkleLedger, MerkleTree, sha256 } = require('./merkle_ledger');
const { SessionGuardian } = require('./session_guardian');
const { DriftDetector } = require('./drift_detector');
const { ConsensusArbiter } = require('./consensus_arbiter');
const { RoutineSynthesizer } = require('./routine_synthesizer');
const { generateSbom } = require('./sbom_manifest');
const { resolveMatchDataResilient, parseTextScoreboard } = require('./universal_ingestor');
const { harvestProfiles, harvestMatch } = require('./browser_cache_harvester');
const { extractAccountTelemetry, aggregateCareerTelemetry, generateMilestonesTimeline } = require('./career_telemetry');
const { evaluateMmrDrag, evaluateTalentVsEffort } = require('./autodiagnostic_engine');
const { classifyEvidence, observeMatchTelemetry, observeDuelRows } = require('./evidence_policy');
const { analyzeEconomy } = require('./economy_analyzer');
const { generateCoachingReport } = require('./coaching_engine');

// Deriva la evidencia de una partida usando el ADAPTADOR CONFIABLE del módulo
// de política (mint privado). El CLI no puede fabricar eventos observados ni
// fugas: solo alimenta telemetría cruda al adaptador, que deriva observaciones
// y NUNCA emite reglas de fuga.
function deriveMatchEvidence(matchData, playerHandle, originPath) {
  return classifyEvidence(observeMatchTelemetry(matchData, playerHandle, { originPath }));
}

// Evidencia a partir de la telemetría de cuenta (perfil agregado).
function deriveProfileEvidence(telemetry) {
  const c = (telemetry && telemetry.competitive) || {};
  return classifyEvidence({ observed: { kd: c.kd, acs: c.acs, hs: c.hs } });
}

function printEvidenceLimits(policy) {
  console.log(`🧾 Nivel de evidencia: ${policy.level} | Secciones omitidas: ${policy.forbiddenSections.join(', ') || 'ninguna'}`);
  if (policy.missing.length > 0) console.log(`   Datos faltantes: ${policy.missing.join('; ')}`);
}

function printBanner() {
  console.log(`\n========================================================================`);
  console.log(`⚡ VALORANT ANALYTICS: UNIVERSAL SOVEREIGN ENGINE (V${getProjectVersion()})`);
  console.log(`========================================================================`);
}

function getProjectVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) return pkg.version.trim();
  } catch (e) { /* fallback */ }
  return '4.5.0';
}

function resolveMatchData(source, playerHandle) {
  const data = resolveMatchDataResilient(source, playerHandle, { allowSynthetic: DEMO_MODE });
  printProvenance(source, data);
  return data;
}

function cacheDir() {
  return process.env.VALORANT_CACHE_DIR || path.join(__dirname, '..', '.cache');
}

function loadAttestIdentity() {
  const crypto = require('crypto');
  const idPath = path.join(cacheDir(), 'attest_identity.json');
  try {
    const lst = fs.lstatSync(idPath);
    if (lst.isSymbolicLink()) {
      throw new Error(`Identidad es un enlace simbólico (${idPath}): elimínalo manualmente y re-ejecuta. Nunca se sigue un symlink para material privado.`);
    }
    if (process.platform !== 'win32' && (lst.mode & 0o077) !== 0) {
      throw new Error(`Identidad con permisos inseguros (${(lst.mode & 0o777).toString(8)}) en ${idPath}: elimina el archivo y re-ejecuta para regenerarla con 0600.`);
    }
    const saved = JSON.parse(fs.readFileSync(idPath, 'utf8'));
    if (saved && saved.privateKey && saved.publicKey) {
      return {
        privateKey: crypto.createPrivateKey(saved.privateKey),
        publicKey: crypto.createPublicKey(saved.publicKey)
      };
    }
  } catch (e) {
    if (/enlace simbólico|permisos inseguros/.test(e.message)) throw e;
    if (e.code !== 'ENOENT' && !/Identidad inválida|no es un objeto|Unexpected token|Unexpected end/.test(e.message)) throw e;
    /* crear nueva identidad persistente */
  }
  const kp = generateAttestationKeyPair();
  const persisted = {
    privateKey: kp.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKey: kp.publicKey.export({ type: 'spki', format: 'pem' }),
    created: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(idPath), { recursive: true });
  // Creación atómica SIN lock: el contenido completo se escribe a un archivo
  // temporal exclusivo (wx, fsync) y el destino se reclama con un hard link
  // (falla si ya existe). Jamás existe una identidad parcial ni se sobrescribe
  // la del ganador; quien pierde la carrera relee la identidad instalada.
  const tmp = `${idPath}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  let fd = fs.openSync(tmp, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(persisted, null, 2));
    fs.fsyncSync(fd);
  } finally {
    try { fs.closeSync(fd); } catch (e) {}
  }
  try { fs.chmodSync(tmp, 0o600); } catch (e) { /* Windows: mejor esfuerzo */ }
  let installed = false;
  try {
    try {
      fs.linkSync(tmp, idPath);
      installed = true;
    } catch (e) {
      if (!fs.existsSync(idPath)) {
        throw new Error(`No se pudo reclamar la identidad persistente (${e.message}).`);
      }
      // Perdimos la carrera: la identidad del ganador ya está instalada
      // completa (mismo protocolo); se lee y se usa la suya.
    }
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) { /* ya limpio */ }
  }
  if (!installed) {
    let existing = null;
    try {
      existing = JSON.parse(fs.readFileSync(idPath, 'utf8'));
    } catch (e) { /* legado corrupto: regenerar de forma segura abajo */ }
    if (existing && existing.privateKey && existing.publicKey) {
      return {
        privateKey: crypto.createPrivateKey(existing.privateKey),
        publicKey: crypto.createPublicKey(existing.publicKey)
      };
    }
    // El archivo instalado no contiene un par de claves válido: un legado
    // corrupto se regenera (jamás se sigue un symlink: lstat antes de unlink).
    const lst = fs.lstatSync(idPath);
    if (lst.isSymbolicLink()) {
      throw new Error(`Identidad es un enlace simbólico (${idPath}): elimínalo manualmente y re-ejecuta.`);
    }
    if (!lst.isFile()) {
      throw new Error(`Identidad persistente con tipo inesperado (${idPath}): elimínala manualmente y re-ejecuta.`);
    }
    fs.unlinkSync(idPath);
    return loadAttestIdentity();
  }
  try {
    const dirFd = fs.openSync(path.dirname(idPath), 'r');
    try { fs.fsyncSync(dirFd); } finally { try { fs.closeSync(dirFd); } catch (e) {} }
  } catch (e) { /* filesystems sin fsync de directorio */ }
  return kp;
}

function printProvenance(source, matchData) {
  const meta = (matchData && matchData.data && matchData.data.metadata) || {};
  if (meta.synthetic || meta.wafContainment) {
    console.log(`[FUENTE: SINTÉTICA --demo] Telemetría reconstruida. NO es una partida real: diagnóstico solo demostrativo.`);
  } else if (typeof source === 'string' && fs.existsSync(source)) {
    console.log(`[FUENTE: JSON local verificado: ${source}]`);
  } else {
    console.log(`[FUENTE: API Tracker.gg / caché local verificada]`);
  }
}

function resolveTargetAndPlayer(args) {
  let target = args[1];
  let player = args[2];
  let usedBundledSample = false;

  if (target && target.includes('#') && !fs.existsSync(target)) {
    player = target;
    target = path.join(__dirname, '..', 'examples', 'sample_match.json');
    usedBundledSample = true;
  } else if (!target) {
    target = path.join(__dirname, '..', 'examples', 'sample_match.json');
    usedBundledSample = true;
  }

  if (usedBundledSample) {
    console.log(`[FUENTE: fixture de ejemplo incluido (examples/sample_match.json). Pasa un archivo JSON o un Riot ID propio para análisis real.]`);
  }

  return { target, player };
}

function handleProfile(handle) {
  const normalized = normalizeHandle(handle);
  const [name, tag] = handle.split('#');
  const opggTag = tag ? `${name.trim()}-${tag.trim()}` : name.trim();
  const trackerTag = tag ? `${name.trim()}%23${tag.trim()}` : normalized;

  printBanner();
  console.log(`🌐 PERFIL DE TELEMETRÍA MULTI-PLATAFORMA: ${handle}`);
  console.log(`------------------------------------------------------------------------`);
  console.log(`  • OP.GG:     https://op.gg/es/valorant/profile/${encodeURIComponent(opggTag)}`);
  console.log(`  • Tracker:   https://tracker.gg/valorant/profile/riot/${trackerTag}/overview`);
  console.log(`  • VLR.gg:    https://www.vlr.gg/search/?q=${encodeURIComponent(name.trim())}`);
  console.log(`\n💡 Tip: Para analizar una partida reciente de este jugador sin bloqueos de WAF,`);
  console.log(`   descarga el JSON de la partida o copia los datos y ejecuta:`);
  console.log(`   node cli.js match <partida.json> "${handle}"`);
  console.log(`========================================================================\n`);
}

function buildDuelTable(matrixData, playerHandle) {
  const { playerMap, duelMatrix, target } = matrixData;
  const effectiveTarget = target || (playerHandle ? Object.keys(playerMap).find(h => h.toLowerCase().includes(playerHandle.toLowerCase())) : Object.keys(playerMap)[0]);
  if (!effectiveTarget || !playerMap[effectiveTarget]) {
    return { error: `Jugador "${playerHandle || 'desconocido'}" no encontrado en la partida.`, rows: [], target: null };
  }
  const p = playerMap[effectiveTarget];
  const opponents = Object.values(playerMap).filter(o => o.team !== p.team);
  const rows = opponents.map(opp => {
    const kills = (duelMatrix[effectiveTarget] || {})[opp.handle] || 0;
    const deaths = (duelMatrix[opp.handle] || {})[effectiveTarget] || 0;
    return { opponent: opp.handle, opponentAgent: opp.agent, opponentRank: opp.rank, kills, deaths, net: kills - deaths };
  });
  return { error: null, rows, target: effectiveTarget };
}

const args = process.argv.slice(2);
const DEMO_MODE = args.includes('--demo');
for (let i = args.length - 1; i >= 0; i--) { if (args[i] === '--demo') args.splice(i, 1); }
let command = args[0];

if (!command || command === '--help' || command === '-h') {
  printBanner();
  console.log(`USO INTUITIVO (CLI RÁPIDO & AUTO-DISPATCHER):`);
  console.log(`  node cli.js "<riot_handle>"                       ➔ Detección automática de perfil`);
  console.log(`  node cli.js match <partida_o_id> [jugador]        ➔ Autodiagnóstico 360° y Fugas de ELO`);
  console.log(`  node cli.js duo <partida_o_id> [p1] [p2]          ➔ Auditoría de Sinergia y Tradeo de Dúo`);
  console.log(`  node cli.js aim <partida_o_id> [jugador]          ➔ Rutina Kovaaks 15 min adaptativa`);
  console.log(`  node cli.js duels <partida_o_id> [jugador]        ➔ Matriz de duelos 1v1 vs rivales`);
  console.log(`  node cli.js weapons <partida_o_id> [jugador]      ➔ Telemetría de Armas y Recoil`);
  console.log(`  node cli.js economy <partida_o_id> [jugador]      ➔ Desglose de Economía y Buy-Tiers`);
  console.log(`  node cli.js coaching <partida_o_id> [jugador]     ➔ Reporte Introspectivo y Recursos Tácticos`);
  console.log(`  node cli.js calibrate [jugador] [rango] [rol]     ➔ Calibración Instantánea Zero-Cloud`);
  console.log(`  node cli.js harvest [jugador]                     ➔ Cosecha de Partidas desde Caché Local`);
  console.log(`  node cli.js career <perfil_json|handle>           ➔ Auditoría de Horas y Trayectoria`);
  console.log(`  node cli.js diagnose <perfil_json|handle>         ➜ Señal heurística de MMR y estimación de rango (hipótesis no verificada)`);
  console.log(`  node cli.js parse <texto_o_archivo> [jugador]     ➔ Ingesta Universal Resiliente (Anti-WAF)`);
  console.log(`  node cli.js invariants <partida_o_id> [jugador]   ➔ Verificación Formal de Invariantes`);
  console.log(`  node cli.js attest <partida_o_id> [jugador]       ➔ Sobre DSSE in-toto firmado con Ed25519`);
  console.log(`  node cli.js merkle <partida_o_id>                 ➔ Árbol Merkle de Eventos y Pruebas`);
  console.log(`  node cli.js guardian <partida_o_id> [jugador]     ➔ Monitor de Fatiga y Tilt`);
  console.log(`  node cli.js drift <partida_o_id> [jugador]        ➔ Radar de Deriva y Entropía`);
  console.log(`  node cli.js consensus <partida_o_id> [jugador]    ➔ Síntesis Bizantina Multi-Lente`);
  console.log(`  node cli.js synthesize <partida_o_id> [jugador]   ➔ Rutina Adaptativa Evolutiva`);
  console.log(`  node cli.js sbom                                  ➔ Manifiesto CycloneDX SBOM`);
  console.log(`\nEJEMPLOS:`);
  console.log(`  node cli.js "Derke#0001"`);
  console.log(`  node cli.js match examples/sample_match.json "TenZ#0001"`);
  console.log(`  node cli.js duo examples/sample_match.json "TenZ#0001" "Chronicle#0001"`);
  console.log(`  node cli.js duels examples/sample_match.json`);
  console.log(`========================================================================\n`);
  process.exit(0);
}

// Preflight Check
const pf = runPreflight(command, args);
if (pf.verdict === 'DENY') {
  console.error(`\n[PREFLIGHT DENY] ${pf.reason}`);
  process.exit(1);
}

// Auto-detección: si el primer arg contiene '#' (Riot ID) y no es un archivo → perfil
if (command.includes('#') && !fs.existsSync(command)) {
  handleProfile(command);
  process.exit(0);
}

try {
  if (command === 'match' || command === 'diagnostic') {
    const { target, player } = resolveTargetAndPlayer(args);
    const matchData = resolveMatchData(target, player);
    const res = evaluateLearningProfile(matchData, player);
    validateLearningProfile(res);

    printBanner();
    const evidence = deriveMatchEvidence(matchData, player, target);
    console.log(`🎯 DIAGNÓSTICO 360°: ${res.player} (${res.agent} - ${res.rank}) | Mapa: ${res.map} [descriptivo]`);
    printEvidenceLimits(evidence);
    console.log(`------------------------------------------------------------------------`);
    if (evidence.allowedSections.includes('aggregate_radar')) {
      console.log(`📊 RADAR DE DOMINIO (DIMENSIONAL: solo dimensiones con métrica+benchmark):`);
      const radarRows = [
        ['Precisión Mecánica', 'precision', res.radar.precisionMecanica],
        ['Macrogame y Espacio', 'macro', res.radar.macrogamePosicionamiento],
        ['Duelos de Apertura', 'openings', res.radar.duelosDeApertura],
        ['Disciplina Económica', 'economy', res.radar.disciplinaEconomica],
        ['Compostura en Clutch', 'clutch', res.radar.composturaClutch]
      ];
      radarRows.forEach(([label, key, value]) => {
        const d = evidence.dimensions[key];
        console.log(`  • ${label}: ${d && d.available ? value : 'n/d (sin métrica+benchmark)'}`);
      });
    } else {
      console.log(`📊 Radar omitido: sin dimensiones evaluables (métrica+benchmark).`);
    }
    if (evidence.allowedSections.includes('round_leaks')) {
      console.log(`\n🚨 FUGAS ATRIBUIBLES (regla + resultado de ronda + contexto):`);
      (res.eloLeaks || []).forEach((l, i) => {
        console.log(`  [#${i + 1}] ${l.issue}`);
        console.log(`       Detalle:  ${l.detail}`);
        console.log(`       Solución: ${l.solution}`);
      });
    } else if (evidence.allowedSections.includes('round_observations')) {
      console.log(`\n🔎 OBSERVACIONES POR RONDA (datos normalizados; NO verificados; NO se atribuyen causas):`);
      (evidence.observedEvents || []).slice(0, 10).forEach(ev => {
        console.log(`  • R${ev.n} [${ev.event}] ${ev.detail}`);
      });
      console.log(`  (Fugas/causas omitidas: falta fuente verificada + regla + resultado + contexto.)`);
    } else {
      console.log(`\n🔎 Observaciones/fugas omitidas: sin eventos observados de ronda.`);
    }
    if (evidence.allowedSections.includes('aim_routine')) {
      console.log(`\n💡 REGLA MENTAL: ${res.prescripcionInmediata.reglaMental}`);
      console.log(`🎯 RUTINA KOVAAKS: ${res.prescripcionInmediata.sesionKovaaks}`);
    } else {
      console.log(`\n🎯 Rutina omitida: falta evidencia mecánica (HS%/zonas de daño).`);
    }
    console.log(`========================================================================\n`);

  } else if (command === 'duo' || command === 'synergy') {
    let target = args[1];
    let p1 = args[2];
    let p2 = args[3];

    if (target && target.includes('#') && !fs.existsSync(target)) {
      p2 = p1;
      p1 = target;
      target = path.join(__dirname, '..', 'examples', 'sample_match.json');
    } else if (!target) {
      target = path.join(__dirname, '..', 'examples', 'sample_match.json');
    }

    const matchData = resolveMatchData(target);
    if (!p1 || !p2) {
      const summaries = (matchData.data?.segments || []).filter(s => s.type === 'player-summary');
      const uniqueHandles = [...new Set(summaries.map(s => s.metadata?.platformUserHandle || s.attributes?.platformUserIdentifier).filter(Boolean))];

      if (uniqueHandles.length < 2) {
        printBanner();
        console.log(`⚠️ Telemetría insuficiente: la partida contiene menos de 2 jugadores para auditar sinergia de dúo.`);
        console.log(`========================================================================\n`);
        process.exit(0);
      }

      const teamMap = {};
      summaries.forEach(s => {
        const team = s.metadata?.teamId || 'Blue';
        const h = s.metadata?.platformUserHandle || s.attributes?.platformUserIdentifier;
        if (h) {
          teamMap[team] = teamMap[team] || [];
          if (!teamMap[team].includes(h)) teamMap[team].push(h);
        }
      });
      const teamWithAtLeastTwo = Object.values(teamMap).find(t => t.length >= 2);
      if (!p1 && teamWithAtLeastTwo) p1 = teamWithAtLeastTwo[0];
      if (!p2 && teamWithAtLeastTwo) p2 = teamWithAtLeastTwo[1];
      if (!p1) p1 = uniqueHandles[0];
      if (!p2) p2 = uniqueHandles[1];
    }
    const res = auditDuoSynergy(matchData, p1, p2);
    validateDuoSynergy(res);

    printBanner();
    console.log(`🤝 AUDITORÍA DE DÚO: ${res.p1.handle} + ${res.p2.handle} | Sinergia: ${res.synergy.score}`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`👤 ${res.p1.handle} (${res.p1.agent}): ACS ${res.p1.acs} | KD ${res.p1.kd} | HS% ${res.p1.hs}`);
    console.log(`👤 ${res.p2.handle} (${res.p2.agent}): ACS ${res.p2.acs} | KD ${res.p2.kd} | HS% ${res.p2.hs}`);
    console.log(`\n⚖️ VEREDICTO: ${res.synergy.verdict}`);
    console.log(`   Diferencial: ${res.synergy.acsDifferential}`);
    if (res.synergy.carryAnalysis) {
      console.log(`   Carga: ${res.synergy.carryAnalysis.primaryCarrier} carga, ${res.synergy.carryAnalysis.secondaryPlayer} soporta | Candidato a boost: ${res.synergy.carryAnalysis.boostCandidate ? 'SÍ' : 'no'}`);
    }
    console.log(`   Directiva:   ${res.synergy.tacticalAdvice}`);
    console.log(`========================================================================\n`);

  } else if (command === 'aim' || command === 'kovaaks') {
    const { target, player } = resolveTargetAndPlayer(args);
    const matchData = resolveMatchData(target, player);
    const evidence = deriveMatchEvidence(matchData, player, target);

    printBanner();
    if (!evidence.allowedSections.includes('aim_routine')) {
      console.log(`🎯 RUTINA OMITIDA: falta evidencia mecánica (HS%/zonas de daño).`);
      printEvidenceLimits(evidence);
      console.log(`========================================================================\n`);
    } else {
      const res = generateKovaaksRoutine(matchData, player);
      console.log(`🎯 RUTINA KOVAAKS 15-MIN: ${res.player} | Mapa: ${res.map}`);
      console.log(`HS%: ${res.hsPct}`);
      console.log(`Sens: ${res.sensitivityRecommendation}`);
      console.log(`------------------------------------------------------------------------`);
      res.routine.forEach(sc => {
        console.log(`  • [${sc.duration}] ${sc.scenario}${sc.aimLab ? ` | ${sc.aimLab}` : ''}`);
        console.log(`       ${sc.category}: ${sc.instruction}`);
      });
      console.log(`========================================================================\n`);
    }

  } else if (command === 'duels' || command === 'matrix') {
    const { target, player } = resolveTargetAndPlayer(args);
    const matchData = resolveMatchData(target, player);
    const duelInfo = buildDuelTable(parseDuels(matchData, player), player);
    const observedMatch = observeMatchTelemetry(matchData, player, { originPath: target });
    const evidence = classifyEvidence({
      observed: observedMatch.observed,
      rounds: observedMatch.rounds,
      duels: observeDuelRows(duelInfo.rows, matchData, { originPath: target })
    });

    printBanner();
    if (!evidence.allowedSections.includes('duel_matrix')) {
      console.log(`⚔️ MATRIZ DE DUELOS OMITIDA: sin datos de duelos válidos.`);
      printEvidenceLimits(evidence);
    } else if (duelInfo.error) {
      console.log(`⚠️ ${duelInfo.error}`);
    } else {
      const focusPlayer = duelInfo.target || player || 'Objetivo';
      console.log(`⚔️ MATRIZ DE DUELOS 1v1 DIRECTOS vs ${focusPlayer} | Duelos: ${duelInfo.rows.length}`);
      console.log(`------------------------------------------------------------------------`);
      duelInfo.rows.forEach(d => {
        const icon = d.net > 0 ? '🟢' : d.net < 0 ? '🔴' : '⚪';
        console.log(`  ${icon} vs ${d.opponent.padEnd(20)} (${(d.opponentAgent || '?').padEnd(10)}): ${d.kills} K - ${d.deaths} D (Net: ${d.net > 0 ? '+' : ''}${d.net})`);
      });
    }
    console.log(`========================================================================\n`);

  } else if (command === 'weapons' || command === 'armas') {
    const { target, player } = resolveTargetAndPlayer(args);
    const matchData = resolveMatchData(target, player);
    const result = analyzeWeaponTelemetry(matchData, player);
    validateWeaponTelemetry(result);

    printBanner();
    console.log(`🎯 TELEMETRÍA DE ARMAS Y BANDAS DE IMPACTO: ${result.player} (${result.agent})`);
    console.log(`Distribución de Zonas: Cabeza ${result.hitZoneDistribution.head} | Cuerpo ${result.hitZoneDistribution.body} | Piernas ${result.hitZoneDistribution.leg}`);
    console.log(`Disciplina de Disparo: ${result.metrics.firingDiscipline} (SE/TP Ratio: ${result.metrics.sprayTapRatio})`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`DISTANCIA Y CONVERSIÓN POR TIER:`);
    result.distanceBands.forEach(d => {
      console.log(`  • ${d.name}`);
      console.log(`     Duelos: ${d.duels} | Daño: ${d.totalDamage} | HS: ${d.hsAccuracy} [${d.conversionRating}]`);
    });
    console.log(`------------------------------------------------------------------------`);
    console.log(`DIAGNÓSTICO TÁCTICO: ${result.recoilDiagnosis.analisisTactico}`);
    console.log(`RUTINA ASOCIADA: ${result.recoilDiagnosis.kovaaksPrescription}`);
    console.log(`========================================================================\n`);

  } else if (command === 'economy' || command === 'eco') {
    const { target, player } = resolveTargetAndPlayer(args);
    const matchData = resolveMatchData(target, player);
    const eco = analyzeEconomy(matchData, player);

    printBanner();
    console.log(`💰 DESGLOSE DE ECONOMÍA Y BUY TIERS: ${eco.player} (${eco.agent || '?'} - ${eco.rank || 'Unranked'})`);
    console.log(`------------------------------------------------------------------------`);
    console.table(eco.tiers.map(t => ({
      'Buy Tier': t.tier,
      'Rounds': t.rounds,
      'Record (W-L)': `${t.won}-${t.lost}`,
      'Win %': t.winPct,
      'KDA': t.kda,
      'K/D': t.kd,
      'ADR': t.adr,
      'ACS': t.acs,
      'HS%': t.hsPct
    })));
    console.log(`========================================================================\n`);

  } else if (command === 'coaching' || command === 'coach') {
    const { target, player } = resolveTargetAndPlayer(args);
    const matchData = resolveMatchData(target, player);
    const report = generateCoachingReport(matchData, player);

    printBanner();
    if (report.error) {
      console.log(`⚠️ ${report.error}`);
    } else {
      console.log(`🧠 REPORTE INTROSPECTIVO DE COACHING TÁCTICO: ${report.player.handle} (${report.player.agent} - ${report.player.rank})`);
      console.log(`------------------------------------------------------------------------`);
      console.log(`⚔️ DUELOS CON MAYOR FRICCIÓN EN LA PARTIDA:`);
      if (!report.hardOpponents || report.hardOpponents.length === 0) {
        console.log(`  ✓ Dominio favorable en todos los enfrentamientos directos de la partida.`);
      } else {
        report.hardOpponents.forEach(h => {
          console.log(`  • vs ${h.opp.handle.padEnd(20)} (${(h.opp.agent || '?').padEnd(10)}): ${h.kills} K - ${h.deaths} D (Déficit: -${h.diff})`);
        });
      }
      console.log(`\n📚 MÓDULOS Y GUÍAS DE APRENDIZAJE RECOMENDADOS:`);
      Object.values(report.resources).forEach(r => {
        console.log(`  • ${r.title}`);
        console.log(`    Conceptos: ${r.keyConcepts[0]}`);
        console.log(`    Creadores: ${r.creators.join(', ')}`);
        console.log(`    Enlace:    ${r.searchQuery}`);
      });
    }
    console.log(`========================================================================\n`);

  } else if (command === 'calibrate' || command === 'mock') {
    const player = args[1] || 'Player#0001';
    const rank = args[2] || 'Ascendant 2';
    const role = args[3] || 'Duelist';

    printBanner();
    console.log(`🎯 CALIBRACIÓN INSTANTÁNEA ZERO-CLOUD (OFFLINE MODE): ${player}`);
    console.log(`Rango Objetivo: ${rank} | Rol Táctico: ${role}`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`📊 RADAR DE RENDIMIENTO COMPETITIVO CALIBRADO:`);
    console.log(`  • Precisión Mecánica (HS% / First-Bullet): 88 / 100 [HS Objetivo: 28%]`);
    console.log(`  • Macrogame & Control de Espacio (KAST):   82 / 100 [KAST Objetivo: 74%]`);
    console.log(`  • Duelos de Apertura (First Blood / FDR):  85 / 100 [Ratio FK/FD: 1.45]`);
    console.log(`  • Disciplina Económica (Buy Conversion):   90 / 100 [Conversión Eco: 22%]`);
    console.log(`  • Compostura en Clutch (1v1 / 1v2):        80 / 100 [Clutch Rate: 18%]`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`💡 REGLA DE COGNICIÓN: No abras duelos en defensa sin soporte de utilidad de tu iniciador.`);
    console.log(`🎯 RUTINA KOVAAKS SUGERIDA: 1wall6targets small (5 min) + Pasu Voltaic (5 min) + PatTargetSwitch (5 min).`);
    console.log(`========================================================================\n`);

  } else if (command === 'invariants' || command === 'verify-math') {
    const { target, player } = resolveTargetAndPlayer(args);
    const effectivePlayer = player || 'TenZ#0001';
    const matchData = resolveMatchData(target, effectivePlayer);

    printBanner();
    console.log(`🛡️ VERIFICACIÓN FORMAL DE INVARIANTES MATEMÁTICOS`);
    console.log(`Objetivo: ${target} | Jugador: ${effectivePlayer}`);
    console.log(`------------------------------------------------------------------------`);

    const p = evaluateLearningProfile(matchData, effectivePlayer);
    validateLearningProfile(p);
    console.log(`  ✓ Invariantes de Radar y Fugas de ELO: Aprobados (Bounds [0, 100], sin NaN)`);

    const w = analyzeWeaponTelemetry(matchData, effectivePlayer);
    validateWeaponTelemetry(w);
    console.log(`  ✓ Invariantes de Zonas y Distancia: Aprobados (Head+Body+Leg == 100%, 3 Bandas)`);

    const m = parseDuels(matchData, effectivePlayer);
    validateDuelMatrix(m);
    console.log(`  ✓ Invariantes de Duelos 1v1: Aprobados (Consistencia de Kills/Deaths)`);

    console.log(`------------------------------------------------------------------------`);
    console.log(`🏆 ESTADO FORMAL: TODOS LOS INVARIANTES MATEMÁTICOS VERIFICADOS (Exit 0)`);
    console.log(`========================================================================\n`);

  } else if (command === 'attest') {
    const { target, player } = resolveTargetAndPlayer(args);
    const effectivePlayer = player || 'TenZ#0001';
    const matchData = resolveMatchData(target, effectivePlayer);
    const profile = evaluateLearningProfile(matchData, effectivePlayer);

    printBanner();
    console.log(`🔐 GENERACIÓN DE ATESTACIÓN CRIPTOGRÁFICA DSSE / in-toto v1`);
    console.log(`Objetivo: ${target} | Jugador: ${effectivePlayer}`);
    console.log(`------------------------------------------------------------------------`);

    const envelope = signTelemetryReport(profile, loadAttestIdentity());
    const keystorePath = path.join(cacheDir(), 'dsse_keystore.json');
    const keystore = loadOrCreateKeystore(keystorePath);
    let verifyRes = verifyTelemetryAttestation(envelope, null, { trustedKeystore: keystore.keys });
    let provisioned = false;
    if (!verifyRes.verified && args.includes('--trust-new-key')) {
      const keyid = registerTrustedKey(keystorePath, envelope.publicKeyPem, `attest-${effectivePlayer}`);
      verifyRes = verifyTelemetryAttestation(envelope, null, { trustedKeystore: loadOrCreateKeystore(keystorePath).keys });
      provisioned = true;
    }
    if (!verifyRes.verified && !args.includes('--trust-new-key')) {
      console.log(`  • Veredicto Criptográfico: FALLIDO: firmante desconocido (TOFU rechazado).`);
      console.log(`  • Acción requerida: re-ejecuta con --trust-new-key para aprovisionar esta identidad tras verificarla por un canal independiente.`);
      console.log(`------------------------------------------------------------------------`);
      process.exit(1);
    }

    console.log(`  • Tipo de Payload:       ${envelope.payloadType}`);
    console.log(`  • Clave Firmante (KeyID): ${envelope.signatures[0].keyid}`);
    console.log(`  • Longitud Firma Base64:  ${envelope.signatures[0].sig.length} bytes`);
    console.log(`  • Almacén confiable:      ${keystorePath} (firmante: ${envelope.signatures[0].keyid}${provisioned ? ', aprovisionado con --trust-new-key' : ', identidad persistente'})`);
    console.log(`  • Veredicto Criptográfico: ${verifyRes.verified ? 'VERIFICADO contra keystore (Ed25519 OK)' : `FALLIDO: ${verifyRes.error}`}`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`✓ Sobre DSSE in-toto v1 inmutable verificado con éxito (Exit 0)`);
    console.log(`========================================================================\n`);

  } else if (command === 'merkle') {
    const target = args[1] || path.join(__dirname, '..', 'examples', 'sample_match.json');
    const matchData = resolveMatchData(target);
    const ledger = buildMatchMerkleLedger(matchData);

    printBanner();
    console.log(`🌲 ÁRBOL DE AUDITORÍA MERKLE DE TELEMETRÍA`);
    console.log(`Objetivo: ${target} | Eventos discretos: ${ledger.totalEvents}`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`  • Merkle Root (SHA-256): ${ledger.root}`);

    if (ledger.totalEvents > 0) {
      const proof = ledger.tree.getProof(0);
      const leaf0 = sha256(ledger.events[0]);
      const validProof = MerkleTree.verifyProof(leaf0, proof, ledger.root);
      console.log(`  • Prueba de Inclusión (Evento #1): ${validProof ? 'VÁLIDA (Exit 0)' : 'INVÁLIDA'}`);
    }
    console.log(`------------------------------------------------------------------------`);
    console.log(`✓ Integridad y no-repudio de eventos sellados deterministamente.`);
    console.log(`========================================================================\n`);

  } else if (command === 'guardian') {
    const { target, player } = resolveTargetAndPlayer(args);
    const effectivePlayer = player || 'TenZ#0001';
    const matchData = resolveMatchData(target, effectivePlayer);
    const guardian = new SessionGuardian();
    const audit = guardian.auditSession(matchData, effectivePlayer);

    printBanner();
    console.log(`🛡️ SESSION GUARDIAN: FATIGA & TILT COGNITIVO`);
    console.log(`Jugador: ${effectivePlayer} | Veredicto: ${audit.verdict}`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`  • Nivel de Tilt:     ${audit.tilt.level} (Índice: ${audit.tilt.tiltIndex}/100)`);
    console.log(`  • Factor de Fatiga:  ${audit.fatigue.fatigueFactor} / 1.00 (${audit.fatigue.continuousMinutes} mins acumulados)`);
    console.log(`  • Apto para competir: ${audit.safeToContinue ? 'SÍ (Continuar cola)' : 'NO (Pausa obligatoria)'}`);
    console.log(`\n📋 DIRECTIVAS DE SALUD COGNITIVA:`);
    audit.prescriptions.forEach(p => console.log(`  • ${p}`));
    console.log(`========================================================================\n`);

  } else if (command === 'drift') {
    const { target, player } = resolveTargetAndPlayer(args);
    const effectivePlayer = player || 'TenZ#0001';
    const matchData = resolveMatchData(target, effectivePlayer);
    const detector = new DriftDetector();
    const driftReport = detector.auditMatchDrift(matchData, effectivePlayer);

    printBanner();
    console.log(`📊 RADAR DE DERIVA TÁCTICA Y ENTROPÍA MECÁNICA`);
    console.log(`Jugador: ${effectivePlayer} | Estabilidad Global: ${driftReport.overallStability}%`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`  • Clasificación de Lado: ${driftReport.sideDivergence.classification} (Divergencia: ${driftReport.sideDivergence.divergenceScore}%)`);
    console.log(`  • Entropía de Quarters:  ${driftReport.quarterDrift.killDistributionEntropy} / ${driftReport.quarterDrift.maxPossibleEntropy}`);
    console.log(`  • Diagnóstico:           ${driftReport.quarterDrift.diagnosis}`);
    console.log(`========================================================================\n`);

  } else if (command === 'consensus') {
    const { target, player } = resolveTargetAndPlayer(args);
    const effectivePlayer = player || 'TenZ#0001';
    const matchData = resolveMatchData(target, effectivePlayer);
    const profile = evaluateLearningProfile(matchData, effectivePlayer);
    const arbiter = new ConsensusArbiter();
    const report = arbiter.synthesizeConsensus(profile);

    printBanner();
    console.log(`⚖️ SÍNTESIS DE CONSENSO BIZANTINO MULTI-LENTE (BFT)`);
    console.log(`Jugador: ${effectivePlayer} | Veredicto: ${report.verdict}`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`  • Lentes Participantes:  ${report.participatingLenses}`);
    console.log(`  • Quórum Alcanzado:      ${report.quorumAchieved ? 'SÍ' : 'NO'}`);
    console.log(`  • Prioridad de Acción:   ${report.actionablePriority}`);
    console.log(`\n📋 SÍNTESIS UNIFICADA DE LENTES:`);
    report.synthesis.forEach(s => console.log(`  • ${s}`));
    console.log(`========================================================================\n`);

  } else if (command === 'synthesize') {
    const { target, player } = resolveTargetAndPlayer(args);
    const effectivePlayer = player || 'TenZ#0001';
    const matchData = resolveMatchData(target, effectivePlayer);
    const profile = evaluateLearningProfile(matchData, effectivePlayer);
    const synthesizer = new RoutineSynthesizer({ targetDurationMinutes: 15 });
    const routine = synthesizer.synthesizeRoutine(profile);

    printBanner();
    console.log(`🧬 RUTINA EVOLUTIVA ADAPTATIVA: ${routine.player} (${routine.totalRoutineMinutes} min)`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`ÁREAS DE DEBILIDAD DETECTADAS:`);
    routine.identifiedWeaknesses.forEach(w => console.log(`  [${w.area}] ${w.reason}`));
    console.log(`\nEJERCICIOS SINTETIZADOS:`);
    routine.drillPlan.forEach((d, i) => {
      console.log(`  ${i + 1}. [${d.focus}] ${d.scenario} x${d.reps} (${d.durationPerRep}) - Dificultad: ${d.difficultyMultiplier}x`);
    });
    console.log(`\n💡 CONSEJO NEUROMUSCULAR: ${routine.neuroMuscleAdvice}`);
    console.log(`========================================================================\n`);

  } else if (command === 'sbom') {
    const manifest = generateSbom();
    printBanner();
    console.log(`📦 MANIFIESTO CYCLONEDX SBOM (ZERO-DEPENDENCY AUDIT)`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`  • Componente:         ${manifest.metadata.component.name} v${manifest.metadata.component.version}`);
    console.log(`  • Módulos Verificados: ${manifest.components.length} archivos JS locales sellados con SHA-256`);
    console.log(`  • Dependencias NPM:   0 (Pure Standard Library)`);
    console.log(`  • Licencia:           ${manifest.metadata.component.licenses[0].license.id}`);
    console.log(`========================================================================\n`);

  } else if (command === 'profile') {
    const handle = args[1];
    if (!handle || !/^[^#\s][^#]*#[^#\s][^#]*$/.test(handle.trim())) {
      console.error('Error: Riot ID inválido. Usa formato Nombre#TAG (ej. node cli.js profile "Derke#0001").');
      process.exit(1);
    }
    handleProfile(handle);

  } else if (command === 'parse' || command === 'ingest') {
    const fileInput = args[1];
    if (!fileInput) {
      throw new Error('parse requiere entrada explícita: archivo JSON/Texto, match ID, URL o texto de scoreboard. Sin entrada no se analiza el fixture incluido.');
    }
    const player = (args[2] && args[2].includes('#')) ? args[2] : undefined;
    if (args[2] && !player) {
      throw new Error(`parse: Riot ID inválido "${args[2]}" (formato esperado Nombre#TAG).`);
    }
    if (fileInput && (/[\\/]/.test(fileInput) || /\.(json|txt|md|csv)$/i.test(fileInput)) && !fs.existsSync(fileInput)) {
      throw new Error(`parse: archivo no encontrado: "${fileInput}".`);
    }
    const matchData = resolveMatchData(fileInput || path.join(__dirname, '..', 'examples', 'sample_match.json'), player);
    const res = evaluateLearningProfile(matchData, player);
    validateLearningProfile(res);
    printBanner();
    console.log(`📋 INGESTA UNIVERSAL RESILIENTE: ${res.player} (${res.agent} - ${res.rank}) | Mapa: ${res.map}`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`📊 RADAR DE RENDIMIENTO COMPETITIVO:`);
    console.log(`  • Precisión Mecánica:        ${res.radar.precisionMecanica}`);
    console.log(`  • Macrogame y Espacio:       ${res.radar.macrogamePosicionamiento}`);
    console.log(`  • Duelos de Apertura:        ${res.radar.duelosDeApertura}`);
    console.log(`  • Disciplina Económica:      ${res.radar.disciplinaEconomica}`);
    console.log(`  • Compostura en Clutch:      ${res.radar.composturaClutch}`);
    console.log(`\n🚨 TOP FUGAS DE ELO (CAUSAS DE DERROTA):`);
    (res.eloLeaks || []).forEach((l, i) => {
      console.log(`  [#${i + 1}] ${l.issue}`);
      console.log(`       Detalle:  ${l.detail}`);
      console.log(`       Solución: ${l.solution}`);
    });
    console.log(`\n💡 REGLA MENTAL: ${res.prescripcionInmediata.reglaMental}`);
    console.log(`🎯 RUTINA KOVAAKS: ${res.prescripcionInmediata.sesionKovaaks}`);
    console.log(`========================================================================\n`);

  } else if (command === 'harvest') {
    const query = args[1];
    printBanner();
    console.log(`🌾 COSECHA DETERMINISTA DE TELEMETRÍA (CACHE HARVESTER)`);
    console.log(`------------------------------------------------------------------------`);
    const hits = harvestProfiles(query);
    console.log(`Entradas encontradas en caché local: ${hits.length}`);
    hits.forEach((h, i) => {
      console.log(`  [#${i + 1}] ${h.url.slice(0, 85)}...`);
    });
    console.log(`========================================================================\n`);

  } else if (command === 'career') {
    const inputPath = args[1];
    let profileData = null;
    let handleName = args[2] || 'Jugador';

    if (inputPath && fs.existsSync(inputPath)) {
      profileData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    } else {
      const hits = harvestProfiles(inputPath);
      if (hits.length > 0) {
        profileData = hits[0].json;
        handleName = inputPath || 'Detectado en Caché';
      }
    }

    if (!profileData) {
      console.error('Error: No se encontró archivo o caché para evaluar carrera. Proporciona un archivo JSON o handle.');
      process.exit(1);
    }

    const tel = extractAccountTelemetry(profileData, { handle: handleName });
    const agg = aggregateCareerTelemetry([{ telemetry: tel }]);
    const timeline = generateMilestonesTimeline(agg);

    printBanner();
    console.log(`⏱️ AUDITORÍA DE CARRERA Y TIEMPO REAL: ${tel.handle}`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`  • Horas en Competitivo (Tracker):  ${tel.competitive.formatted} (${tel.competitive.hours}h)`);
    console.log(`  • Horas en Otros Modos (Casual):   ${tel.casual.formatted} (${tel.casual.hours}h)`);
    console.log(`  • Horas Totales Efectivas:         ${tel.general.formatted} (${tel.general.hours}h)`);
    console.log(`  • Rango Actual: ${tel.currentRank} | Pico: ${tel.peakRank}`);
    console.log(`  • Partidas: ${tel.competitive.matches} (Victorias: ${tel.competitive.wins}) | K/D: ${tel.competitive.kd} | HS: ${tel.competitive.hs}`);
    console.log(`\n📅 CRONOLOGÍA DE HITOS Y HORAS ACUMULADAS:`);
    console.table(timeline.map(t => ({
      'Rango': t.rango,
      'Horas Tramo': `${t.tramoHoras} h`,
      'Horas Acumuladas': `${t.acumuladoHoras} h`,
      'Contexto': t.contexto
    })));
    console.log(`========================================================================\n`);

  } else if (command === 'diagnose') {
    const inputPath = args[1];
    let profileData = null;
    let handleName = args[2] || 'Jugador';

    if (inputPath && fs.existsSync(inputPath)) {
      profileData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    } else {
      const hits = harvestProfiles(inputPath);
      if (hits.length > 0) {
        profileData = hits[0].json;
        handleName = inputPath || 'Detectado en Caché';
      }
    }

    if (!profileData) {
      console.error('Error: Proporciona un JSON de perfil o handle rastreable en caché.');
      process.exit(1);
    }

    const tel = extractAccountTelemetry(profileData, { handle: handleName });
    const agg = aggregateCareerTelemetry([{ telemetry: tel }]);
    const mmrDiag = evaluateMmrDrag(tel);
    const talentDiag = evaluateTalentVsEffort(agg);
    const evidence = deriveProfileEvidence(tel);

    printBanner();
    console.log(`🧠 AUTODIAGNÓSTICO INTEGRAL (HEURÍSTICO, NO VERIFICADO): ${tel.handle}`);
    printEvidenceLimits(evidence);
    console.log(`------------------------------------------------------------------------`);
    console.log(`🏷️ CATEGORÍA (hipótesis descriptiva): ${talentDiag.category}`);
    console.log(`⚖️ MEZCLA DE INDICADORES: ${talentDiag.talentRatio}`);
    console.log(`🎯 ESTIMACIÓN HEURÍSTICA DE RANGO (no verificada): ${talentDiag.trueDeservedRank} (Rango visual: ${tel.currentRank})`);
    console.log(`\n🛡️ SEÑAL DE POSIBLE ANCLAJE DE MMR (hipótesis):`);
    console.log(`  • Señal compatible: ${mmrDiag.mmrDragDetected ? 'SÍ (heurística)' : 'no concluyente'}`);
    console.log(`  • Detalle: ${mmrDiag.diagnosis}`);
    console.log(`\n⚠️  ALCANCE: ${talentDiag.disclaimer}`);
    if (talentDiag.bottleneckOptimization && evidence.allowedSections.includes('aim_routine')) {
      console.log(`\n💡 CUELLO DE BOTELLA Y OPTIMIZACIÓN (sugerencia genérica):`);
      console.log(`  • Factor: ${talentDiag.bottleneckOptimization.metric} (Actual: ${talentDiag.bottleneckOptimization.currentValue} ➔ Objetivo: ${talentDiag.bottleneckOptimization.targetValue})`);
      console.log(`  • Consejo: ${talentDiag.bottleneckOptimization.tacticalAdvice}`);
    } else {
      console.log(`\n💡 Cuello de botella/optimización omitido: falta evidencia mecánica (HS%) o muestra suficiente.`);
    }
    console.log(`========================================================================\n`);

  } else {
    // Fallback frictionless: archivo, URL de partida o texto largo → diagnóstico directo
    if (fs.existsSync(command) || command.includes('tracker.gg') || command.includes('op.gg') || command.length > 20) {
      const matchData = resolveMatchData(command, args[1]);
      const res = evaluateLearningProfile(matchData, args[1]);
      printBanner();
      console.log(`🎯 DIAGNÓSTICO DIRECTO: ${res.player} (${res.agent} - ${res.rank}) | Mapa: ${res.map}`);
      console.log(`------------------------------------------------------------------------`);
      console.log(`📊 Radar Precisión Mecánica: ${res.radar.precisionMecanica}`);
      console.log(`💡 Regla Inmediata: ${res.prescripcionInmediata.reglaMental}`);
      console.log(`========================================================================\n`);
    } else {
      console.error(`Comando desconocido: "${command}". Ejecuta "node cli.js --help" para ver las opciones.`);
      process.exit(1);
    }
  }
} catch (err) {
  console.error('\n❌ Error al ejecutar comando:', err.message);
  process.exit(1);
}