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
  if (!matchData || typeof matchData !== 'object') {
    throw new Error('analyzeEconomy requiere un objeto de telemetría válido.');
  }
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
      rank: p.stats?.rank?.displayValue || p.metadata?.tierName || null
    };
  });

  const target = require('./data_contract').resolveExactHandle(Object.keys(playerMap), targetHandle);

  const userLoadouts = loadoutSegments.filter(l => (l.metadata?.platformUserHandle || l.attributes?.platformUserIdentifier) === target);

  let unclassifiedRounds = 0;
  let tiers = userLoadouts.map(l => {
    const st = l.stats || {};
    const rounds = st.roundsPlayed?.value !== undefined ? st.roundsPlayed.value : null;
    const won = st.roundsWon?.value !== undefined ? st.roundsWon.value : null;
    const lost = st.roundsLost?.value !== undefined ? st.roundsLost.value : null;
    const winPct = st.roundsWinPct?.displayValue !== undefined
      ? st.roundsWinPct.displayValue
      : (Number.isFinite(rounds) && rounds > 0 && Number.isFinite(won) ? `${Math.round((won / rounds) * 100)}%` : null);
    const num = (section, key) => (st[key]?.value !== undefined ? String(st[key].value) : null);
    return {
      tier: l.metadata?.name || l.attributes?.loadout || null,
      rounds,
      won,
      lost,
      winPct,
      kda: (st.kills?.value !== undefined && st.deaths?.value !== undefined && st.assists?.value !== undefined)
        ? `${st.kills.value}/${st.deaths.value}/${st.assists.value}`
        : null,
      kd: st.kDRatio?.displayValue !== undefined ? st.kDRatio.displayValue : null,
      adr: st.damagePerRound?.displayValue !== undefined ? st.damagePerRound.displayValue : num('damagePerRound', 'value'),
      acs: st.scorePerRound?.displayValue !== undefined ? st.scorePerRound.displayValue : num('scorePerRound', 'value'),
      hsPct: st.headshotsPercentage?.displayValue !== undefined ? st.headshotsPercentage.displayValue : null
    };
  });

  if (tiers.length === 0) {
    const playerRounds = segments.filter(s =>
      s.type === 'player-round' &&
      (s.metadata?.platformInfo?.platformUserHandle === target || s.attributes?.platformUserIdentifier === target)
    );

    if (playerRounds.length > 0) {
      const tierBins = {
        'Pistol': { rounds: 0, won: 0, kills: 0, deaths: 0, assists: 0, damage: 0, score: 0 },
        'Eco': { rounds: 0, won: 0, kills: 0, deaths: 0, assists: 0, damage: 0, score: 0 },
        'Semi-Buy': { rounds: 0, won: 0, kills: 0, deaths: 0, assists: 0, damage: 0, score: 0 },
        'Full-Buy': { rounds: 0, won: 0, kills: 0, deaths: 0, assists: 0, damage: 0, score: 0 }
      };

      playerRounds.forEach(r => {
        const valRaw = r.stats?.loadoutValue?.value;
        if (valRaw === undefined || valRaw === null || !Number.isFinite(Number(valRaw))) { unclassifiedRounds++; return; }
        const val = Number(valRaw);
        let tierKey = 'Full-Buy';
        if (val <= 1000) tierKey = 'Pistol';
        else if (val <= 2400) tierKey = 'Eco';
        else if (val <= 3800) tierKey = 'Semi-Buy';

        const won = Boolean(r.metadata?.hasWon);
        const k = r.stats?.kills?.value || 0;
        const d = r.stats?.deaths?.value || 0;
        const dmg = r.stats?.damage?.value || 0;
        const sc = r.stats?.score?.value || 0;

        tierBins[tierKey].rounds++;
        if (won) tierBins[tierKey].won++;
        tierBins[tierKey].kills += k;
        tierBins[tierKey].deaths += d;
        tierBins[tierKey].damage += dmg;
        tierBins[tierKey].score += sc;
      });

      tiers = Object.entries(tierBins)
        .filter(([_, b]) => b.rounds > 0)
        .map(([name, b]) => {
          const lost = b.rounds - b.won;
          const winPct = `${Math.round((b.won / b.rounds) * 100)}%`;
          const kd = (b.kills / Math.max(1, b.deaths)).toFixed(2);
          const adr = (b.damage / Math.max(1, b.rounds)).toFixed(1);
          const acs = Math.round(b.score / Math.max(1, b.rounds));
          return {
            tier: name,
            rounds: b.rounds,
            won: b.won,
            lost,
            winPct,
            kda: `${b.kills}/${b.deaths}/${b.assists}`,
            kd,
            adr: String(adr),
            acs: String(acs),
            hsPct: null
          };
        });
    }
  }

  return {
    player: target,
    agent: playerMap[target]?.agent || null,
    rank: playerMap[target]?.rank || null,
    tiers,
    unclassifiedRounds,
    provenance: 'normalized_input',
    note: unclassifiedRounds > 0
      ? `${unclassifiedRounds} ronda(s) sin loadoutValue observado: excluidas de los tiers (no se asigna tier a ciegas).`
      : 'Todas las rondas consideradas tienen loadoutValue observado.'
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
