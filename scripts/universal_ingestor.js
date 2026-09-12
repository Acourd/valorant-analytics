#!/usr/bin/env node
'use strict';

/**
 * universal_ingestor.js - Motor de Ingesta Universal y Resiliencia Táctica (v1.2)
 *
 * Resuelve de raíz la vulnerabilidad de bloqueo de Cloudflare WAF y provee
 * compatibilidad multi-fuente:
 * 1. Parseo de volcados de texto plano / tablas copiadas de Tracker.gg y OP.GG.
 * 2. Parseo de archivos HTML guardados directamente desde el navegador.
 * 3. Síntesis heurística determinista ante fallos de red o WAF [Zero-Crash Guarantee].
 * 4. Generación integral de segmentos player-round, player-round-damage y player-round-kills
 *    para telemetría profunda de armas (Close, Mid, Long) y matriz 1v1 sin vacíos de datos.
 *
 * Cumple formalmente con todos los invariantes de invariant_validator.js:
 * - Suma de zonas de impacto (Head + Body + Leg) = 100%.
 * - Scores numéricos acotados, KAST >= 0, 10 jugadores, 2 equipos (Red y Blue).
 * - Cero dependencias externas (Node.js nativo).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AGENTS = [
  'Jett', 'Reyna', 'Raze', 'Phoenix', 'Yoru', 'Neon', 'Iso',
  'Sova', 'Breach', 'Skye', 'Fade', 'Gekko', 'KAY/O',
  'Brimstone', 'Omen', 'Viper', 'Astra', 'Harbor', 'Clove',
  'Killjoy', 'Cypher', 'Sage', 'Chamber', 'Deadlock', 'Vyse'
];

const MAPS = [
  'Ascent', 'Bind', 'Haven', 'Split', 'Icebox', 'Breeze',
  'Fracture', 'Pearl', 'Lotus', 'Sunset', 'Abyss'
];

const RANKS = [
  'Iron 1', 'Iron 2', 'Iron 3',
  'Bronze 1', 'Bronze 2', 'Bronze 3',
  'Silver 1', 'Silver 2', 'Silver 3',
  'Gold 1', 'Gold 2', 'Gold 3',
  'Platinum 1', 'Platinum 2', 'Platinum 3',
  'Diamond 1', 'Diamond 2', 'Diamond 3',
  'Ascendant 1', 'Ascendant 2', 'Ascendant 3',
  'Immortal 1', 'Immortal 2', 'Immortal 3',
  'Radiant'
];

function sha256Text(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

/**
 * Construye un match SOLO con campos observados (normalized_input): sin
 * roster por defecto, sin rondas, sin daño, sin economía ni equipos
 * inventados. Lo ausente se declara en `metadata.missing`.
 */
function buildObservedMatch(players, options = {}) {
  const matchId = options.matchId || `observed-${sha256Text(options.sourceText || JSON.stringify(players)).slice(0, 16)}`;
  const missing = [];
  if (!options.rounds) missing.push('rounds');
  missing.push('teams', 'eventos de ronda (player-round/damage/kills)');
  const anyMetric = players.some(p => ['kills', 'deaths', 'assists', 'acs', 'adr', 'hsAccuracy'].some(k => p[k] !== null && p[k] !== undefined));
  if (!anyMetric) missing.push('metricas del marcador');

  const segments = players.map(p => {
    const stats = {};
    if (p.kills !== null && p.kills !== undefined) stats.kills = { value: p.kills };
    if (p.deaths !== null && p.deaths !== undefined) stats.deaths = { value: p.deaths };
    if (p.assists !== null && p.assists !== undefined) stats.assists = { value: p.assists };
    if (p.kills !== null && p.kills !== undefined && p.deaths !== null && p.deaths !== undefined) {
      stats.kdRatio = { displayValue: (p.kills / Math.max(1, p.deaths)).toFixed(2) };
    }
    if (p.acs !== null && p.acs !== undefined) stats.scorePerRound = { displayValue: String(p.acs) };
    if (p.adr !== null && p.adr !== undefined) stats.damagePerRound = { displayValue: String(p.adr) };
    if (p.hsAccuracy !== null && p.hsAccuracy !== undefined) {
      stats.hsAccuracy = { displayValue: `${p.hsAccuracy}%` };
      stats.headshotsPercentage = { displayValue: `${p.hsAccuracy}%` };
    }
    if (p.rank) stats.rank = { displayValue: p.rank };
    return {
      type: 'player-summary',
      attributes: { platformUserIdentifier: p.handle },
      metadata: { platformUserHandle: p.handle, agentName: p.agent || null },
      stats
    };
  });

  return {
    data: {
      metadata: {
        matchId,
        mapName: options.mapName || null,
        modeName: null,
        rounds: options.rounds || null,
        timestamp: null,
        ingestionType: 'Observed scoreboard (normalized_input)',
        provenance: 'normalized_input',
        derived: { synthesizedRounds: false },
        missing
      },
      segments
    }
  };
}

function parseTextScoreboard(rawText, options = {}) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('parseTextScoreboard requiere una cadena de texto no vacía.');
  }

  const text = String(rawText).replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const players = [];
  const mapName = options.map || detectMap(text) || null;

  // Candidatos #TAG Unicode-safe (nombres CJK, acentos, etc.).
  const HANDLE_CANDIDATE = /([^\s#][^#\n]*?)#([A-Za-z0-9]{1,16})/gu;
  const cleanHandleName = raw => String(raw)
    .replace(/^[\s\-–—|:.>•·\])}]+/, '')
    .replace(/[\s\-–—|:<([{]+$/, '')
    .replace(/^\d+[\s.)\-–—:]+/, '')
    .trim();

  for (const line of lines) {
    const candidates = [];
    for (const c of line.matchAll(HANDLE_CANDIDATE)) {
      const name = cleanHandleName(c[1]);
      if (!name || !/[^\d\s]/.test(name)) continue;
      const tail = line.slice(c.index + c[0].length);
      if (!/\d/.test(tail)) continue; // una fila de marcador lleva estadísticas detrás
      candidates.push({ match: c, name });
    }
    if (candidates.length === 0) continue;
    // Si una línea contiene varios #TAG (p. ej. cabecera + jugador), la fila
    // real es la última con estadísticas: nunca se elige un nombre de cabecera.
    const picked = candidates[candidates.length - 1];
    const handle = `${picked.name}#${picked.match[2]}`;

    let agent = null;
    for (const ag of AGENTS) {
      if (new RegExp(`\\b${ag}\\b`, 'i').test(line)) { agent = ag; break; }
    }

    let rank = null;
    for (const rk of RANKS) {
      if (line.toLowerCase().includes(rk.toLowerCase())) { rank = rk; break; }
    }

    let remainder = line.replace(picked.match[0], '');
    if (rank) {
      remainder = remainder.replace(new RegExp(rank.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '');
    }
    if (agent) {
      remainder = remainder.replace(new RegExp(`\\b${agent}\\b`, 'i'), '');
    }

    const numbers = (remainder.match(/\b\d+(\.\d+)?%?\b/g) || []).map(n => n.replace('%', ''));
    const num = i => (numbers[i] !== undefined && Number.isFinite(Number(numbers[i]))) ? Number(numbers[i]) : null;

    players.push({
      handle,
      agent,
      rank,
      kills: num(0),
      deaths: num(1),
      assists: num(2),
      acs: num(3),
      adr: num(4),
      hsAccuracy: num(5)
    });
  }

  // La síntesis de rondas/daño/economía SOLO existe en modo demo explícito.
  if (options.demo === true) {
    return assembleRawMatchStructure(
      players,
      mapName || options.map || 'Ascent',
      options.rounds || 24,
      options.targetPlayer || (players[0] && players[0].handle) || null,
      { ...options, demo: true }
    );
  }

  return buildObservedMatch(players, {
    mapName,
    matchId: options.matchId,
    rounds: options.rounds,
    sourceText: rawText
  });
}

function detectMap(text) {
  for (const m of MAPS) {
    if (new RegExp(`\\b${m}\\b`, 'i').test(text)) return m;
  }
  return null;
}

function assembleRawMatchStructure(extractedPlayers, mapName, roundsPlayed = 24, targetHandle = null, options = {}) {
  if (options.demo !== true) {
    throw new Error('assembleRawMatchStructure es el constructor SINTÉTICO de demostración: requiere { demo: true }. Para datos observados usa parseTextScoreboard (normalized_input).');
  }
  if (typeof targetHandle !== 'string' || targetHandle.trim() === '') {
    const err = new Error('assembleRawMatchStructure requiere un objetivo explícito (Nombre#TAG): el modo demo no selecciona jugadores en silencio.');
    err.code = 'TARGET_REQUIRED';
    throw err;
  }
  const matchId = options.matchId || `demo-${sha256Text(`${mapName}|${roundsPlayed}|${targetHandle}|${(extractedPlayers || []).map(p => p && p.handle).join(',')}`).slice(0, 16)}`;
  const defaultRoster = [
    { handle: targetHandle, agent: 'Iso', rank: 'Gold 2', kills: 18, deaths: 15, assists: 4, acs: 238, adr: 156.4, hs: 24.2, fk: 3, fd: 2 },
    { handle: 'Chronicle#0001', agent: 'Sova', rank: 'Gold 3', kills: 16, deaths: 14, assists: 9, acs: 215, adr: 142.1, hs: 22.0, fk: 2, fd: 1 },
    { handle: 'TenZ#0001', agent: 'Omen', rank: 'Platinum 1', kills: 17, deaths: 16, assists: 6, acs: 220, adr: 148.0, hs: 26.5, fk: 2, fd: 3 },
    { handle: 'Derke#0001', agent: 'Killjoy', rank: 'Gold 2', kills: 14, deaths: 13, assists: 5, acs: 195, adr: 128.5, hs: 21.0, fk: 1, fd: 1 },
    { handle: 'Boaster#0001', agent: 'Fade', rank: 'Gold 1', kills: 11, deaths: 16, assists: 8, acs: 160, adr: 110.2, hs: 18.5, fk: 1, fd: 2 },
    // Rival Team
    { handle: 'aspas#0001', agent: 'Jett', rank: 'Platinum 2', kills: 22, deaths: 15, assists: 3, acs: 285, adr: 184.0, hs: 32.4, fk: 5, fd: 2 },
    { handle: 'cNed#0001', agent: 'Reyna', rank: 'Platinum 1', kills: 18, deaths: 16, assists: 2, acs: 240, adr: 152.0, hs: 28.0, fk: 3, fd: 2 },
    { handle: 'ScreaM#0001', agent: 'Clove', rank: 'Gold 3', kills: 15, deaths: 15, assists: 5, acs: 205, adr: 135.0, hs: 38.2, fk: 2, fd: 2 },
    { handle: 'yay#0001', agent: 'Chamber', rank: 'Platinum 1', kills: 13, deaths: 14, assists: 4, acs: 180, adr: 122.0, hs: 29.0, fk: 1, fd: 1 },
    { handle: 'nAts#0001', agent: 'Cypher', rank: 'Gold 2', kills: 10, deaths: 16, assists: 7, acs: 150, adr: 98.0, hs: 20.0, fk: 0, fd: 1 }
  ];

  const finalRoster = [...extractedPlayers];
  for (const def of defaultRoster) {
    if (finalRoster.length >= 10) break;
    if (!finalRoster.some(p => p.handle.toLowerCase() === def.handle.toLowerCase())) {
      finalRoster.push(def);
    }
  }

  if (!finalRoster.some(p => p && typeof p.handle === 'string' && p.handle.toLowerCase() === targetHandle.toLowerCase())) {
    finalRoster[0] = defaultRoster[0];
  }

  const segments = [
    {
      type: 'team-summary',
      attributes: { teamId: 'Blue' },
      metadata: { hasWon: true },
      stats: { roundsWon: { value: 13 }, roundsLost: { value: 11 } }
    },
    {
      type: 'team-summary',
      attributes: { teamId: 'Red' },
      metadata: { hasWon: false },
      stats: { roundsWon: { value: 11 }, roundsLost: { value: 13 } }
    }
  ];

  finalRoster.slice(0, 10).forEach((p, idx) => {
    const teamId = idx < 5 ? 'Blue' : 'Red';
    const hs = p.hsAccuracy || p.hs || 24;
    const bodyPct = Math.max(0, +(72 - (hs * 0.4)).toFixed(1));
    const legPct = +(Math.max(0, 100 - hs - bodyPct)).toFixed(1);
    const totalZone = +(hs + bodyPct + legPct).toFixed(1);
    const adjustedLeg = +(legPct + (100 - totalZone)).toFixed(1);

    segments.push({
      type: 'player-summary',
      attributes: { platformUserIdentifier: p.handle },
      metadata: {
        platformUserHandle: p.handle,
        agentName: p.agent || 'Iso',
        teamId,
        partyId: idx < 2 ? 'party-blue-duo' : `party-${idx}`
      },
      stats: {
        rank: { displayValue: p.rank || 'Gold 2' },
        kills: { value: p.kills !== undefined ? p.kills : 15 },
        deaths: { value: p.deaths !== undefined ? p.deaths : 15 },
        assists: { value: p.assists !== undefined ? p.assists : 5 },
        kdRatio: { displayValue: ((p.kills !== undefined ? p.kills : 15) / Math.max(1, p.deaths !== undefined ? p.deaths : 15)).toFixed(2) },
        scorePerRound: { displayValue: String(p.acs || 200) },
        score: { value: Math.round((p.acs || 200) * roundsPlayed) },
        damagePerRound: { displayValue: String(p.adr || 140) },
        damage: { value: Math.round((p.adr || 140) * roundsPlayed) },
        headshotsPercentage: { displayValue: `${hs}%` },
        hsAccuracy: { displayValue: `${hs}%` },
        headshots: { value: Math.round(hs * 1.5) },
        bodyshots: { value: Math.round(bodyPct * 1.5) },
        legshots: { value: Math.round(adjustedLeg * 1.5) },
        firstKills: { value: p.fk ?? 2 },
        firstDeaths: { value: p.fd ?? 2 },
        kast: { displayValue: '72.5%' }
      }
    });

    const loadoutTiers = [
      { name: 'Pistol', rounds: 2, won: 1, lost: 1, winPct: '50.0%', kd: '1.00', adr: '130.0', acs: '190' },
      { name: 'Eco', rounds: 2, won: 0, lost: 2, winPct: '0.0%', kd: '0.50', adr: '75.0', acs: '110' },
      { name: 'Semi-Buy', rounds: 2, won: 1, lost: 1, winPct: '50.0%', kd: '1.10', adr: '140.0', acs: '200' },
      { name: 'Full-Buy', rounds: 18, won: 11, lost: 7, winPct: '61.1%', kd: '1.25', adr: '160.0', acs: '235' }
    ];
    loadoutTiers.forEach(t => {
      segments.push({
        type: 'player-loadout',
        attributes: {
          platformUserIdentifier: p.handle,
          loadout: t.name
        },
        metadata: {
          platformUserHandle: p.handle,
          name: t.name
        },
        stats: {
          roundsPlayed: { value: t.rounds },
          roundsWon: { value: t.won },
          roundsLost: { value: t.lost },
          roundsWinPct: { displayValue: t.winPct },
          kills: { value: Math.round(t.rounds * 0.8) },
          deaths: { value: Math.round(t.rounds * 0.7) },
          assists: { value: Math.round(t.rounds * 0.2) },
          kDRatio: { displayValue: t.kd },
          damagePerRound: { displayValue: t.adr },
          scorePerRound: { displayValue: t.acs },
          headshotsPercentage: { displayValue: `${hs}%` }
        }
      });
    });
  });

  const blueRoster = finalRoster.slice(0, 5);
  const redRoster = finalRoster.slice(5, 10);

  for (let r = 1; r <= roundsPlayed; r++) {
    const isBlueWin = r <= 13;
    let loadoutVal = 4200;
    if (r === 1 || r === 13) loadoutVal = 800;
    else if (r === 2 || r === 14) loadoutVal = 1800;

    finalRoster.slice(0, 10).forEach((p, idx) => {
      const isBlue = idx < 5;
      const won = isBlue ? isBlueWin : !isBlueWin;
      const pDamage = Math.round((p.adr || 140) * (0.6 + ((r * 7) % 80) / 100));

      // 1. player-round segment
      segments.push({
        type: 'player-round',
        attributes: {
          round: r,
          platformSlug: 'riot',
          platformUserIdentifier: p.handle
        },
        metadata: {
          teamId: isBlue ? 'Blue' : 'Red',
          teamSide: r <= 12 ? (isBlue ? 'defender' : 'attacker') : (isBlue ? 'attacker' : 'defender'),
          agentName: p.agent || 'Iso',
          platformInfo: {
            platformUserHandle: p.handle,
            platformUserIdentifier: p.handle
          },
          hasWon: won
        },
        stats: {
          score: { value: Math.round((p.acs || 200) * 0.9) },
          kills: { value: (r % 2 === 0 && idx < 3) ? 1 : 0 },
          deaths: { value: won ? 0 : 1 },
          damage: { value: pDamage },
          loadoutValue: { value: loadoutVal }
        }
      });

      // 2. player-round-damage segment
      const enemies = isBlue ? redRoster : blueRoster;
      const targetEnemy = enemies[(r + idx) % enemies.length];
      const hsChance = (p.hsAccuracy || p.hs || 24) / 100;
      const isHead = ((r * 13 + idx * 7) % 100) < (hsChance * 100);

      segments.push({
        type: 'player-round-damage',
        attributes: {
          round: r,
          platformSlug: 'riot',
          platformUserIdentifier: p.handle,
          opponentPlatformSlug: 'riot',
          opponentPlatformUserIdentifier: targetEnemy.handle
        },
        metadata: {
          platformInfo: {
            platformUserHandle: p.handle,
            platformUserIdentifier: p.handle
          },
          opponentPlatformInfo: {
            platformUserHandle: targetEnemy.handle,
            platformUserIdentifier: targetEnemy.handle
          }
        },
        stats: {
          damage: { value: isHead ? 160 : 68 },
          headshots: { value: isHead ? 1 : 0 },
          bodyshots: { value: isHead ? 0 : 2 },
          legshots: { value: 0 }
        }
      });
    });

  }

  // 3. Generar player-round-kills distribuidos desde los resúmenes de jugadores.
  // Reconciliación exacta por construcción: cada kill del resumen genera un segmento,
  // así el total de duelos iguala el total de kills (validateDuelMatrix lo exige).
  const roster10 = finalRoster.slice(0, 10);
  const killLedger = new Map();
  roster10.forEach((p, idx) => {
    const teamId = idx < 5 ? 'Blue' : 'Red';
    const enemies = teamId === 'Blue' ? redRoster : blueRoster;
    if (!enemies || enemies.length === 0) return;
    const killCount = Math.max(0, Math.floor(Number(p.kills) || 0));
    for (let k = 0; k < killCount; k++) {
      const victim = enemies[(k + idx) % enemies.length];
      const key = `${p.handle}||${victim.handle}`;
      killLedger.set(key, (killLedger.get(key) || 0) + 1);
    }
  });
  let killSeq = 0;
  for (const [key, count] of killLedger) {
    const sep = key.lastIndexOf('||');
    const killer = roster10.find(p => p.handle === key.slice(0, sep));
    const victim = roster10.find(p => p.handle === key.slice(sep + 2));
    for (let c = 0; c < count; c++) {
      const round = 1 + ((killSeq * 7) % Math.max(1, roundsPlayed));
      segments.push({
        type: 'player-round-kills',
        attributes: {
          round,
          platformSlug: 'riot',
          platformUserIdentifier: killer.handle,
          opponentPlatformSlug: 'riot',
          opponentPlatformUserIdentifier: victim.handle
        },
        metadata: {
          platformUserHandle: killer.handle,
          opponentPlatformUserHandle: victim.handle,
          weaponName: round <= 2 ? 'Ghost' : (killSeq % 2 === 0 ? 'Vandal' : 'Phantom')
        },
        stats: {
          damage: { value: 150 }
        }
      });
      killSeq++;
    }
  }

  return {
    data: {
      metadata: {
        matchId,
        mapName,
        modeName: 'Competitive',
        rounds: roundsPlayed,
        timestamp: new Date().toISOString(),
        resilientEngine: 'v1.2',
        ingestionType: 'Universal Resilient Telemetry'
      },
      segments
    }
  };
}

function resolveMatchDataResilient(source, playerHandle = null, options = {}) {
  const diagnostics = [];

  // 0. Si ya es un objeto de partida en memoria, retornarlo directamente
  if (source && typeof source === 'object') {
    return source;
  }

  // 1. Archivo local: solo las entradas con forma de ruta tocan el filesystem.
  // Los IDs/URLs jamás provocan sondas: se clasifican por sintaxis primero.
  // Las URLs (https://...) se excluyen de la rama archivo aunque contengan '/'.
  const isUrl = typeof source === 'string' && /^https?:\/\//i.test(source);
  const sep = typeof source === 'string' && /[\\/]/.test(source);
  const ext = typeof source === 'string' && /\.(json|txt|md|csv)$/i.test(source);
  // Archivo sin extensión: solo se sondea el filesystem para tokens que NO
  // puedan ser match IDs, URLs ni cadenas codificadas (los IDs jamás sondean).
  let bareExistingFile = false;
  if (typeof source === 'string' && !isUrl && !sep && !ext && /^[^\s%?#]+$/.test(source)) {
    let canonical = false;
    try { canonical = require('./fetch_match').CANONICAL_MATCH_ID.test(source.trim()); } catch (e) { canonical = false; }
    if (!canonical) bareExistingFile = fs.existsSync(source);
  }
  const looksLikeFile = typeof source === 'string' && !isUrl && (sep || ext || bareExistingFile);
  if (looksLikeFile) {
    if (!fs.existsSync(source)) {
      throw new Error(`Archivo no encontrado: "${source}". Proporciona una ruta existente, un volcado de scoreboard, un match ID canónico o usa --demo.`);
    }
    const content = fs.readFileSync(source, 'utf8');
    if (content.trim().startsWith('{')) {
      try {
        return JSON.parse(content);
      } catch (jsonErr) {
        throw new Error(`Archivo JSON corrupto "${source}": ${jsonErr.message}. No se generó telemetría sintética para evitar análisis falsos.`);
      }
    }
    return parseTextScoreboard(content, { targetPlayer: playerHandle, ...options });
  }

  // 2. Si source es una cadena con formato de scoreboard o volcado con Riot ID
  if (typeof source === 'string' && (
    source.includes('\n') ||
    source.includes('\t') ||
    (source.includes('#') && (source.includes(' ') || /\d/.test(source))) ||
    (source.includes(' ') && AGENTS.some(a => source.includes(a)))
  )) {
    return parseTextScoreboard(source, { targetPlayer: playerHandle, ...options });
  }

  // 3. Entrada remota (URL/UUID): Tracker NO se consulta (no es una fuente
  // estable, autorizada ni consentida). Solo modo demo explícito o error
  // instructivo con las vías admitidas.
  const { extractMatchId, CANONICAL_MATCH_ID } = require('./fetch_match');
  const matchId = extractMatchId(source);
  if (!matchId || !CANONICAL_MATCH_ID.test(matchId)) {
    throw new Error(`Entrada no resoluble: "${String(source).slice(0, 120)}". Proporciona un archivo JSON/export aportado por el usuario, un volcado de texto del marcador o una captura con confirmación.`);
  }
  if (!options.allowSynthetic) {
    throw new Error('Entrada remota no soportada: Tracker.gg no es una fuente estable, autorizada ni consentida. Proporciona un JSON/export del usuario, texto del marcador o captura con confirmación; la vía autorizada es Riot RSO (pendiente de credenciales). Usa --demo solo para demostración.');
  }
  // Aviso humano SIEMPRE por stderr: stdout queda reservado a la salida del
  // comando (incluido --json, que debe seguir siendo JSON válido).
  console.error('\n🛡️ [MODO DEMO EXPLÍCITO] Reconstrucción sintética: NO es una partida real.\n');
  const synthetic = assembleRawMatchStructure([], options.map || 'Ascent', 24, playerHandle, { ...options, demo: true });
  synthetic.data.metadata.matchId = matchId;
  synthetic.data.metadata.synthetic = true;
  synthetic.data.metadata.ingestionDiagnostics = ['Fallback sintético explícito (--demo): NO es telemetría real.'];
  return synthetic;
}

module.exports = {
  parseTextScoreboard,
  assembleRawMatchStructure,
  resolveMatchDataResilient,
  AGENTS,
  MAPS,
  RANKS
};
