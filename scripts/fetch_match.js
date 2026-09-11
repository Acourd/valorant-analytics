#!/usr/bin/env node
'use strict';

/**
 * fetch_match.js - Utilidades LOCALES de match ID (SIN red).
 *
 * La descarga remota está RETIRADA: Tracker.gg no es una fuente estable,
 * autorizada ni consentida. Este módulo solo conserva parsing puro:
 *   - extractMatchId(source)
 *   - CANONICAL_MATCH_ID
 *   - parseMatchSummary(raw)
 *
 * Para obtener telemetría, aporta un JSON/export del usuario, el texto del
 * marcador o una captura con confirmación. La vía autorizada es Riot RSO
 * (pendiente de credenciales).
 */

function extractMatchId(input) {
  if (!input) return null;
  const match = input.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  return match ? match[1] : input.trim();
}

const CANONICAL_MATCH_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Stub fail-closed: la descarga remota fue retirada. No realiza ninguna
 * petición de red.
 */
function fetchMatch() {
  throw new Error('Descarga remota retirada: Tracker.gg no es una fuente estable, autorizada ni consentida. Aporta un JSON/export del usuario, texto del marcador o captura con confirmación; la vía autorizada es Riot RSO (pendiente de credenciales).');
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
  console.error('Este script ya no descarga partidas (Tracker retirado). Rutas admitidas: JSON/export del usuario, texto del marcador, captura con confirmación o Riot RSO.');
  process.exit(1);
}

module.exports = { extractMatchId, fetchMatch, parseMatchSummary, CANONICAL_MATCH_ID };
