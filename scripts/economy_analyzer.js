#!/usr/bin/env node
/**
 * economy_analyzer.js - Valorant Player Loadout & Economy Tier Performance Analyzer
 * Extracts performance (K/D, Win%, ADR) across Pistol, Eco, Semi-Buy, and Full-Buy loadouts.
 * 
 * Usage: node economy_analyzer.js <match_id_or_json_file> [target_player_handle]
 */

const fs = require('fs');
const { extractMatchId, fetchMatch } = require('./fetch_match');

function analyzeEconomy(matchData, targetHandle) {
  const segments = matchData.data?.segments || [];
  const playerSummaries = segments.filter(s => s.type === 'player-summary');
  const loadoutSegments = segments.filter(s => s.type === 'player-loadout');

  const playerMap = {};
  playerSummaries.forEach(p => {
    const handle = p.metadata?.platformUserHandle || p.attributes?.platformUserIdentifier;
    playerMap[handle] = {
      handle,
      team: p.metadata?.teamId,
      agent: p.metadata?.agentName,
      rank: p.stats?.rank?.displayValue || p.metadata?.tierName || 'Unranked'
    };
  });

  let target = targetHandle ? Object.keys(playerMap).find(h => h.toLowerCase().includes(targetHandle.toLowerCase())) : Object.keys(playerMap)[0];
  if (!target) target = Object.keys(playerMap)[0];

  const userLoadouts = loadoutSegments.filter(l => (l.metadata?.platformUserHandle || l.attributes?.platformUserIdentifier) === target);

  const tiers = userLoadouts.map(l => {
    const st = l.stats || {};
    return {
      tier: l.metadata?.name || l.attributes?.loadout,
      rounds: st.roundsPlayed?.value || 0,
      won: st.roundsWon?.value || 0,
      lost: st.roundsLost?.value || 0,
      winPct: st.roundsWinPct?.displayValue || `${Math.round(((st.roundsWon?.value || 0) / Math.max(1, st.roundsPlayed?.value || 1)) * 100)}%`,
      kda: `${st.kills?.value || 0}/${st.deaths?.value || 0}/${st.assists?.value || 0}`,
      kd: st.kDRatio?.displayValue || '0.00',
      adr: st.damagePerRound?.displayValue || '0',
      acs: st.scorePerRound?.displayValue || '0',
      hsPct: st.headshotsPercentage?.displayValue || '0%'
    };
  });

  return {
    player: target,
    agent: playerMap[target]?.agent,
    rank: playerMap[target]?.rank,
    tiers
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args[0]) {
    console.error('Usage: node economy_analyzer.js <match_id_or_json_file> [target_player_handle]');
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
  const res = analyzeEconomy(matchData, handle);

  console.log(`\n=== LOADOUT & ECONOMY PERFORMANCE: ${res.player} (${res.agent} - ${res.rank}) ===`);
  console.table(res.tiers.map(t => ({
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
}

module.exports = { analyzeEconomy };
