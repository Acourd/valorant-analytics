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

  const { resolveExactHandle } = require('./data_contract');
  const p1Key = resolveExactHandle(Object.keys(playerMap), handle1, { allowFirstIfMissing: false });
  const p2Key = resolveExactHandle(Object.keys(playerMap), handle2, { allowFirstIfMissing: false });

  if (!p1Key || !p2Key) {
    throw new Error(`Could not find both players in match data. Found: ${p1Key || 'None'} and ${p2Key || 'None'}`);
  }

  const p1 = playerMap[p1Key];
  const p2 = playerMap[p2Key];
  // Pertenencia a equipo OBSERVADA: sin teamId en ambos no se puede saber si
  // son compañeros (undefined === undefined NO es mismo equipo).
  const teamsObserved = typeof p1.team === 'string' && p1.team.trim() !== '' &&
    typeof p2.team === 'string' && p2.team.trim() !== '';
  const sameTeam = teamsObserved && p1.team === p2.team;

  const { observedNumber, sourceProvenance, provenanceLabel } = require('./data_contract');
  const provenance = sourceProvenance(meta);
  // Métricas OBSERVADAS: null cuando no existen (sin defaults plausibles).
  const p1Acs = observedNumber(p1.stats, ['scorePerRound']);
  const p2Acs = observedNumber(p2.stats, ['scorePerRound']);
  const p1Kd = observedNumber(p1.stats, ['kdRatio']);
  const p2Kd = observedNumber(p2.stats, ['kdRatio']);
  const p1Hs = observedNumber(p1.stats, ['hsAccuracy', 'headshotsPercentage']);
  const p2Hs = observedNumber(p2.stats, ['hsAccuracy', 'headshotsPercentage']);
  const observedAcs = p1Acs !== null && p2Acs !== null;
  const agentsObserved = Boolean(p1.agent && p2.agent);

  const playerView = (p, acs, kd, hs) => ({
    handle: p.handle,
    agent: p.agent || null,
    rank: p.rank === 'Unranked' ? null : p.rank,
    acs,
    kd,
    hs
  });

  // Role compatibility check (solo si los agentes están observados).
  const duelists = ['Reyna', 'Jett', 'Iso', 'Raze', 'Phoenix', 'Yoru', 'Neon'];
  const supports = ['Sova', 'Skye', 'Fade', 'Clove', 'Omen'];
  const dualDuelist = agentsObserved && duelists.includes(p1.agent) && duelists.includes(p2.agent);
  const supportiveSetup = agentsObserved && (
    (duelists.includes(p1.agent) && supports.includes(p2.agent)) ||
    (duelists.includes(p2.agent) && supports.includes(p1.agent))
  );

  const limitations = [
    'Datos locales normalizados (NO verificados): describen agregados del marcador, no causalidad ni mejora.',
    'Sin timestamps de ronda no se afirman tiempos de tradeo, refrags ni posicionamiento.'
  ];

  if (!observedAcs || !teamsObserved) {
    const missing = [];
    if (!observedAcs) missing.push('ACS (scorePerRound) observado para ambos jugadores');
    if (!teamsObserved) missing.push('teamId observado para ambos jugadores (no se asume mismo equipo)');
    return {
      map: meta.mapName || null,
      matchId: meta.matchId || null,
      provenance,
      provenanceLabel: provenanceLabel(provenance),
      p1: playerView(p1, p1Acs, p1Kd, p1Hs),
      p2: playerView(p2, p2Acs, p2Kd, p2Hs),
      synergy: {
        score: null,
        verdict: 'INSUFFICIENT_DATA',
        acsDifferential: null,
        tacticalAdvice: null,
        carryAnalysis: null,
        missing,
        limitations
      }
    };
  }

  const acsDiff = Math.abs(p1Acs - p2Acs);
  const primaryCarrier = p1Acs >= p2Acs ? p1.handle : p2.handle;
  const secondaryPlayer = p1Acs >= p2Acs ? p2.handle : p1.handle;
  const carrierAcs = Math.max(p1Acs, p2Acs);
  const secondaryAcs = Math.min(p1Acs, p2Acs);
  const carryGapRatio = secondaryAcs > 0 ? Math.round((carrierAcs / Math.max(1, secondaryAcs)) * 10) / 10 : null;
  const boostCandidate = acsDiff >= 120 && carryGapRatio !== null && carryGapRatio >= 2.0;
  const carryAnalysis = {
    primaryCarrier,
    secondaryPlayer,
    acsDifferential: Math.round(acsDiff * 10) / 10,
    carrierToSecondaryRatio: carryGapRatio === null ? 'n/d' : `${carryGapRatio}x`,
    boostCandidate,
    note: boostCandidate
      ? `Diferencial de ACS observado extremo (${carryGapRatio}x). Heurística descriptiva, no un veredicto de boosting.`
      : 'Carga de impacto distribuida según el ACS observado.'
  };

  // Rating heurístico SOLO con ACS observado; se declara su base y límite.
  const scoreBasis = 'Heurística sobre ΔACS y agentes observados (no validada con resultados de victoria).';
  let synergyRating = 70;
  let verdict = 'REGULAR';
  let tacticalAdvice = 'Sinergia neutra según los agregados observados.';

  if (!sameTeam) {
    verdict = 'RIVALES DIRECTOS (Equipos opuestos)';
    tacticalAdvice = 'Los jugadores no están en el mismo equipo en este enfrentamiento; no hay sinergia que evaluar.';
  } else if (dualDuelist) {
    synergyRating = Math.max(40, 70 - Math.round(acsDiff / 8));
    verdict = 'FRICCIÓN DE ROL (Doble Duelista)';
    tacticalAdvice = 'Ambos agentes observados son duelistas: según la composición, uno podría flexear a Iniciador o Controlador.';
  } else if (supportiveSetup && acsDiff > 100) {
    synergyRating = 82;
    verdict = 'ASIMÉTRICO FUNCIONAL (Motor + Soporte de Utilidad)';
    tacticalAdvice = `${primaryCarrier} concentra el impacto observado; ${secondaryPlayer} sostiene utilidad según los agentes registrados.`;
  } else if (supportiveSetup) {
    synergyRating = 94;
    verdict = 'COMPLEMENTARIO (Duelista + Soporte observados)';
    tacticalAdvice = 'Composición complementaria según agentes observados; mantened distancias de tradeo sin asumir tiempos no medidos.';
  } else {
    synergyRating = 70;
    verdict = 'REGULAR';
    tacticalAdvice = 'Sinergia neutra según los agregados observados; coordinad compras económicas para evitar desfases.';
  }

  return {
    map: meta.mapName || null,
    matchId: meta.matchId || null,
    provenance,
    provenanceLabel: provenanceLabel(provenance),
    p1: playerView(p1, p1Acs, p1Kd, p1Hs),
    p2: playerView(p2, p2Acs, p2Kd, p2Hs),
    synergy: {
      score: `${synergyRating} / 100`,
      scoreBasis,
      verdict,
      acsDifferential: `Δ ${acsDiff.toFixed(1)} ACS`,
      tacticalAdvice,
      carryAnalysis,
      missing: [],
      limitations
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
