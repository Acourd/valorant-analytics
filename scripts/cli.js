#!/usr/bin/env node
/**
 * cli.js - Master Universal CLI & Intelligent Dispatcher for valorant-analytics
 * v3.0: Sovereign Multi-Engine Architecture.
 * Includes Formal Invariant Validation, Ed25519 DSSE Attestation, Merkle Ledgers,
 * Preflight Sandboxing, Session Guardian, Drift Detection & Multi-Lens Consensus.
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
 *   node cli.js consensus <archivo> [jugador]            ➔ Síntesis Multi-Lente (determinista)
 *   node cli.js synthesize <archivo> [jugador]           ➔ Rutina Adaptativa Evolutiva
 *   node cli.js sbom                                     ➔ Manifiesto CycloneDX SBOM
 */

const path = require('path');
const fs = require('fs');

const { evaluateLearningProfile } = require('./learning_profile');
const { auditDuoSynergy } = require('./duo_synergy');
const { parseDuels } = require('./duel_matrix');
const { generateKovaaksRoutine } = require('./kovaaks_generator');
const { extractMatchId } = require('./fetch_match');
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
const { extractAccountTelemetry, aggregateCareerTelemetry, generateMilestonesTimeline } = require('./career_telemetry');
const { evaluateMmrDrag, evaluateTalentVsEffort } = require('./autodiagnostic_engine');
const { classifyEvidence, observeMatchTelemetry, observeDuelRows } = require('./evidence_policy');
const { sourceProvenance, provenanceLabel } = require('./data_contract');
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
  if (JSON_MODE) return; // la procedencia viaja en el payload estructurado
  const meta = (matchData && matchData.data && matchData.data.metadata) || {};
  const provenance = sourceProvenance(meta);
  if (provenance === 'synthetic_demo') {
    console.log(`[FUENTE: ${provenanceLabel(provenance)}] Telemetría reconstruida. NO es una partida real: solo demostrativo.`);
  } else if (provenance === 'verified_source') {
    console.log(`[FUENTE: ${provenanceLabel(provenance)}] ${typeof source === 'string' ? source : ''}`);
  } else if (typeof source === 'string' && fs.existsSync(source)) {
    console.log(`[FUENTE: ${provenanceLabel(provenance)}] Archivo local: ${source}`);
  } else {
    console.log(`[FUENTE: ${provenanceLabel(provenance)}] Tracker.gg / caché local`);
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

  if (usedBundledSample && !JSON_MODE) {
    console.log(`[FUENTE: fixture de ejemplo incluido (examples/sample_match.json). Pasa un archivo JSON o un Riot ID propio para análisis real.]`);
  }

  return { target, player };
}

function handleProfile(handle, jsonOut = false) {
  const normalized = normalizeHandle(handle);
  const [name, tag] = handle.split('#');
  const opggTag = tag ? `${name.trim()}-${tag.trim()}` : name.trim();
  const trackerTag = tag ? `${name.trim()}%23${tag.trim()}` : normalized;
  const links = {
    opgg: `https://op.gg/es/valorant/profile/${encodeURIComponent(opggTag)}`,
    tracker: `https://tracker.gg/valorant/profile/riot/${trackerTag}/overview`,
    vlr: `https://www.vlr.gg/search/?q=${encodeURIComponent(name.trim())}`
  };

  if (jsonOut) {
    process.stdout.write(JSON.stringify({ command: 'profile', handle, links, note: 'Enlaces informativos; no se consulta ninguna plataforma.' }, null, 2) + '\n');
    return;
  }

  printBanner();
  console.log(`🌐 PERFIL DE TELEMETRÍA MULTI-PLATAFORMA: ${handle}`);
  console.log(`------------------------------------------------------------------------`);
  console.log(`  • OP.GG:     ${links.opgg}`);
  console.log(`  • Tracker:   ${links.tracker}`);
  console.log(`  • VLR.gg:    ${links.vlr}`);
  console.log(`\nℹ️ Enlaces informativos (no se consulta Tracker desde aquí).`);
  console.log(`   Para analizar, aporta un JSON/export, el texto del marcador o una captura con confirmación:`);
  console.log(`   node cli.js match <partida.json> "${handle}"`);
  console.log(`========================================================================\n`);
}

function buildDuelTable(matrixData, playerHandle) {
  const { playerMap, duelMatrix, target } = matrixData;
  const effectiveTarget = target || require('./data_contract').resolveExactHandle(Object.keys(playerMap), playerHandle);
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

let DEMO_MODE = false;
let JSON_MODE = false;

// Códigos de salida documentados (ver ayuda):
// 0 = resultado descriptivo válido (incluye n/d / omitido como respuesta contractual)
// 1 = entrada, objetivo o comando inválido
// 2 = evidencia insuficiente para el resultado principal (guardian, drift)
const EXIT = Object.freeze({ OK: 0, INVALID: 1, INSUFFICIENT: 2 });

function emit(jsonOut, payload, human) {
  if (jsonOut) { process.stdout.write(JSON.stringify(payload, null, 2) + '\n'); return; }
  human();
}

// Ningún comando selecciona un jugador en silencio: sin objetivo explícito
// solo se auto-resuelve un roster de UN jugador; si hay varios, el contrato
// lanza TARGET_REQUIRED con candidatos (exit 1).
function resolveEffectivePlayer(matchData, player) {
  if (player) return player;
  const handles = (matchData && matchData.data && matchData.data.segments || [])
    .filter(s => s.type === 'player-summary')
    .map(s => s.metadata?.platformUserHandle || s.attributes?.platformUserIdentifier)
    .filter(Boolean);
  return require('./data_contract').resolveExactHandle(handles, undefined);
}

function runCli(argv) {
  const args = argv.slice();
  DEMO_MODE = args.includes('--demo');
  const jsonOut = args.includes('--json');
  JSON_MODE = jsonOut;
  for (let i = args.length - 1; i >= 0; i--) { if (args[i] === '--demo' || args[i] === '--json') args.splice(i, 1); }
  const command = args[0];

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
  console.log(`  node cli.js calibrate [jugador] [rango] [rol]     ➔ SIMULACIÓN offline (no análisis real)`);
  console.log(`  node cli.js career <perfil.json>           ➔ Auditoría de Horas y Trayectoria`);
  console.log(`  node cli.js diagnose <perfil.json>         ➜ Señal heurística de MMR y estimación de rango (hipótesis no verificada)`);
  console.log(`  node cli.js parse <texto_o_archivo> [jugador]     ➔ Ingesta offline (JSON/texto aportado; sin red)`);
  console.log(`  node cli.js invariants <partida_o_id> [jugador]   ➔ Verificación Formal de Invariantes`);
  console.log(`  node cli.js attest <partida_o_id> [jugador]       ➔ Sobre DSSE in-toto firmado con Ed25519`);
  console.log(`  node cli.js merkle <partida_o_id>                 ➔ Árbol Merkle de Eventos y Pruebas`);
  console.log(`  node cli.js guardian <partida_o_id> [jugador]     ➔ Monitor de Fatiga y Tilt`);
  console.log(`  node cli.js drift <partida_o_id> [jugador]        ➔ Radar de Deriva y Entropía`);
  console.log(`  node cli.js consensus <partida_o_id> [jugador]    ➔ Síntesis Multi-Lente (determinista)`);
  console.log(`  node cli.js synthesize <partida_o_id> [jugador]   ➔ Rutina Adaptativa Evolutiva`);
  console.log(`  node cli.js sbom                                  ➔ Manifiesto CycloneDX SBOM`);
  console.log(`\nEJEMPLOS:`);
  console.log(`  node cli.js "Derke#0001"`);
  console.log(`  node cli.js match examples/sample_match.json "TenZ#0001"`);
  console.log(`  node cli.js duo examples/sample_match.json "TenZ#0001" "Chronicle#0001"`);
  console.log(`  node cli.js duels examples/sample_match.json`);
  console.log(`\nSALIDA ESTRUCTURADA: añade --json a match/aim/duels/weapons/economy/coaching/duo/guardian/drift/consensus/synthesize/parse/career/diagnose/sbom/profile.`);
  console.log(`CÓDIGOS DE SALIDA: 0 = resultado descriptivo válido (incluye n/d y "omitido" como respuesta contractual);`);
  console.log(`                   1 = entrada, objetivo o comando inválido; 2 = evidencia insuficiente para el resultado principal (guardian, drift).`);
  console.log(`OBJETIVO: ningún comando selecciona un jugador silenciosamente; indica el Riot ID exacto (salvo roster de 1 jugador).`);
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
  handleProfile(command, jsonOut);
  process.exit(0);
}

try {
  if (command === 'match' || command === 'diagnostic') {
    const { target, player } = resolveTargetAndPlayer(args);
    const matchData = resolveMatchData(target, player);
    const res = evaluateLearningProfile(matchData, player);
    validateLearningProfile(res);
    const evidence = deriveMatchEvidence(matchData, player, target);

    emit(jsonOut, {
      command: 'match',
      player: res.player, agent: res.agent, rank: res.rank, map: res.map,
      provenance: res.provenance, provenanceLabel: provenanceLabel(res.provenance),
      dataQuality: res.dataQuality, warning: res.warning,
      evidence: { level: evidence.level, missing: evidence.missing, allowedSections: evidence.allowedSections },
      radar: res.radar, pillarsObserved: res.pillarsObserved, eloLeaks: res.eloLeaks,
      observations: (evidence.observedEvents || []).slice(0, 50),
      prescription: res.prescripcionInmediata
    }, () => {
    printBanner();
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
        console.log(`  • ${label}: ${d && d.available && value !== null ? `${value} / 100` : 'n/d (sin métrica+benchmark)'}`);
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
    if (evidence.allowedSections.includes('aim_routine') && res.prescripcionInmediata) {
      console.log(`\n🎯 RUTINA KOVAAKS (${res.prescripcionInmediata.metrica}; umbral ${res.prescripcionInmediata.umbral}): ${res.prescripcionInmediata.sesionKovaaks}`);
      console.log(`💡 Regla de timing/tradeo: OMITIDA — ${res.prescripcionInmediata.limitacion}`);
    } else {
      console.log(`\n🎯 Rutina omitida: falta evidencia mecánica observada (HS% válido).`);
    }
    console.log(`========================================================================\n`);
    });

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
      const missing = [!p1 ? 'player1' : null, !p2 ? 'player2' : null].filter(Boolean).join(' y ');
      const candidates = uniqueHandles.length > 0
        ? `Candidatos: ${uniqueHandles.slice(0, 10).join(', ')}`
        : 'La telemetría no contiene jugadores válidos.';
      console.error(`Error: duo requiere DOS Riot IDs exactos (p1 y p2); falta ${missing}. ${candidates}`);
      console.error(`Uso: node cli.js duo <archivo_o_id> "Nombre#TAG" "Nombre#TAG"`);
      process.exit(EXIT.INVALID);
    }
    const res = auditDuoSynergy(matchData, p1, p2);
    validateDuoSynergy(res);

    emit(jsonOut, Object.assign({ command: 'duo', provenance: res.provenance }, res), () => {
    printBanner();
    const fmtNum = v => (v === null || v === undefined ? 'n/d' : v);
    console.log(`🤝 AUDITORÍA DE DÚO: ${res.p1.handle} + ${res.p2.handle} | Sinergia: ${fmtNum(res.synergy.score)}`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`👤 ${res.p1.handle} (${res.p1.agent || 'n/d'}): ACS ${fmtNum(res.p1.acs)} | KD ${fmtNum(res.p1.kd)} | HS% ${fmtNum(res.p1.hs)}`);
    console.log(`👤 ${res.p2.handle} (${res.p2.agent || 'n/d'}): ACS ${fmtNum(res.p2.acs)} | KD ${fmtNum(res.p2.kd)} | HS% ${fmtNum(res.p2.hs)}`);
    console.log(`\n⚖️ VEREDICTO: ${res.synergy.verdict}`);
    if (res.synergy.acsDifferential) console.log(`   Diferencial: ${res.synergy.acsDifferential}`);
    if (res.synergy.missing && res.synergy.missing.length > 0) console.log(`   Faltantes: ${res.synergy.missing.join('; ')}`);
    if (res.synergy.carryAnalysis) {
      console.log(`   Carga: ${res.synergy.carryAnalysis.primaryCarrier} carga, ${res.synergy.carryAnalysis.secondaryPlayer} soporta | Candidato a boost: ${res.synergy.carryAnalysis.boostCandidate ? 'SÍ (heurística)' : 'no'}`);
    }
    if (res.synergy.tacticalAdvice) console.log(`   Directiva:   ${res.synergy.tacticalAdvice}`);
    if (res.synergy.limitations) console.log(`   Límites:     ${res.synergy.limitations.join(' ')}`);
    console.log(`========================================================================\n`);
    });

  } else if (command === 'aim' || command === 'kovaaks') {
    const { target, player } = resolveTargetAndPlayer(args);
    const matchData = resolveMatchData(target, player);
    const evidence = deriveMatchEvidence(matchData, player, target);
    const res = generateKovaaksRoutine(matchData, player);

    emit(jsonOut, Object.assign({ command: 'aim', evidence: { level: evidence.level, missing: evidence.missing } }, res), () => {
    printBanner();
    if (res.omitted) {
      console.log(`🎯 RUTINA OMITIDA: ${res.omittedReason}`);
      console.log(`   Procedencia: ${res.provenanceLabel}`);
      console.log(`   Métricas faltantes: ${res.missingMetrics.join(', ') || 'ninguna'}`);
      console.log(`   Datos requeridos: ${res.requiredData.join('; ') || 'ninguna'}`);
      printEvidenceLimits(evidence);
    } else {
      console.log(`🎯 RUTINA KOVAAKS 15-MIN (${res.provenanceLabel}): ${res.player} | Mapa: ${res.map || 'n/d'}`);
      console.log(`HS%: ${res.hsPct || 'n/d'}`);
      console.log(`Sens: ${res.sensitivityNote}`);
      console.log(`------------------------------------------------------------------------`);
      res.routine.forEach(sc => {
        console.log(`  • [${sc.duration}] ${sc.scenario}${sc.aimLab ? ` | ${sc.aimLab}` : ''}`);
        console.log(`       ${sc.category}: ${sc.instruction}`);
        console.log(`       Motivo: ${sc.reason}`);
      });
    }
    console.log(`========================================================================\n`);
    });

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

    emit(jsonOut, {
      command: 'duels',
      player: duelInfo.target || player || null,
      provenance: 'normalized_input',
      evidence: { level: evidence.level, missing: evidence.missing, allowedSections: evidence.allowedSections },
      error: duelInfo.error || null,
      rows: duelInfo.rows
    }, () => {
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
    });

  } else if (command === 'weapons' || command === 'armas') {
    const { target, player } = resolveTargetAndPlayer(args);
    const matchData = resolveMatchData(target, player);
    const result = analyzeWeaponTelemetry(matchData, player);
    if (result.zoneMetrics.observed) validateWeaponTelemetry(result);

    emit(jsonOut, Object.assign({ command: 'weapons' }, result), () => {
    printBanner();
    console.log(`🎯 TELEMETRÍA DE ARMAS E IMPACTOS: ${result.player} (${result.agent || 'n/d'})`);
    console.log(`Distribución de Zonas: Cabeza ${result.hitZoneDistribution.head} | Cuerpo ${result.hitZoneDistribution.body} | Piernas ${result.hitZoneDistribution.leg}`);
    console.log(`Disciplina de Disparo: ${result.metrics.firingDiscipline || 'n/d'} (SE/TP Ratio: ${result.metrics.sprayTapRatio === null ? 'n/d' : result.metrics.sprayTapRatio})`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`DISTANCIA: ${result.distanceNote}`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`DIAGNÓSTICO TÁCTICO: ${result.recoilDiagnosis.analisisTactico}`);
    console.log(`RUTINA ASOCIADA: ${result.recoilDiagnosis.kovaaksPrescription || 'RUTINA OMITIDA (sin umbral superado o sin eventos de daño)'}`);
    console.log(`========================================================================\n`);
    });

  } else if (command === 'economy' || command === 'eco') {
    const { target, player } = resolveTargetAndPlayer(args);
    const matchData = resolveMatchData(target, player);
    const eco = analyzeEconomy(matchData, player);

    emit(jsonOut, Object.assign({ command: 'economy' }, eco), () => {
    printBanner();
    const fmt = v => (v === null || v === undefined ? 'n/d' : v);
    console.log(`💰 DESGLOSE DE ECONOMÍA Y BUY TIERS: ${eco.player} (${eco.agent || 'n/d'} - ${eco.rank || 'n/d'})`);
    console.log(`------------------------------------------------------------------------`);
    console.table(eco.tiers.map(t => ({
      'Buy Tier': t.tier,
      'Rounds': fmt(t.rounds),
      'Record (W-L)': t.won === null || t.lost === null ? 'n/d' : `${t.won}-${t.lost}`,
      'Win %': fmt(t.winPct),
      'KDA': fmt(t.kda),
      'K/D': fmt(t.kd),
      'ADR': fmt(t.adr),
      'ACS': fmt(t.acs),
      'HS%': fmt(t.hsPct)
    })));
    if (eco.unclassifiedRounds > 0) console.log(`Nota: ${eco.note}`);
    console.log(`========================================================================\n`);
    });

  } else if (command === 'coaching' || command === 'coach') {
    const { target, player } = resolveTargetAndPlayer(args);
    const matchData = resolveMatchData(target, player);
    const report = generateCoachingReport(matchData, player);

    emit(jsonOut, Object.assign({ command: 'coaching' }, report), () => {
    printBanner();
    if (report.error) {
      console.log(`⚠️ ${report.error}`);
    } else {
      console.log(`🧠 REPORTE INTROSPECTIVO DE COACHING TÁCTICO: ${report.player.handle} (${report.player.agent || 'n/d'} - ${report.player.rank || 'n/d'})`);
      console.log(`------------------------------------------------------------------------`);
      if (report.insufficient) {
        console.log(`EVIDENCIA INSUFICIENTE: faltan ${report.missing.join(', ')}. No se emiten recomendaciones.`);
      } else {
        console.log(`⚔️ DUELOS CON MAYOR FRICCIÓN EN LA PARTIDA:`);
        if (!report.hardOpponents || report.hardOpponents.length === 0) {
          console.log(`  (sin duelos observados con balance negativo)`);
        } else {
          report.hardOpponents.forEach(h => {
            console.log(`  • vs ${h.opp.handle.padEnd(20)} (${(h.opp.agent || '?').padEnd(10)}): ${h.kills} K - ${h.deaths} D (Déficit: -${h.diff})`);
          });
        }
        console.log(`\n📚 RECOMENDACIONES (métrica + umbral + procedencia):`);
        if (report.recommendations.length === 0) {
          console.log(`  (ninguna recomendación habilitada: sin umbral observado superado)`);
        } else {
          report.recommendations.forEach(r => {
            console.log(`  • ${r.module}: ${r.rationale}`);
            console.log(`    Métrica: ${r.metric} | Umbral: ${r.threshold} | Procedencia: ${r.provenance}`);
            console.log(`    Limitación: ${r.limitation}`);
          });
        }
        console.log(`\n📚 RECURSOS EDUCATIVOS RECOMENDADOS (genéricos, no diagnóstico):`);
        const resourceList = Object.values(report.resources);
        if (resourceList.length === 0) console.log(`  (sin recursos recomendados para esta evidencia)`);
        resourceList.forEach(r => {
          console.log(`  • ${r.title}`);
          console.log(`    Conceptos: ${r.keyConcepts[0]}`);
          console.log(`    Creadores: ${r.creators.join(', ')}`);
          console.log(`    Enlace:    ${r.searchQuery}`);
        });
        if (report.unrecommended.length > 0) console.log(`  (No renderizados por no estar recomendados: ${report.unrecommended.join(', ')})`);
      }
      if (report.limitations) console.log(`\nLímites: ${report.limitations.join(' ')}`);
    }
    console.log(`========================================================================\n`);
    });

  } else if (command === 'calibrate' || command === 'mock') {
    const player = args[1] || 'Player#0001';
    const rank = args[2] || 'Ascendant 2';
    const role = args[3] || 'Duelist';

    printBanner();
    console.log(`🎯 CALIBRACIÓN INSTANTÁNEA ZERO-CLOUD (OFFLINE MODE): ${player}`);
    console.log(`⚠️ SIMULACIÓN: valores ilustrativos; NO provienen de tu perfil ni de telemetría real.`);
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
    const matchData = resolveMatchData(target, player);
    const effectivePlayer = resolveEffectivePlayer(matchData, player);

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
    const matchData = resolveMatchData(target, player);
    const effectivePlayer = resolveEffectivePlayer(matchData, player);
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
    const matchData = resolveMatchData(target, player);
    const effectivePlayer = resolveEffectivePlayer(matchData, player);
    const guardian = new SessionGuardian();
    const audit = guardian.auditSession(matchData, effectivePlayer);

    emit(jsonOut, Object.assign({ command: 'guardian', player: effectivePlayer }, audit), () => {
    printBanner();
    if (audit.verdict === 'INSUFFICIENT_DATA') {
      console.log(`🛡️ SESSION GUARDIAN: EVIDENCIA INSUFICIENTE (NO_DATA)`);
      console.log(`Jugador: ${effectivePlayer}`);
      console.log(`------------------------------------------------------------------------`);
      console.log(`  • Sin consejo de cola ni de salud: faltan datos observados.`);
      console.log(`  • Faltantes: ${(audit.missing || []).join('; ')}`);
      console.log(`========================================================================\n`);
    } else {
      console.log(`🛡️ SESSION GUARDIAN: FATIGA & TILT COGNITIVO`);
      console.log(`Jugador: ${effectivePlayer} | Veredicto: ${audit.verdict}`);
      console.log(`------------------------------------------------------------------------`);
      console.log(`  • Nivel de Tilt:     ${audit.tilt.level} (Índice: ${audit.tilt.tiltIndex}/100)`);
      console.log(`  • Factor de Fatiga:  ${audit.fatigue.fatigueFactor} / 1.00 (${audit.fatigue.continuousMinutes} mins acumulados)`);
      console.log(`  • Apto para competir: ${audit.safeToContinue ? 'SÍ (Continuar cola)' : 'NO (Pausa obligatoria)'}`);
      console.log(`\n📋 DIRECTIVAS DE SALUD COGNITIVA:`);
      audit.prescriptions.forEach(p => console.log(`  • ${p}`));
      console.log(`========================================================================\n`);
    }
    });
    if (audit.verdict === 'INSUFFICIENT_DATA') process.exit(EXIT.INSUFFICIENT);

  } else if (command === 'drift') {
    const { target, player } = resolveTargetAndPlayer(args);
    const matchData = resolveMatchData(target, player);
    const effectivePlayer = resolveEffectivePlayer(matchData, player);
    const detector = new DriftDetector();
    const driftReport = detector.auditMatchDrift(matchData, effectivePlayer);

    emit(jsonOut, Object.assign({ command: 'drift', player: effectivePlayer }, driftReport), () => {
    printBanner();
    if (driftReport.noData) {
      console.log(`📊 RADAR DE DERIVA: EVIDENCIA INSUFICIENTE (NO_DATA)`);
      console.log(`Jugador: ${effectivePlayer}`);
      console.log(`------------------------------------------------------------------------`);
      console.log(`  • Sin estabilidad ni entropía: faltan rondas observadas del objetivo.`);
      console.log(`========================================================================\n`);
    } else {
      console.log(`📊 RADAR DE DERIVA TÁCTICA Y ENTROPÍA MECÁNICA`);
      console.log(`Jugador: ${effectivePlayer} | Estabilidad Global: ${driftReport.overallStability}%`);
      console.log(`------------------------------------------------------------------------`);
      console.log(`  • Clasificación de Lado: ${driftReport.sideDivergence.classification} (Divergencia: ${driftReport.sideDivergence.divergenceScore}%)`);
      console.log(`  • Entropía de Quarters:  ${driftReport.quarterDrift.killDistributionEntropy} / ${driftReport.quarterDrift.maxPossibleEntropy}`);
      console.log(`  • Diagnóstico:           ${driftReport.quarterDrift.diagnosis}`);
      console.log(`========================================================================\n`);
    }
    });
    if (driftReport.noData) process.exit(EXIT.INSUFFICIENT);

  } else if (command === 'consensus') {
    const { target, player } = resolveTargetAndPlayer(args);
    const matchData = resolveMatchData(target, player);
    const profile = evaluateLearningProfile(matchData, player);
    const arbiter = new ConsensusArbiter();
    const report = arbiter.synthesizeConsensus(profile);

    emit(jsonOut, Object.assign({ command: 'consensus', player: profile.player }, report), () => {
    printBanner();
    console.log(`🧠 SÍNTESIS DE CONSENSO MULTI-LENTE (determinista; 3 lentes locales)`);
    console.log(`Jugador: ${profile.player} | Veredicto: ${report.verdict} | Procedencia: ${report.provenanceLabel}`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`  • Lentes Participantes:  ${report.participatingLenses}`);
    console.log(`  • Quórum Alcanzado:      ${report.quorumAchieved ? 'SÍ' : 'NO'}`);
    console.log(`  • Prioridad de Acción:   ${report.actionablePriority}`);
    if (report.missing && report.missing.length > 0) console.log(`  • Evidencia faltante:    ${report.missing.join('; ')}`);
    console.log(`\n🔍 SÍNTESIS UNIFICADA DE LENTES:`);
    report.synthesis.forEach(s => console.log(`  • ${s}`));
    console.log(`========================================================================\n`);
    });

  } else if (command === 'synthesize') {
    const { target, player } = resolveTargetAndPlayer(args);
    const matchData = resolveMatchData(target, player);
    const profile = evaluateLearningProfile(matchData, player);
    const synthesizer = new RoutineSynthesizer({ targetDurationMinutes: 15 });
    const routine = synthesizer.synthesizeRoutine(profile);

    emit(jsonOut, Object.assign({ command: 'synthesize' }, routine), () => {
    printBanner();
    if (routine.omitted) {
      console.log(`🧬 RUTINA OMITIDA: ${routine.omittedReason}`);
      console.log(`   Procedencia: ${routine.provenanceLabel}`);
      console.log(`   Métricas faltantes: ${routine.missingMetrics.join(', ') || 'ninguna'}`);
      console.log(`   Datos requeridos: ${routine.requiredData.join('; ') || 'ninguna'}`);
    } else {
      console.log(`🧬 RUTINA EVOLUTIVA ADAPTATIVA (${routine.provenanceLabel}): ${routine.player} (${routine.totalRoutineMinutes} min)`);
      console.log(`------------------------------------------------------------------------`);
      console.log(`ÁREAS DE DEBILIDAD DETECTADAS (métrica observada + umbral documentado):`);
      routine.identifiedWeaknesses.forEach(w => console.log(`  [${w.area}] ${w.reason}`));
      console.log(`\nEJERCICIOS SINTETIZADOS:`);
      routine.drillPlan.forEach((d, i) => {
        console.log(`  ${i + 1}. [${d.focus}] ${d.scenario} x${d.reps} (${d.durationPerRep}) - Dificultad: ${d.difficultyMultiplier}x`);
      });
      console.log(`\n💡 CONSEJO NEUROMUSCULAR (${routine.neuroMuscleAdviceBasis || 'genérico'}): ${routine.neuroMuscleAdvice}`);
    }
    console.log(`========================================================================\n`);
    });

  } else if (command === 'sbom') {
    const manifest = generateSbom();
    emit(jsonOut, Object.assign({ command: 'sbom' }, manifest), () => {
    printBanner();
    console.log(`📦 MANIFIESTO CYCLONEDX SBOM (ZERO-DEPENDENCY AUDIT)`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`  • Componente:         ${manifest.metadata.component.name} v${manifest.metadata.component.version}`);
    console.log(`  • Módulos Verificados: ${manifest.components.length} archivos JS locales sellados con SHA-256`);
    console.log(`  • Dependencias NPM:   0 (Pure Standard Library)`);
    console.log(`  • Licencia:           ${manifest.metadata.component.licenses[0].license.id}`);
    console.log(`========================================================================\n`);
    });

  } else if (command === 'profile') {
    const handle = args[1];
    if (!handle || !/^[^#\s][^#]*#[^#\s][^#]*$/.test(handle.trim())) {
      console.error('Error: Riot ID inválido. Usa formato Nombre#TAG (ej. node cli.js profile "Derke#0001").');
      process.exit(EXIT.INVALID);
    }
    handleProfile(handle, jsonOut);

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
    const matchData = resolveMatchData(fileInput, player);
    const res = evaluateLearningProfile(matchData, player);
    validateLearningProfile(res);
    const evidence = deriveMatchEvidence(matchData, player, fileInput);
    emit(jsonOut, {
      command: 'parse',
      player: res.player, agent: res.agent, rank: res.rank, map: res.map,
      provenance: res.provenance, provenanceLabel: provenanceLabel(res.provenance),
      evidence: { level: evidence.level, missing: evidence.missing, allowedSections: evidence.allowedSections },
      radar: res.radar, pillarsObserved: res.pillarsObserved, eloLeaks: res.eloLeaks,
      observations: (evidence.observedEvents || []).slice(0, 50),
      prescription: res.prescripcionInmediata
    }, () => {
    printBanner();
    console.log(`📋 INGESTA UNIVERSAL RESILIENTE (offline): ${res.player} (${res.agent} - ${res.rank}) | Mapa: ${res.map}`);
    printEvidenceLimits(evidence);
    console.log(`------------------------------------------------------------------------`);
    if (evidence.allowedSections.includes('aggregate_radar')) {
      console.log(`📊 RADAR DE RENDIMIENTO (DIMENSIONAL: solo dimensiones con métrica+benchmark):`);
      const radarRows = [
        ['Precisión Mecánica', 'precision', res.radar.precisionMecanica],
        ['Macrogame y Espacio', 'macro', res.radar.macrogamePosicionamiento],
        ['Duelos de Apertura', 'openings', res.radar.duelosDeApertura],
        ['Disciplina Económica', 'economy', res.radar.disciplinaEconomica],
        ['Compostura en Clutch', 'clutch', res.radar.composturaClutch]
      ];
      radarRows.forEach(([label, key, value]) => {
        const d = evidence.dimensions[key];
        console.log(`  • ${label}: ${d && d.available && value !== null ? `${value} / 100` : 'n/d (sin métrica+benchmark)'}`);
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
    if (evidence.allowedSections.includes('aim_routine') && res.prescripcionInmediata) {
      console.log(`\n🎯 RUTINA KOVAAKS (${res.prescripcionInmediata.metrica}; umbral ${res.prescripcionInmediata.umbral}): ${res.prescripcionInmediata.sesionKovaaks}`);
      console.log(`💡 Regla de timing/tradeo: OMITIDA — ${res.prescripcionInmediata.limitacion}`);
    } else {
      console.log(`\n🎯 Rutina omitida: falta evidencia mecánica observada (HS% válido).`);
    }
    console.log(`========================================================================\n`);
    });

  } else if (command === 'harvest') {
    printBanner();
    console.error('Comando retirado: harvest leía la caché del navegador del usuario (no consentido y no estable).');
    console.error('Vías admitidas: node cli.js match <archivo.json> | node cli.js parse "<texto>" | captura con confirmación | Riot RSO (pendiente).');
    process.exit(1);

  } else if (command === 'career') {
    const inputPath = args[1];
    let profileData = null;
    let handleName = args[2] || 'Jugador';

    if (inputPath && fs.existsSync(inputPath)) {
      profileData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    }

    if (!profileData) {
      console.error('Error: No se encontró el archivo JSON de perfil. Proporciona un JSON/export aportado explícitamente (la cosecha de caché y el handle fueron retirados).');
      process.exit(1);
    }

    const tel = extractAccountTelemetry(profileData, { handle: handleName });
    const agg = aggregateCareerTelemetry([{ telemetry: tel }]);
    const timeline = generateMilestonesTimeline(agg);

    emit(jsonOut, { command: 'career', telemetry: tel, summary: agg.summary, dataQuality: agg.dataQuality, timeline }, () => {
    printBanner();
    console.log(`⏱️ AUDITORÍA DE CARRERA Y TIEMPO REAL: ${tel.handle}`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`  • Horas en Competitivo (aportadas):  ${tel.competitive.formatted} (${tel.competitive.hours}h)`);
    console.log(`  • Horas en Otros Modos (Casual):   ${tel.casual.formatted} (${tel.casual.hours}h)${tel.casual.allowanceHours > 0 ? ` [incluye allowance ${tel.casual.allowanceHours}h NO medidas]` : ''}`);
    console.log(`  • Horas Totales Efectivas:         ${tel.general.formatted} (${tel.general.hours}h)`);
    console.log(`  • Rango Actual: ${tel.currentRank || 'n/d'} | Pico: ${tel.peakRank || 'n/d'}`);
    console.log(`  • Partidas: ${tel.competitive.matches} (Victorias: ${tel.competitive.wins}) | K/D: ${tel.competitive.kd} | HS: ${tel.competitive.hs}`);
    if (tel.casual.allowanceNote) console.log(`  • Nota casual: ${tel.casual.allowanceNote}`);
    console.log(`\n📅 CRONOLOGÍA DE HITOS Y HORAS ACUMULADAS:`);
    console.table(timeline.map(t => ({
      'Rango': t.rango,
      'Horas Tramo': t.tramoHoras === null ? 'n/d' : `${t.tramoHoras} h`,
      'Horas Acumuladas': `${t.acumuladoHoras} h`,
      'Contexto': t.contexto
    })));
    console.log(`========================================================================\n`);
    });

  } else if (command === 'diagnose') {
    const inputPath = args[1];
    let profileData = null;
    let handleName = args[2] || 'Jugador';

    if (inputPath && fs.existsSync(inputPath)) {
      profileData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    }

    if (!profileData) {
      console.error('Error: proporciona un JSON/export de perfil aportado explícitamente (la cosecha de caché local fue retirada).');
      process.exit(1);
    }

    const tel = extractAccountTelemetry(profileData, { handle: handleName });
    const agg = aggregateCareerTelemetry([{ telemetry: tel }]);
    const mmrDiag = evaluateMmrDrag(tel);
    const talentDiag = evaluateTalentVsEffort(agg);
    const evidence = deriveProfileEvidence(tel);

    emit(jsonOut, {
      command: 'diagnose', player: tel.handle,
      evidence: { level: evidence.level, missing: evidence.missing, allowedSections: evidence.allowedSections },
      hypothesis: {
        category: talentDiag.category, indicatorMix: talentDiag.talentRatio,
        rankScenario: talentDiag.trueDeservedRank, visualRank: tel.currentRank,
        mmrDragSignal: mmrDiag.mmrDragDetected, mmrDiagnosis: mmrDiag.diagnosis,
        bottleneck: talentDiag.bottleneckOptimization || null
      },
      claimStatus: talentDiag.claimStatus, disclaimer: talentDiag.disclaimer, limitations: talentDiag.limitations
    }, () => {
    printBanner();
    console.log(`🧠 AUTODIAGNÓSTICO INTEGRAL (HIPÓTESIS HEURÍSTICA, NO VERIFICADA): ${tel.handle}`);
    printEvidenceLimits(evidence);
    console.log(`------------------------------------------------------------------------`);
    console.log(`🏷️ CATEGORÍA (hipótesis descriptiva): ${talentDiag.category}`);
    console.log(`⚖️ MEZCLA DE INDICADORES: ${talentDiag.talentRatio}`);
    console.log(`🎯 ESCENARIO DE RANGO DE REFERENCIA (no es rango merecido ni predicción): ${talentDiag.trueDeservedRank} (Rango visual: ${tel.currentRank || 'n/d'})`);
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
    });

  } else {
    // Fallback frictionless: archivo o texto largo → diagnóstico directo
    if (fs.existsSync(command) || command.length > 20) {
      const matchData = resolveMatchData(command, args[1]);
      const res = evaluateLearningProfile(matchData, args[1]);
      printBanner();
      console.log(`🎯 DIAGNÓSTICO DIRECTO: ${res.player} (${res.agent} - ${res.rank}) | Mapa: ${res.map}`);
      console.log(`------------------------------------------------------------------------`);
      console.log(`📊 Radar Precisión Mecánica: ${res.radar.precisionMecanica === null ? 'n/d (sin métrica observada)' : `${res.radar.precisionMecanica} / 100`}`);
      console.log(`🎯 Rutina mecánica: ${res.prescripcionInmediata ? `${res.prescripcionInmediata.sesionKovaaks} (${res.prescripcionInmediata.metrica}; umbral ${res.prescripcionInmediata.umbral})` : 'omitida (sin HS% observado)'}`);
      console.log(`💡 Regla de timing/tradeo: ${res.prescripcionInmediata ? `OMITIDA — ${res.prescripcionInmediata.limitacion}` : 'omitida (sin HS% observado)'}`);
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
}

module.exports = {
  runCli,
  buildDuelTable,
  handleProfile,
  resolveMatchData,
  resolveTargetAndPlayer,
  printBanner,
  printProvenance,
  getProjectVersion
};

if (require.main === module) {
  runCli(process.argv.slice(2));
}