#!/usr/bin/env node
/**
 * fetch_profile.js - Valorant Player Profile & Match History Extractor
 * v1.1: red nativa (https_fetch), normalización de Riot IDs (espacios/cyrillic/acentos),
 * errores instructivos para perfiles privados, timeout y backoff.
 * Usage: node fetch_profile.js <riot_handle> [season_id]
 */

const { httpsGetJson } = require('./http_fetch');

const PRIVATE_PROFILE_HINT = 'El perfil parece privado o restringido en Tracker.gg. Solución: abre https://tracker.gg > tu perfil > ajustes > "Privacidad de la cuenta" y establece los datos en PÚBLICO, o configura tu perfil en https://account.riotgames.com en modo público. Luego reintenta.';

function normalizeHandle(handle) {
  const h = String(handle || '').trim();
  if (!h) throw new Error('Riot ID vacío: proporciona un handle en formato "Nombre#TAG".');
  // "TenZ 001#NA1" → "TenZ%20001%23NA1" ; tolera espacios alrededor de '#'
  return encodeURIComponent(h);
}

function fetchProfile(handle, seasonId) {
  const encoded = normalizeHandle(handle);
  let url = `https://api.tracker.gg/api/v2/valorant/standard/profile/riot/${encoded}`;
  if (seasonId) url += `?season=${seasonId}`;
  const data = httpsGetJson(url, { maxRetries: 3, timeoutMs: 15000 });
  if (!data.data || (data.errors && data.errors.length > 0)) {
    throw new Error(`Perfil no recuperable para ${handle}. ${PRIVATE_PROFILE_HINT}`);
  }
  return data;
}

function fetchHistory(handle, type = 'competitive', seasonId) {
  const encoded = normalizeHandle(handle);
  let url = `https://api.tracker.gg/api/v2/valorant/standard/matches/riot/${encoded}?type=${type}`;
  if (seasonId) url += `&season=${seasonId}`;
  return httpsGetJson(url, { maxRetries: 3, timeoutMs: 15000 });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args[0]) {
    console.error('Usage: node fetch_profile.js <riot_handle> [season_id]');
    process.exit(1);
  }

  const handle = args[0];
  const seasonId = args[1];
  console.log(`[valorant-analytics] Fetching profile & history for ${handle}...`);

  try {
    const prof = fetchProfile(handle, seasonId);
    const pData = prof.data;
    console.log(`\n=== PROFILE: ${pData.platformInfo?.platformUserHandle} (Level ${pData.metadata?.accountLevel || 'N/A'}) ===`);
    const overviewSeg = pData.segments?.find(s => s.type === 'overview');
    if (overviewSeg) {
      const st = overviewSeg.stats || {};
      console.log(`Rank: ${st.rank?.displayValue || 'N/A'} | Peak: ${st.peakRank?.displayValue || 'N/A'}`);
      console.log(`K/D: ${st.kDRatio?.displayValue || 'N/A'} | Win Rate: ${st.matchesWinPct?.displayValue || 'N/A'} | HS%: ${st.headshotsPercentage?.displayValue || 'N/A'}`);
      console.log(`Damage Delta/Round: ${st.damageDeltaPerRound?.displayValue || 'N/A'} | ACS: ${st.scorePerRound?.displayValue || 'N/A'}`);
    }

    const hist = fetchHistory(handle, 'competitive', seasonId);
    const matches = hist.data?.matches || [];
    console.log(`\n=== RECENT COMPETITIVE MATCHES (${matches.length}) ===`);

    const table = matches.slice(0, 15).map((m, i) => {
      const seg = m.segments?.[0] || {};
      const st = seg.stats || {};
      return {
        '#': i + 1,
        Date: m.metadata?.timestamp?.slice(0, 10),
        Map: m.metadata?.mapName,
        Result: `${m.metadata?.result} (${st.roundsWon?.value || 0}-${st.roundsLost?.value || 0})`,
        Agent: seg.metadata?.agentName,
        KDA: `${st.kills?.value || 0}/${st.deaths?.value || 0}/${st.assists?.value || 0}`,
        KD: st.kdRatio?.displayValue || 'N/A',
        ACS: st.scorePerRound?.displayValue || 'N/A',
        ADR: st.damagePerRound?.displayValue || 'N/A',
        'HS%': `${Math.round(st.headshotsPercentage?.value || 0)}%`
      };
    });
    console.table(table);
  } catch (e) {
    console.error(`[valorant-analytics] Error:`, e.message);
    process.exit(1);
  }
}

module.exports = { encodeHandle: normalizeHandle, normalizeHandle, fetchProfile, fetchHistory, PRIVATE_PROFILE_HINT };