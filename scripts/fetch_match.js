#!/usr/bin/env node
/**
 * fetch_match.js - Valorant Match Telemetry Extractor (With Exponential Backoff)
 * Fetches match details from Tracker.gg internal API with custom headers, retry logic, and Unicode support.
 * Usage: node fetch_match.js <match_id_or_url> [output_file.json]
 */

const fs = require('fs');
const { httpsGetJson } = require('./http_fetch');

function extractMatchId(input) {
  if (!input) return null;
  const match = input.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  return match ? match[1] : input.trim();
}

function fetchMatchWithRetry(matchId, maxRetries = 3) {
  const url = `https://api.tracker.gg/api/v2/valorant/standard/matches/${matchId}`;
  const data = httpsGetJson(url, { maxRetries, timeoutMs: 15000 });
  if (data.errors && data.errors.length > 0 && !data.data) {
    throw new Error(data.errors[0]?.message || 'API Error response');
  }
  return data;
}

function parseMatchSummary(data) {
  const meta = data.data?.metadata || {};
  const segments = data.data?.segments || [];
  
  const mapName = meta.mapName || 'Unknown';
  const modeName = meta.modeName || 'Competitive';
  const timestamp = meta.timestamp || '';
  
  const teamSummaries = segments.filter(s => s.type === 'team-summary');
  const playerSummaries = segments.filter(s => s.type === 'player-summary');
  
  const teams = {};
  teamSummaries.forEach(t => {
    teams[t.attributes?.teamId] = {
      won: t.metadata?.hasWon,
      score: `${t.stats?.roundsWon?.value || 0}-${t.stats?.roundsLost?.value || 0}`
    };
  });
  
  const players = playerSummaries.map(p => {
    const pMeta = p.metadata || {};
    const stats = p.stats || {};
    return {
      handle: pMeta.platformUserHandle || p.attributes?.platformUserIdentifier,
      team: pMeta.teamId,
      agent: pMeta.agentName,
      partyId: pMeta.partyId,
      rank: stats.rank?.displayValue || pMeta.tierName || 'Unranked',
      kills: stats.kills?.value || 0,
      deaths: stats.deaths?.value || 0,
      assists: stats.assists?.value || 0,
      kda: `${stats.kills?.value || 0}/${stats.deaths?.value || 0}/${stats.assists?.value || 0}`,
      kd: parseFloat(stats.kdRatio?.displayValue || (stats.kills?.value / Math.max(1, stats.deaths?.value || 1)).toFixed(2)),
      acs: parseFloat(stats.scorePerRound?.displayValue || (stats.score?.value / Math.max(1, meta.rounds || 1)).toFixed(1)),
      adr: parseFloat(stats.damagePerRound?.displayValue || (stats.damage?.value / Math.max(1, meta.rounds || 1)).toFixed(1)),
      hsPct: parseFloat(stats.hsAccuracy?.displayValue || stats.headshotsPercentage?.displayValue || '0%'),
      firstKills: stats.firstKills?.value || 0,
      firstDeaths: stats.firstDeaths?.value || 0,
      fk_fd: `${stats.firstKills?.value || 0}/${stats.firstDeaths?.value || 0}`,
      kast: stats.kast?.displayValue || 'N/A',
      combatScore: stats.score?.value || 0
    };
  });

  players.sort((a, b) => b.combatScore - a.combatScore);

  return {
    matchId: meta.matchId,
    map: mapName,
    mode: modeName,
    date: timestamp,
    teams,
    players
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args[0]) {
    console.error('Usage: node fetch_match.js <match_id_or_url> [output_file.json]');
    process.exit(1);
  }

  const matchId = extractMatchId(args[0]);
  console.log(`[valorant-analytics] Fetching telemetry for match: ${matchId}...`);
  
  try {
    const raw = fetchMatchWithRetry(matchId);
    if (args[1]) {
      fs.writeFileSync(args[1], JSON.stringify(raw, null, 2));
      console.log(`[valorant-analytics] Raw data saved to ${args[1]}`);
    }
    
    const summary = parseMatchSummary(raw);
    console.log(`\n=== MATCH SUMMARY: ${summary.map} (${summary.mode}) ===`);
    console.log(`Date: ${summary.date}`);
    console.log(`Teams: Red (${summary.teams.Red?.score || 'N/A'}) vs Blue (${summary.teams.Blue?.score || 'N/A'})`);
    console.table(summary.players.map(p => ({
      Handle: p.handle,
      Team: p.team,
      Agent: p.agent,
      Rank: p.rank,
      KDA: p.kda,
      KD: p.kd,
      ACS: p.acs,
      ADR: p.adr,
      'HS%': `${p.hsPct}%`,
      'FK/FD': p.fk_fd,
      KAST: p.kast
    })));
  } catch (e) {
    console.error(`[valorant-analytics] Error:`, e.message);
    process.exit(1);
  }
}

module.exports = { extractMatchId, fetchMatch: fetchMatchWithRetry, parseMatchSummary };
