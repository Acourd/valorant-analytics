#!/usr/bin/env node
/**
 * duel_matrix.js - Head-to-Head Duel Matrix & Opening Duels Analyzer
 * Computes 1v1 matchup results, victim breakdown, and entry success rate from raw match JSON.
 * Usage: node duel_matrix.js <match_id_or_json_file> [target_player_handle]
 */

const fs = require('fs');
const { extractMatchId, fetchMatch } = require('./fetch_match');

function parseDuels(matchData, targetHandle) {
  const segments = matchData.data?.segments || [];
  const playerSummaries = segments.filter(s => s.type === 'player-summary');
  const killSegments = segments.filter(s => s.type === 'player-round-kills');
  
  // Find player ranks map
  const playerMap = {};
  playerSummaries.forEach(p => {
    const handle = p.metadata?.platformUserHandle || p.attributes?.platformUserIdentifier;
    playerMap[handle] = {
      handle,
      agent: p.metadata?.agentName,
      team: p.metadata?.teamId,
      rank: p.stats?.rank?.displayValue || p.metadata?.tierName || 'Unranked',
      kills: p.stats?.kills?.value || 0,
      deaths: p.stats?.deaths?.value || 0,
      acs: p.stats?.scorePerRound?.displayValue || 0
    };
  });

  // If targetHandle is provided, filter or find closest match
  let target = null;
  if (targetHandle) {
    target = Object.keys(playerMap).find(h => h.toLowerCase().includes(targetHandle.toLowerCase()));
  }

  // Find round kills from player-round-kills segments
  const duelMatrix = {}; // { [killer]: { [victim]: count } }
  
  killSegments.forEach(k => {
    const killer = k.metadata?.platformUserHandle || k.attributes?.platformUserIdentifier;
    const victim = k.metadata?.opponentPlatformUserHandle || k.attributes?.opponentPlatformUserIdentifier;
    if (killer && victim) {
      if (!duelMatrix[killer]) duelMatrix[killer] = {};
      duelMatrix[killer][victim] = (duelMatrix[killer][victim] || 0) + 1;
    }
  });

  return { playerMap, duelMatrix, target };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args[0]) {
    console.error('Usage: node duel_matrix.js <match_id_or_json_file> [target_player_handle]');
    process.exit(1);
  }

  let matchData;
  if (fs.existsSync(args[0])) {
    matchData = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  } else {
    const matchId = extractMatchId(args[0]);
    matchData = fetchMatch(matchId);
  }

  const targetHandle = args[1];
  const { playerMap, duelMatrix, target } = parseDuels(matchData, targetHandle);

  console.log(`\n=== 1v1 DUEL MATRIX ANALYSIS ===`);
  
  if (target && playerMap[target]) {
    const p = playerMap[target];
    console.log(`\nFocus Player: ${p.handle} (${p.agent} - ${p.rank}) on Team ${p.team}`);
    const killsOnOpponents = duelMatrix[target] || {};
    
    // Opponents
    const opponents = Object.values(playerMap).filter(o => o.team !== p.team);
    const table = opponents.map(opp => {
      const kills = killsOnOpponents[opp.handle] || 0;
      const deaths = (duelMatrix[opp.handle] || {})[target] || 0;
      const diff = kills - deaths;
      return {
        'Opponent': opp.handle,
        'Agent': opp.agent,
        'Rank': opp.rank,
        'Kills (You)': kills,
        'Deaths (Them)': deaths,
        'Score': `${kills}-${deaths}`,
        'Verdict': diff > 0 ? `+${diff} (Won)` : diff < 0 ? `${diff} (Lost)` : 'Even'
      };
    });
    console.table(table);
  } else {
    console.log('Overall Match Players:');
    console.table(Object.values(playerMap));
  }
}

module.exports = { parseDuels };
