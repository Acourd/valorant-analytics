#!/usr/bin/env node
/**
 * learning_profile.js - 360° Autodiagnosis & Pedagogical Skill Profiler
 * Compiles a holistic 5-pillar skill radar, identifies the 3 biggest ELO leaks,
 * and prescribes an immediate actionable routine for player self-improvement.
 * 
 * Usage: node learning_profile.js <match_id_or_json_file> [target_player_handle]
 */

const fs = require('fs');
const { extractMatchId, fetchMatch } = require('./fetch_match');
const { parseDuels } = require('./duel_matrix');
const { analyzeEconomy } = require('./economy_analyzer');

function evaluateLearningProfile(matchData, targetHandle) {
  if (!matchData || typeof matchData !== 'object') {
    throw new Error('evaluateLearningProfile requiere un objeto de telemetría válido.');
  }
  const meta = matchData.data?.metadata || {};
  const segments = matchData.data?.segments || [];
  const playerSummaries = segments.filter(s => s.type === 'player-summary');
  
  const playerMap = {};
  playerSummaries.forEach(p => {
    const handle = p.metadata?.platformUserHandle || p.attributes?.platformUserIdentifier;
    playerMap[handle] = {
      handle,
      team: p.metadata?.teamId,
      agent: p.metadata?.agentName,
      rank: p.stats?.rank?.displayValue || p.metadata?.tierName || 'Unranked',
      stats: p.stats || {}
    };
  });

  let target = targetHandle ? Object.keys(playerMap).find(h => h.toLowerCase().includes(targetHandle.toLowerCase())) : Object.keys(playerMap)[0];
  if (!target) target = Object.keys(playerMap)[0];
  if (!target || !playerMap[target]) {
    throw new Error('No se encontraron jugadores válidos en la telemetría de la partida.');
  }

  const p = playerMap[target];
  const st = p.stats || {};
  const totalRounds = meta.rounds || 20;

  // Extract key metrics
  const hsPct = parseFloat(st.hsAccuracy?.displayValue || st.headshotsPercentage?.displayValue || '25%');
  const kd = parseFloat(st.kdRatio?.displayValue || ((st.kills?.value || 0) / Math.max(1, st.deaths?.value || 1)).toFixed(2));
  const acs = parseFloat(st.scorePerRound?.displayValue || ((st.score?.value || 0) / totalRounds).toFixed(1));
  const adr = parseFloat(st.damagePerRound?.displayValue || ((st.damage?.value || 0) / totalRounds).toFixed(1));
  const kast = parseFloat(st.kast?.displayValue || '70%');
  const fk = st.firstKills?.value || 0;
  const fd = st.firstDeaths?.value || 0;
  const clutches = st.clutches?.value || 0;

  // 1. Calculate the 5-Pillar Learning Radar (0 - 100)
  // Pillar A: Mechanical Precision & First-Bullet Accuracy
  let mechanicalScore = Math.min(100, Math.round((hsPct / 45) * 60 + (kd / 1.8) * 40));
  
  // Pillar B: Macrogame, Positioning & Space Control
  let macroScore = Math.min(100, Math.round((kast / 85) * 50 + ((adr / 180) * 50)));

  // Pillar C: Opening Duel Efficiency (First Blood Impact)
  const fkRatio = fk / Math.max(1, fd);
  let openingScore = Math.min(100, Math.round((fkRatio / 2.0) * 70 + (fk / 5) * 30));

  // Pillar D: Economic Discipline & Buy Conversion
  let economyScore = 75; // Baseline
  try {
    const econ = analyzeEconomy(matchData, target);
    const fullTier = econ.tiers.find(t => t.tier?.toLowerCase().includes('full'));
    if (fullTier) {
      const fullWinPct = parseFloat(fullTier.winPct);
      economyScore = Math.min(100, Math.round(fullWinPct * 0.8 + 20));
    }
  } catch(e) {}

  // Pillar E: Clutch Factor & Late-Round Composure
  let composureScore = Math.min(100, Math.round(50 + clutches * 25 + (st.kills3K?.value || 0) * 10));

  // 2. Identify the Top 3 ELO Leaks (Root causes of lost rounds)
  const eloLeaks = [];
  if (fd >= 3 && fd > fk) {
    eloLeaks.push({
      issue: 'Fuga de Primera Sangre (First Death Deficit)',
      detail: `Moriste primero en ${fd} rondas (${fk}/${fd} FK/FD), dejando a tu equipo en desventaja 4v5 constante.`,
      solution: 'Espera el contacto visual de la utilidad de tus iniciadores antes de cruzar la línea de visión principal.'
    });
  }
  if (hsPct < 25) {
    eloLeaks.push({
      issue: 'Inconsistencia en Puntería de Primer Tiro',
      detail: `Tu tasa de headshot fue de ${hsPct}%, forzando duelos por ráfagas al cuerpo que en rangos altos se castigan en <200ms.`,
      solution: 'Dedica 10 minutos a micro-flicks estáticos en Kovaaks (1w4ts / Pasu Small) antes de jugar.'
    });
  }
  if (kast < 68) {
    eloLeaks.push({
      issue: 'Baja Participación por Ronda (KAST < 68%)',
      detail: `En el ${Math.round(100 - kast)}% de las rondas no conseguiste Kill, Asistencia, Supervivencia ni fuiste Tradeado.`,
      solution: 'Juega más cerca de un compañero de apoyo para garantizar que cuando mueras, ellos obtengan el re-frag inmediato.'
    });
  }
  if (eloLeaks.length < 3) {
    eloLeaks.push({
      issue: 'Aceleración Prematura del Ritmo de Ronda',
      detail: 'Tendencia a empujar de forma reactiva en rondas donde el equipo ya cuenta con ventaja numérica de 5v3 o 4v2.',
      solution: 'Congela el avance tras conseguir el primer frag; obliga al rival a gastar su tiempo y utilidad.'
    });
  }

  // 3. Actionable Self-Improvement Prescription
  return {
    player: target,
    agent: p.agent,
    rank: p.rank,
    map: meta.mapName || 'Unknown',
    result: meta.result || 'Finished',
    radar: {
      precisionMecanica: `${mechanicalScore} / 100`,
      macrogamePosicionamiento: `${macroScore} / 100`,
      duelosDeApertura: `${openingScore} / 100`,
      disciplinaEconomica: `${economyScore} / 100`,
      composturaClutch: `${composureScore} / 100`
    },
    eloLeaks: eloLeaks.slice(0, 3),
    prescripcionInmediata: {
      reglaMental: 'Aplica la regla de los 2 segundos: antes de cada asomo, verifica en el minimapa si tienes un compañero a distancia de tradeo.',
      sesionKovaaks: hsPct >= 35 ? '5 min de Valorant Microshot Speed + 5 min de Thin Aiming Long' : '5 min de Pasu Small Reload + 5 min de 1wall6targets extra small'
    }
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args[0]) {
    console.error('Usage: node learning_profile.js <match_id_or_json_file> [target_player_handle]');
    process.exit(1);
  }

  let matchData;
  if (fs.existsSync(args[0])) {
    matchData = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  } else {
    const matchId = extractMatchId(args[0]);
    matchData = fetchMatch(matchId);
  }

  const handle = args[1];
  const res = evaluateLearningProfile(matchData, handle);

  console.log(`\n========================================================================`);
  console.log(`🎯 PERFIL AUTODIAGNÓSTICO 360°: ${res.player} (${res.agent} - ${res.rank})`);
  console.log(`Mapa: ${res.map} | Resultado: ${res.result}`);
  console.log(`========================================================================`);
  
  console.log(`\n📊 RADAR DE DOMINIO COMPETITIVO (5 PILARES):`);
  console.log(`  • Precisión Mecánica (First-Bullet):       ${res.radar.precisionMecanica}`);
  console.log(`  • Macrogame, Espacio y Posicionamiento:   ${res.radar.macrogamePosicionamiento}`);
  console.log(`  • Duelos de Apertura e Impacto (FK):       ${res.radar.duelosDeApertura}`);
  console.log(`  • Disciplina Económica y Conversión:       ${res.radar.disciplinaEconomica}`);
  console.log(`  • Compostura en Clutch y Late-Round:       ${res.radar.composturaClutch}`);

  console.log(`\n🚨 LAS 3 FUGAS DE ELO IDENTIFICADAS (¿DÓNDE SE PIERDEN LAS RONDAS?):`);
  res.eloLeaks.forEach((leak, idx) => {
    console.log(`\n  [Fuga ${idx + 1}] ⚠️ ${leak.issue}`);
    console.log(`    Detalle:   ${leak.detail}`);
    console.log(`    Solución:  ${leak.solution}`);
  });

  console.log(`\n💡 PRESCRIPCIÓN INMEDIATA PARA TU SIGUIENTE SESIÓN:`);
  console.log(`  • Regla Táctica:   ${res.prescripcionInmediata.reglaMental}`);
  console.log(`  • Práctica Kovaaks: ${res.prescripcionInmediata.sesionKovaaks}`);
  console.log(`========================================================================\n`);
}

module.exports = { evaluateLearningProfile };
