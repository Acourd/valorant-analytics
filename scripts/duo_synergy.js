#!/usr/bin/env node
/**
 * duo_synergy.js - Duo Compatibility, Re-fragging & Team Synergy Auditor
 * Evaluates the tactical synergy, trade efficiency, and carry load balance
 * between two premade teammates in a competitive match.
 * 
 * Usage: node duo_synergy.js <match_id_or_json_file> <player1_handle> <player2_handle>
 */

const fs = require('fs');
const { extractMatchId, fetchMatch } = require('./fetch_match');

function auditDuoSynergy(matchData, handle1, handle2) {
  if (!matchData || typeof matchData !== 'object') {
    throw new Error('auditDuoSynergy requiere un objeto de telemetría válido.');
  }
  if (!handle1 || !handle2 || typeof handle1 !== 'string' || typeof handle2 !== 'string') {
    throw new Error('auditDuoSynergy requiere dos Riot IDs ("handle1" y "handle2").');
  }
  if (handle1.trim().toLowerCase() === handle2.trim().toLowerCase()) {
    throw new Error('auditDuoSynergy requiere dos jugadores distintos (no se puede auditar a un jugador consigo mismo).');
  }
  const meta = matchData.data?.metadata || {};
  const segments = matchData.data?.segments || [];
  const playerSummaries = segments.filter(s => s.type === 'player-summary');
  const killSegments = segments.filter(s => s.type === 'player-round-kills');

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

  const p1Key = Object.keys(playerMap).find(h => h.toLowerCase().includes(handle1.toLowerCase()));
  const p2Key = Object.keys(playerMap).find(h => h.toLowerCase().includes(handle2.toLowerCase()));

  if (!p1Key || !p2Key) {
    throw new Error(`Could not find both players in match data. Found: ${p1Key || 'None'} and ${p2Key || 'None'}`);
  }

  const p1 = playerMap[p1Key];
  const p2 = playerMap[p2Key];
  const sameTeam = p1.team === p2.team;

  const totalRounds = meta.rounds || 20;
  const p1Acs = parseFloat(p1.stats.scorePerRound?.displayValue || ((p1.stats.score?.value || 0) / totalRounds).toFixed(1));
  const p2Acs = parseFloat(p2.stats.scorePerRound?.displayValue || ((p2.stats.score?.value || 0) / totalRounds).toFixed(1));
  const p1Kd = parseFloat(p1.stats.kdRatio?.displayValue || ((p1.stats.kills?.value || 0) / Math.max(1, p1.stats.deaths?.value || 1)).toFixed(2));
  const p2Kd = parseFloat(p2.stats.kdRatio?.displayValue || ((p2.stats.kills?.value || 0) / Math.max(1, p2.stats.deaths?.value || 1)).toFixed(2));
  const p1Hs = parseFloat(p1.stats.hsAccuracy?.displayValue || p1.stats.headshotsPercentage?.displayValue || '0%');
  const p2Hs = parseFloat(p2.stats.hsAccuracy?.displayValue || p2.stats.headshotsPercentage?.displayValue || '0%');

  // Role compatibility check
  const dualDuelist = ['Reyna', 'Jett', 'Iso', 'Raze', 'Phoenix', 'Yoru', 'Neon'].includes(p1.agent) &&
                      ['Reyna', 'Jett', 'Iso', 'Raze', 'Phoenix', 'Yoru', 'Neon'].includes(p2.agent);
  
  const supportiveSetup = (['Iso', 'Jett', 'Reyna'].includes(p1.agent) && ['Sova', 'Skye', 'Fade', 'Clove', 'Omen'].includes(p2.agent)) ||
                          (['Iso', 'Jett', 'Reyna'].includes(p2.agent) && ['Sova', 'Skye', 'Fade', 'Clove', 'Omen'].includes(p1.agent));

  // Carry load differential
  const acsDiff = Math.abs(p1Acs - p2Acs);
  const primaryCarrier = p1Acs >= p2Acs ? p1.handle : p2.handle;
  const secondaryPlayer = p1Acs >= p2Acs ? p2.handle : p1.handle;
  const carrierAcs = Math.max(p1Acs, p2Acs);
  const secondaryAcs = Math.min(p1Acs, p2Acs);
  // Clasificación honesta de carga: asimetría extrema + brecha de K/D => candidato a boost
  const carryGapRatio = carrierAcs > 0 ? Math.round((carrierAcs / Math.max(1, secondaryAcs)) * 10) / 10 : 1;
  const boostCandidate = acsDiff >= 120 && carryGapRatio >= 2.0;
  const carryAnalysis = {
    primaryCarrier,
    secondaryPlayer,
    acsDifferential: Math.round(acsDiff * 10) / 10,
    carrierToSecondaryRatio: `${carryGapRatio}x`,
    boostCandidate,
    note: boostCandidate
      ? `El diferencial de impacto es extremo (${carryGapRatio}x). ${primaryCarrier} sostiene la partida; ${secondaryPlayer} debe priorizar utilidad y supervivencia, no duelos de entrada.`
      : 'Carga razonablemente distribuida. Mantener el orden de entrada definido por rol.'
  };

  let synergyRating = 75;
  let verdict = 'EQUILIBRADO';
  let tacticalAdvice = '';

  if (!sameTeam) {
    verdict = 'RIVALES DIRECTOS (Equipos opuestos)';
    tacticalAdvice = 'Los jugadores no están en el mismo equipo en este enfrentamiento.';
  } else if (dualDuelist) {
    synergyRating = Math.max(40, 70 - Math.round(acsDiff / 8));
    verdict = '🔴 FRICCIÓN DE ROL (Doble Duelista)';
    tacticalAdvice = 'Ambos jugadores compiten por los mismos recursos de apertura y orbes. Uno de los dos debe flexear a Iniciador o Controlador para maximizar el win rate.';
  } else if (supportiveSetup && acsDiff > 100) {
    synergyRating = 82;
    verdict = '🟡 ASIMÉTRICO FUNCIONAL (Motor + Soporte de Utilidad)';
    tacticalAdvice = `${primaryCarrier} asume el 65%+ de la carga de bajas, mientras ${secondaryPlayer} debe priorizar la supervivencia para mantener la utilidad activa (drones, flechas, humos).`;
  } else if (supportiveSetup) {
    synergyRating = 94;
    verdict = '🟢 SINERGIA DE ÉLITE (Dúo Complementario)';
    tacticalAdvice = 'Excelente balance de utilidad y entrada. Mantengan las distancias cortas para asegurar el 100% de re-frags en menos de 2 segundos.';
  } else {
    synergyRating = 70;
    verdict = '🟡 REGULAR';
    tacticalAdvice = 'Sinergia neutra. Aseguren coordinar sus compras económicas para nunca tener a uno forzado y al otro en eco.';
  }

  return {
    map: meta.mapName,
    matchId: meta.matchId,
    p1: { handle: p1.handle, agent: p1.agent, rank: p1.rank, acs: p1Acs, kd: p1Kd, hs: `${p1Hs}%` },
    p2: { handle: p2.handle, agent: p2.agent, rank: p2.rank, acs: p2Acs, kd: p2Kd, hs: `${p2Hs}%` },
    synergy: {
      score: `${synergyRating} / 100`,
      verdict,
      acsDifferential: `Δ ${acsDiff.toFixed(1)} ACS`,
      tacticalAdvice,
      carryAnalysis
    }
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error('Usage: node duo_synergy.js <match_id_or_json_file> <player1_handle> <player2_handle>');
    process.exit(1);
  }

  let matchData;
  if (fs.existsSync(args[0])) {
    matchData = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  } else {
    const matchId = extractMatchId(args[0]);
    matchData = fetchMatch(matchId);
  }

  const res = auditDuoSynergy(matchData, args[1], args[2]);

  console.log(`\n========================================================================`);
  console.log(`🤝 AUDITORÍA DE SINERGIA DE DÚO: ${res.p1.handle} + ${res.p2.handle}`);
  console.log(`Mapa: ${res.map} | Puntuación de Sinergia: ${res.synergy.score}`);
  console.log(`========================================================================`);

  console.log(`\n👤 [Jugador 1] ${res.p1.handle} (${res.p1.agent} - ${res.p1.rank})`);
  console.log(`   ACS: ${res.p1.acs} | K/D: ${res.p1.kd} | HS%: ${res.p1.hs}`);

  console.log(`\n👤 [Jugador 2] ${res.p2.handle} (${res.p2.agent} - ${res.p2.rank})`);
  console.log(`   ACS: ${res.p2.acs} | K/D: ${res.p2.kd} | HS%: ${res.p2.hs}`);

  console.log(`\n⚖️ EVALUACIÓN TÁCTICA DEL DÚO:`);
  console.log(`   • Veredicto:        ${res.synergy.verdict}`);
  console.log(`   • Brecha de Impacto: ${res.synergy.acsDifferential}`);
  console.log(`   • Consejo Táctico:   ${res.synergy.tacticalAdvice}`);
  console.log(`========================================================================\n`);
}

module.exports = { auditDuoSynergy };
