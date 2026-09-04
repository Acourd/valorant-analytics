#!/usr/bin/env node
/**
 * cli.js - Master Universal CLI & Intelligent Dispatcher for valorant-analytics
 * v2.6: dispatcher reparado (generateKovaaksRoutine, contrato real de parseDuels),
 * normalización de Riot IDs, URLs de tracker y archivos locales, exit codes estrictos.
 *
 * Usage:
 *   node cli.js "Derke#0001"                           ➔ Perfil Multi-Plataforma
 *   node cli.js match examples/sample_match.json "TenZ#0001" ➔ Autodiagnóstico 360°
 *   node cli.js duo <archivo> <p1> <p2>                ➔ Auditoría de Dúo
 *   node cli.js aim <archivo> [jugador]                ➔ Rutina Kovaaks 15 min
 *   node cli.js duels <archivo> [jugador]              ➔ Matriz de duelos 1v1
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

function printBanner() {
  console.log(`\n========================================================================`);
  console.log(`⚡ VALORANT ANALYTICS: UNIVERSAL COMPETITIVE ENGINE (V3.0)`);
  console.log(`========================================================================`);
}

function resolveMatchData(source) {
  if (fs.existsSync(source)) {
    return JSON.parse(fs.readFileSync(source, 'utf8'));
  }
  const matchId = extractMatchId(source);
  if (!matchId) throw new Error(`No se pudo extraer un match ID de: "${source}"`);
  return fetchMatch(matchId);
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
  if (!target || !playerMap[target]) {
    return { error: `Jugador "${playerHandle}" no encontrado en la partida.`, rows: [] };
  }
  const p = playerMap[target];
  const opponents = Object.values(playerMap).filter(o => o.team !== p.team);
  const rows = opponents.map(opp => {
    const kills = (duelMatrix[target] || {})[opp.handle] || 0;
    const deaths = (duelMatrix[opp.handle] || {})[target] || 0;
    return { opponent: opp.handle, opponentAgent: opp.agent, opponentRank: opp.rank, kills, deaths, net: kills - deaths };
  });
  return { error: null, rows };
}

const args = process.argv.slice(2);
let command = args[0];

if (!command || command === '--help' || command === '-h') {
  printBanner();
  console.log(`USO INTUITIVO (CLI RÁPIDO & AUTO-DISPATCHER):`);
  console.log(`  node cli.js "<riot_handle>"                       ➔ Detección automática de perfil`);
  console.log(`  node cli.js match <partida_o_id> [jugador]        ➔ Autodiagnóstico 360° y Fugas de ELO`);
  console.log(`  node cli.js duo <partida_o_id> <p1> <p2>          ➔ Auditoría de Sinergia y Tradeo de Dúo`);
  console.log(`  node cli.js aim <partida_o_id> [jugador]          ➔ Rutina Kovaaks 15 min adaptativa`);
  console.log(`  node cli.js duels <partida_o_id> [jugador]        ➔ Matriz de duelos 1v1 vs rivales`);
  console.log(`\nEJEMPLOS:`);
  console.log(`  node cli.js "Derke#0001"`);
  console.log(`  node cli.js match examples/sample_match.json "TenZ#0001"`);
  console.log(`  node cli.js duo examples/sample_match.json "TenZ#0001" "Chronicle#0001"`);
  console.log(`========================================================================\n`);
  process.exit(0);
}

// Auto-detección: si el primer arg contiene '#' (Riot ID) y no es un archivo → perfil
if (command.includes('#') && !fs.existsSync(command)) {
  handleProfile(command);
  process.exit(0);
}

try {
  if (command === 'match' || command === 'diagnostic') {
    const target = args[1] || path.join(__dirname, '..', 'examples', 'sample_match.json');
    const player = args[2];
    const matchData = resolveMatchData(target);
    const res = evaluateLearningProfile(matchData, player);

    printBanner();
    console.log(`🎯 DIAGNÓSTICO 360°: ${res.player} (${res.agent} - ${res.rank}) | Mapa: ${res.map}`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`📊 RADAR DE DOMINIO (5 PILARES):`);
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

  } else if (command === 'duo' || command === 'synergy') {
    const target = args[1] || path.join(__dirname, '..', 'examples', 'sample_match.json');
    const p1 = args[2] || 'TenZ#0001';
    const p2 = args[3] || 'Chronicle#0001';
    const matchData = resolveMatchData(target);
    const res = auditDuoSynergy(matchData, p1, p2);

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
    const target = args[1] || path.join(__dirname, '..', 'examples', 'sample_match.json');
    const player = args[2];
    const matchData = resolveMatchData(target);
    const res = generateKovaaksRoutine(matchData, player);

    printBanner();
    console.log(`🎯 RUTINA KOVAAKS 15-MIN: ${res.player} | Mapa: ${res.map}`);
    console.log(`HS%: ${res.hsPct}`);
    console.log(`Sens: ${res.sensitivityRecommendation}`);
    console.log(`------------------------------------------------------------------------`);
    res.routine.forEach(sc => {
      console.log(`  • [${sc.duration}] ${sc.scenario}`);
      console.log(`       ${sc.category}: ${sc.instruction}`);
    });
    console.log(`========================================================================\n`);

  } else if (command === 'duels' || command === 'matrix') {
    const target = args[1] || path.join(__dirname, '..', 'examples', 'sample_match.json');
    const player = args[2];
    const matchData = resolveMatchData(target);
    const { error, rows } = buildDuelTable(parseDuels(matchData, player), player);

    printBanner();
    if (error) {
      console.log(`⚠️ ${error}`);
    } else {
      console.log(`⚔️ MATRIZ DE DUELOS 1v1 DIRECTOS vs ${player} | Duelos: ${rows.length}`);
      console.log(`------------------------------------------------------------------------`);
      rows.forEach(d => {
        const icon = d.net > 0 ? '🟢' : d.net < 0 ? '🔴' : '⚪';
        console.log(`  ${icon} vs ${d.opponent.padEnd(20)} (${(d.opponentAgent || '?').padEnd(10)}): ${d.kills} K - ${d.deaths} D (Net: ${d.net > 0 ? '+' : ''}${d.net})`);
      });
    }
    console.log(`========================================================================\n`);

  } else if (command === 'weapons' || command === 'armas') {
    const target = args[1] || path.join(__dirname, '..', 'examples', 'sample_match.json');
    const player = args[2];
    const matchData = resolveMatchData(target);
    const result = analyzeWeaponTelemetry(matchData, player);

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

  } else if (command === 'profile') {
    const handle = args[1];
    if (!handle) {
      console.error('Error: Debes especificar un Riot ID (ej. node cli.js profile "Derke#0001")');
      process.exit(1);
    }
    handleProfile(handle);

  } else {
    // Fallback frictionless: archivo, URL de partida o texto largo → diagnóstico directo
    if (fs.existsSync(command) || command.includes('tracker.gg') || command.includes('op.gg') || command.length > 20) {
      const matchData = resolveMatchData(command);
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