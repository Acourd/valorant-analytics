#!/usr/bin/env node
'use strict';

/**
 * tracker_text_ingestor.js — Importador local de texto guardado de una página
 * de partida de Tracker.gg ("Guardar página como .txt").
 *
 * Principios:
 *  - DETECCIÓN EXPLÍCITA: exige marcadores de página Tracker + bloque
 *    `Scoreboard` + cluster de cabeceras de la tabla. Si parece Tracker pero el
 *    bloque está incompleto o cambió de formato => falla cerrado con
 *    `TRACKER_TEXT_FORMAT_UNSUPPORTED` (jamás cae en silencio al parser
 *    genérico).
 *  - Solo datos observados: lo ausente queda en `null` y se declara; nunca se
 *    inventan números, rondas, posiciones, economía, trades, duelos ni eventos.
 *  - Cero red, cero caché, cero cookies, cero scraping, cero OCR: el archivo lo
 *    aporta el usuario manualmente.
 *  - Procedencia `normalized_input` con digest local (SHA-256 del texto).
 *
 * Cero dependencias externas.
 */

const crypto = require('crypto');
const budgets = require('./resource_budget');

const TRACKER_FORMAT_CODE = 'TRACKER_TEXT_FORMAT_UNSUPPORTED';

const MODES = [
  'Competitive', 'Unrated', 'Swiftplay', 'Spike Rush', 'Deathmatch',
  'Team Deathmatch', 'Premier', 'Escalation', 'Replication'
];

// Cabeceras de la tabla Scoreboard de Tracker (orden real observado).
const COLUMN_ALIASES = [
  ['Match Rank', 'matchRank'],
  ['TRS', 'trackerScore'],
  ['ACS', 'acs'],
  ['K', 'kills'],
  ['D', 'deaths'],
  ['A', 'assists'],
  ['+/-', 'differential'],
  ['K/D', 'kdRatio'],
  ['DDΔ', 'damageDelta'],
  ['DD', 'damageDelta'],
  ['ADR', 'adr'],
  ['HS%', 'hsAccuracy'],
  ['KAST', 'kast'],
  ['FK', 'firstKills'],
  ['FD', 'firstDeaths'],
  ['MK', 'multikills']
];

const CORE_COLUMNS = ['ACS', 'K', 'D', 'A'];

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5 };

function sha256Text(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function catalog() {
  // Require perezoso: evita el ciclo universal_ingestor <-> tracker_text_ingestor.
  return require('./universal_ingestor');
}

function formatError(message, details) {
  const e = new Error(message);
  e.code = TRACKER_FORMAT_CODE;
  e.details = details || {};
  return e;
}

function labelFor(line) {
  const t = String(line || '').trim();
  const hit = COLUMN_ALIASES.find(([label]) => label === t);
  return hit ? hit[1] : null;
}

function labelTextFor(line) {
  const t = String(line || '').trim();
  const hit = COLUMN_ALIASES.find(([label]) => label === t);
  return hit ? hit[0] : null;
}

/**
 * Normaliza un rango tal y como lo pinta Tracker (romanos incluidos):
 * "Platinum II" => "Platinum 2"; "Gold 2" => "Gold 2"; "Radiant" => "Radiant".
 * Devuelve null si no es un rango reconocible.
 */
function normalizeRank(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  const { RANKS } = catalog();
  const m = t.match(/^(Iron|Bronze|Silver|Gold|Platinum|Diamond|Ascendant|Immortal)\s+(I{1,3}|\d)$/i);
  if (m) {
    const tier = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    const numeral = /^[IVX]+$/.test(m[2]) ? ROMAN[m[2].toUpperCase()] : Number(m[2]);
    const full = `${tier} ${numeral}`;
    return RANKS.includes(full) ? full : null;
  }
  if (/^Radiant$/i.test(t)) return 'Radiant';
  return null;
}

/** Detecta la línea de rango duplicada de Tracker ("Gold 2Gold 2"). */
function duplicatedRank(line) {
  const t = String(line || '').trim();
  for (let len = 2; len <= Math.floor(t.length / 2); len++) {
    const part = t.slice(0, len);
    if (part + part === t) {
      const rank = normalizeRank(part);
      if (rank) return rank;
    }
  }
  return null;
}

/** Clusters de cabeceras (una tanda por equipo), requieren columnas núcleo. */
function findHeaderClusters(lines) {
  const clusters = [];
  for (let i = 0; i < lines.length; i++) {
    if (!labelFor(lines[i])) continue;
    const columns = [];
    const seen = new Set();
    let j = i;
    while (j < lines.length) {
      const key = labelFor(lines[j]);
      if (key) {
        if (seen.has(key)) break;
        seen.add(key);
        columns.push({ label: labelTextFor(lines[j]), key });
        j++;
      } else if (lines[j] === '') {
        j++;
      } else {
        break;
      }
    }
    const core = CORE_COLUMNS.every(c => columns.some(col => col.label === c));
    if (columns.length >= 5 && core) {
      clusters.push({ start: i, end: j, columns });
      i = j - 1;
    }
  }
  return clusters;
}

/**
 * Detección explícita del formato. Determinista y sin efectos: el llamador
 * decide si usa el parser Tracker (isTracker) o el parser genérico.
 */
function detectTrackerTextExport(rawText) {
  const text = String(rawText || '').replace(/^\uFEFF/, '');
  budgets.checkTextLength(text);
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const signals = {
    trackerHost: /tracker\.gg/i.test(text),
    trackerNetwork: /Tracker Network/i.test(text),
    averageRank: /\bAverage Rank\b/i.test(text),
    copyShareLink: /Copy Share Link/i.test(text),
    scoreboardTab: lines.some(l => l === 'Scoreboard'),
    matchRankHeader: lines.some(l => l === 'Match Rank'),
    teamBlocks: /Team [AB]/.test(text)
  };
  const clusters = findHeaderClusters(lines);
  const signalCount = [signals.trackerHost, signals.trackerNetwork, signals.averageRank, signals.copyShareLink].filter(Boolean).length;
  const isTracker = (signalCount >= 2 && (signals.scoreboardTab || clusters.length > 0)) ||
    (signals.trackerHost && signals.scoreboardTab && signals.teamBlocks) ||
    (clusters.length > 0 && signals.teamBlocks && signals.matchRankHeader);
  return {
    isTracker,
    signals,
    lines,
    headerClusters: clusters.map(c => ({
      start: c.start,
      end: c.end,
      columns: c.columns.map(col => col.label)
    }))
  };
}

function looksLikeTrackerText(rawText) {
  return detectTrackerTextExport(rawText).isTracker;
}

const HANDLE_RE = /([^\s#<>%][^#<>\n]{0,60}?)#([A-Za-z0-9]{1,16})(?=\s|$)/u;

function matchHandle(line) {
  const t = String(line || '').trim();
  if (!t || /https?:|tracker\.gg|%23|>/.test(t)) return null;
  const m = HANDLE_RE.exec(t);
  if (!m) return null;
  const name = m[1].trim();
  if (!name || !/[^\d\s]/.test(name)) return null;
  if (normalizeRank(name)) return null;
  return { handle: `${name}#${m[2]}`, name };
}

function isUrlContinuation(line) {
  const t = String(line || '').trim();
  if (!t) return false;
  return /^<https?:/i.test(t) || /^https?:/i.test(t) || /tracker\.gg/i.test(t) ||
    /^%[0-9A-Fa-f]{2}/.test(t) || (t.endsWith('>') && /[a-z0-9%=&?\/-]/i.test(t));
}

function isStopLine(line) {
  const t = String(line || '').trim();
  if (!t) return false;
  return /^(Scoreboard|Performance|Economy|Rounds|Duels)$/.test(t) ||
    /^Team [AB](•Avg\. Rank:|$)/.test(t) ||
    /^Preview of our mobile app|^We've rebuilt our mobile app|^Get the Mobile App|^Get Info|^Valorant Tracker Mobile|^The best mobile stats|^2026 © Tracker Network|^Valorant Tracker isn't endorsed|^Disable Valorant Profile/.test(t) ||
    Boolean(labelFor(t));
}

function classifyToken(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  if (t === '-' || t === '–' || t === '—' || /^n\/?a$/i.test(t)) return { kind: 'null' };
  if (/^\d{1,3}(\.\d+)?%$/.test(t)) return { kind: 'percent', text: t, value: Number(t.replace('%', '')) };
  if (/^[+-]\d{1,4}$/.test(t)) return { kind: 'signed', text: t, value: Number(t) };
  if (/^\d{1,4}\.\d{1,2}$/.test(t)) return { kind: 'decimal', text: t, value: Number(t) };
  const rank = normalizeRank(t);
  if (rank) return { kind: 'rank', text: rank, value: rank };
  if (/^\d{1,4}$/.test(t)) return { kind: 'int', text: t, value: Number(t) };
  return null;
}

function tokenCompatible(key, tok) {
  if (!tok) return false;
  if (tok.kind === 'null') return true;
  switch (key) {
    case 'matchRank': return tok.kind === 'rank';
    case 'trackerScore': case 'acs': case 'kills': case 'deaths': case 'assists':
    case 'firstKills': case 'firstDeaths': case 'multikills': return tok.kind === 'int';
    case 'differential': case 'damageDelta': return tok.kind === 'signed' || tok.kind === 'int';
    case 'kdRatio': case 'adr': return tok.kind === 'decimal' || tok.kind === 'int';
    case 'hsAccuracy': case 'kast': return tok.kind === 'percent';
    default: return false;
  }
}

function detectAgentBefore(lines, index) {
  const { AGENTS } = catalog();
  for (let back = 1; back <= 3; back++) {
    const prev = String(lines[index - back] || '').trim();
    if (!prev) continue;
    if (/^\d{1,5}$/.test(prev)) continue; // nivel/posición intercalada
    const known = AGENTS.find(a => a.toLowerCase() === prev.toLowerCase());
    if (known) return known;
    if (back === 1 && /^[A-Za-z][A-Za-z0-9/'-]{2,}$/.test(prev) && !normalizeRank(prev)) return prev;
    return null;
  }
  return null;
}

/** ¿La línea `j` es el inicio de una fila nueva (agente/nivel/handle)? */
function nextRowAt(lines, j) {
  if (matchHandle(lines[j])) return true;
  if (j + 1 < lines.length && matchHandle(lines[j + 1])) return true;
  if (j + 1 < lines.length && /^\d{1,5}$/.test(String(lines[j + 1]).trim()) && j + 2 < lines.length && matchHandle(lines[j + 2])) return true;
  return false;
}

/** Recolecta los valores de una fila tras la línea del handle. */
function collectRowValues(lines, startIndex, columns) {
  const tokens = [];
  let j = startIndex;
  for (; j < lines.length; j++) {
    const line = lines[j];
    if (line === '') continue;
    if (nextRowAt(lines, j) || isStopLine(line)) break;
    if (isUrlContinuation(line)) continue;
    // La línea de rango duplicada ("Gold 2Gold 2") no aporta valores: sus
    // restos ("2") no deben desplazar las columnas.
    if (duplicatedRank(line)) continue;
    // Un rango con espacio ("Gold 3") es UN valor, no dos tokens.
    const wholeRank = normalizeRank(line);
    if (wholeRank) {
      tokens.push({ kind: 'rank', text: wholeRank, value: wholeRank });
      continue;
    }
    for (const raw of line.split(/\s+/)) {
      const tok = classifyToken(raw);
      if (tok) tokens.push(tok);
    }
  }
  const values = {};
  const missing = [];
  let cursor = 0;
  for (const col of columns) {
    const tok = tokens[cursor];
    if (tokenCompatible(col.key, tok)) {
      if (tok.kind === 'null') {
        values[col.key] = null;
        missing.push(col.label);
      } else {
        // Se conserva el TEXTO impreso por la página ("+34", "3.0", "38%");
        // solo los enteros puros se normalizan a número.
        values[col.key] = tok.kind === 'int' ? tok.value : tok.text;
      }
      cursor++;
    } else {
      values[col.key] = null;
      missing.push(col.label);
    }
  }
  return { values, missing, nextIndex: j };
}

function parsePlayer(lines, handleIndex, columns, teamId, missingAggregate) {
  const line = lines[handleIndex];
  const matched = matchHandle(line);
  if (!matched) return null;
  const agent = detectAgentBefore(lines, handleIndex);
  if (!agent) missingAggregate.add('agente');
  const rank = duplicatedRank(lines[handleIndex + 1]) || null;
  if (!rank) missingAggregate.add('rango');
  const { values, missing, nextIndex } = collectRowValues(lines, handleIndex + 1, columns);
  for (const m of missing) missingAggregate.add(m);
  return {
    player: {
      handle: matched.handle,
      agent,
      rank,
      teamId,
      matchRank: values.matchRank || null,
      trackerScore: values.trackerScore !== null && values.trackerScore !== undefined ? values.trackerScore : null,
      acs: values.acs ?? null,
      kills: values.kills ?? null,
      deaths: values.deaths ?? null,
      assists: values.assists ?? null,
      differential: typeof values.differential === 'string' ? values.differential : (values.differential !== null && values.differential !== undefined ? String(values.differential) : null),
      kdRatio: values.kdRatio !== null && values.kdRatio !== undefined ? String(values.kdRatio) : null,
      damageDelta: values.damageDelta !== null && values.damageDelta !== undefined ? values.damageDelta : null,
      adr: values.adr ?? null,
      hsAccuracy: values.hsAccuracy ?? null,
      kast: values.kast ?? null,
      firstKills: values.firstKills ?? null,
      firstDeaths: values.firstDeaths ?? null,
      multikills: values.multikills ?? null
    },
    nextIndex
  };
}

function teamBlocks(lines, clusters) {
  const markerRe = /^Team ([AB])•Avg\. Rank:(.*)$/;
  return clusters.map(cluster => {
    for (let i = cluster.start - 1; i >= Math.max(0, cluster.start - 40); i--) {
      const m = lines[i].match(markerRe);
      if (m) return { teamId: `Team ${m[1]}`, avgRankText: m[2].trim() };
      if (/^Team [AB]$/.test(lines[i])) return { teamId: `Team ${lines[i].slice(-1)}`, avgRankText: null };
    }
    return { teamId: null, avgRankText: null };
  });
}

function extractPlayers(lines, clusters, missingAggregate) {
  const blocks = teamBlocks(lines, clusters);
  const players = [];
  const timeBudget = new budgets.TimeBudget();
  for (let ci = 0; ci < clusters.length; ci++) {
    const cluster = clusters[ci];
    const teamId = blocks[ci].teamId;
    let i = cluster.end;
    while (i < lines.length) {
      timeBudget.sample(i, 'importación de texto Tracker');
      if (clusters.some(k => k !== cluster && k.start === i)) break;
      if (isStopLine(lines[i])) break;
      if (matchHandle(lines[i])) {
        const parsed = parsePlayer(lines, i, cluster.columns, teamId, missingAggregate);
        if (parsed) {
          players.push(parsed.player);
          i = parsed.nextIndex;
          continue;
        }
      }
      i++;
    }
  }
  return players;
}

function extractScore(lines, firstClusterStart) {
  const zone = lines.slice(0, firstClusterStart > 0 ? firstClusterStart : lines.length);
  const idxA = zone.findIndex(l => l === 'Team A');
  if (idxA === -1) return null;
  let scoreA = null;
  for (let i = idxA + 1; i < Math.min(zone.length, idxA + 6); i++) {
    if (/^\d{1,2}$/.test(zone[i])) { scoreA = Number(zone[i]); break; }
  }
  const idxB = zone.findIndex((l, i) => i > idxA && l === 'Team B');
  let scoreB = null;
  if (idxB !== -1) {
    for (let i = idxB + 1; i < Math.min(zone.length, idxB + 6); i++) {
      if (/^\d{1,2}$/.test(zone[i])) { scoreB = Number(zone[i]); break; }
    }
  }
  if (scoreA === null || scoreB === null) return null;
  return { teamA: scoreA, teamB: scoreB };
}

function extractRoundEndTypes(text) {
  const out = [];
  const re = /(?:[•·]\s{0,3}(Defuse|Elimination|Detonation|Time Expired)|(Defuse|Elimination|Detonation|Time Expired)\s{0,3}[•·])\s{0,3}(\d{1,2})/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ round: Number(m[3]), endType: m[1] || m[2] });
  }
  return out;
}

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

function isoFromParts(year, month, day, hh, mm, hasTime) {
  const pad = n => String(n).padStart(2, '0');
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = `${year}-${pad(month)}-${pad(day)}`;
  return hasTime ? `${date}T${pad(hh)}:${pad(mm)}:00` : date;
}

/**
 * Extrae la fecha SIN fabricar precisión: el texto original se conserva en
 * `dateText` y `timestamp` solo se genera cuando el formato es inequívoco
 * (ISO, mes textual, o numérico donde >12 desambigua día/mes). Un formato
 * numérico ambiguo (p. ej. `6/9/26`) deja `timestamp: null` y marca
 * `fecha_ambigua_por_locale`.
 */
function extractDate(text) {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?\b/);
  if (iso) {
    const ts = isoFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]), Number(iso[4] || 0), Number(iso[5] || 0), iso[4] !== undefined);
    if (ts) return { dateText: iso[0], timestamp: ts, ambiguous: false };
  }
  const monthDayYear = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/);
  const dayMonthYear = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/);
  const md = monthDayYear && MONTHS[String(monthDayYear[1]).toLowerCase()];
  const dm = dayMonthYear && MONTHS[String(dayMonthYear[2]).toLowerCase()];
  if (md) {
    const ts = isoFromParts(Number(monthDayYear[3]), MONTHS[String(monthDayYear[1]).toLowerCase()], Number(monthDayYear[2]), Number(monthDayYear[4] || 0), Number(monthDayYear[5] || 0), monthDayYear[4] !== undefined);
    if (ts) return { dateText: monthDayYear[0], timestamp: ts, ambiguous: false };
  } else if (dm) {
    const ts = isoFromParts(Number(dayMonthYear[3]), MONTHS[String(dayMonthYear[2]).toLowerCase()], Number(dayMonthYear[1]), Number(dayMonthYear[4] || 0), Number(dayMonthYear[5] || 0), dayMonthYear[4] !== undefined);
    if (ts) return { dateText: dayMonthYear[0], timestamp: ts, ambiguous: false };
  }
  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:,?\s+(\d{1,2}):(\d{2}))?/);
  if (!numeric) return { dateText: null, timestamp: null, ambiguous: false };
  const rawYear = Number(numeric[3]);
  const year = numeric[3].length <= 2 ? (rawYear < 70 ? 2000 + rawYear : 1900 + rawYear) : rawYear;
  const first = Number(numeric[1]);
  const second = Number(numeric[2]);
  const hasTime = numeric[4] !== undefined;
  const dateText = numeric[0];
  if (first > 31 || second > 31 || (first > 12 && second > 12)) {
    return { dateText, timestamp: null, ambiguous: false };
  }
  if (first > 12) return { dateText, timestamp: isoFromParts(year, second, first, Number(numeric[4] || 0), Number(numeric[5] || 0), hasTime), ambiguous: false };
  if (second > 12) return { dateText, timestamp: isoFromParts(year, first, second, Number(numeric[4] || 0), Number(numeric[5] || 0), hasTime), ambiguous: false };
  return { dateText, timestamp: null, ambiguous: true };
}

function extractDuration(text) {
  const m = text.match(/\b(\d{1,2})m\s*(\d{1,2})s\b/);
  if (!m) return { durationText: null, durationSeconds: null };
  const seconds = Number(m[1]) * 60 + Number(m[2]);
  return { durationText: m[0], durationSeconds: seconds };
}

function extractMeta(lines, text, clusters, players) {
  const { MAPS } = catalog();
  const firstClusterStart = clusters.length > 0 ? clusters[0].start : lines.length;
  const head = lines.slice(0, firstClusterStart);
  let modeName = null;
  for (const line of head) {
    const mode = MODES.find(m => m.toLowerCase() === line.toLowerCase());
    if (mode) { modeName = mode; break; }
  }
  let mapName = null;
  for (const line of head) {
    const map = MAPS.find(m => new RegExp(`^${m}$`, 'i').test(line));
    if (map) { mapName = map; break; }
  }
  if (!mapName) mapName = null;
  const score = extractScore(lines, firstClusterStart);
  const winner = score ? (score.teamA === score.teamB ? null : (score.teamA > score.teamB ? 'Team A' : 'Team B')) : null;
  const { dateText, timestamp, ambiguous } = extractDate(text);
  const { durationText, durationSeconds } = extractDuration(text);
  const avgIndex = head.findIndex(l => l === 'Average Rank');
  let averageRank = null;
  if (avgIndex > 0) averageRank = normalizeRank(head[avgIndex - 1]);
  if (!averageRank) {
    const doubled = head.find(l => duplicatedRank(l));
    if (doubled) averageRank = duplicatedRank(doubled);
  }
  const teams = teamBlocks(lines, clusters).map(b => ({ teamId: b.teamId, averageRank: normalizeRank(b.avgRankText) }));
  return {
    modeName, mapName, score, winner, dateText, timestamp,
    dateAmbiguity: ambiguous ? 'fecha_ambigua_por_locale' : null,
    durationText, durationSeconds, averageRank, teams,
    roundEndTypes: extractRoundEndTypes(text)
  };
}

const FIELD_LABELS = {
  trackerScore: 'TRS', matchRank: 'Match Rank', acs: 'ACS', kills: 'K', deaths: 'D',
  assists: 'A', differential: '+/-', kdRatio: 'K/D', damageDelta: 'DDΔ', adr: 'ADR',
  hsAccuracy: 'HS%', kast: 'KAST', firstKills: 'FK', firstDeaths: 'FD', multikills: 'MK'
};

function summaryCounts(players) {
  const fields = ['trackerScore', 'matchRank', 'acs', 'kills', 'deaths', 'assists', 'differential', 'kdRatio', 'damageDelta', 'adr', 'hsAccuracy', 'kast', 'firstKills', 'firstDeaths', 'multikills'];
  const fieldsPresent = [];
  const fieldsMissing = [];
  for (const f of fields) {
    const present = players.some(p => p[f] !== null && p[f] !== undefined);
    (present ? fieldsPresent : fieldsMissing).push(FIELD_LABELS[f]);
  }
  return { fieldsPresent, fieldsMissing };
}

function statCell(value, kind) {
  if (value === null || value === undefined) return null;
  return kind === 'display' ? { displayValue: String(value) } : { value: Number(value) };
}

function buildTrackerMatch(players, meta, extraction, options) {
  const digest = sha256Text(options.sourceText);
  const matchId = `observed-${digest.slice(0, 16)}`;
  const segments = [];

  if (meta.score) {
    const mkTeam = (teamId, won, lost) => ({
      type: 'team-summary',
      attributes: { teamId },
      metadata: { hasWon: meta.winner === teamId },
      stats: { roundsWon: { value: won }, roundsLost: { value: lost } }
    });
    segments.push(mkTeam('Team A', meta.score.teamA, meta.score.teamB));
    segments.push(mkTeam('Team B', meta.score.teamB, meta.score.teamA));
  }

  for (const p of players) {
    const stats = {};
    const put = (key, cell) => { if (cell !== null) stats[key] = cell; };
    const pctCell = v => {
      if (v === null || v === undefined) return null;
      const text = /%$/.test(String(v)) ? String(v) : `${v}%`;
      const num = Number(String(text).replace('%', ''));
      return Number.isFinite(num) ? { value: num, displayValue: text } : { displayValue: text };
    };
    put('kills', statCell(p.kills, 'value'));
    put('deaths', statCell(p.deaths, 'value'));
    put('assists', statCell(p.assists, 'value'));
    put('scorePerRound', statCell(p.acs, 'display'));
    put('damagePerRound', statCell(p.adr, 'display'));
    put('headshotsPercentage', pctCell(p.hsAccuracy));
    put('hsAccuracy', pctCell(p.hsAccuracy));
    put('kdRatio', statCell(p.kdRatio, 'display'));
    put('kast', pctCell(p.kast));
    put('firstKills', statCell(p.firstKills, 'value'));
    put('firstDeaths', statCell(p.firstDeaths, 'value'));
    put('multikills', statCell(p.multikills, 'value'));
    put('trackerScore', statCell(p.trackerScore, 'value'));
    put('matchRank', statCell(p.matchRank, 'display'));
    put('rank', statCell(p.rank, 'display'));
    put('damageDeltaPerRound', statCell(p.damageDelta, 'display'));
    put('differential', statCell(p.differential, 'display'));
    segments.push({
      type: 'player-summary',
      attributes: { platformUserIdentifier: p.handle },
      metadata: { platformUserHandle: p.handle, agentName: p.agent || null, teamId: p.teamId || null },
      stats
    });
  }

  const missing = [
    'rounds (eventos por ronda)',
    'eventos de ronda (player-round/damage/kills)',
    'economía por ronda',
    'posiciones y distancias',
    'trades y duelos 1v1 (killer/victim)',
    'timestamps por ronda'
  ];
  if (players.length < 10) missing.push(`roster completo (${players.length}/10 observados)`);
  if (!meta.mapName) missing.push('mapa');
  if (!meta.modeName) missing.push('modo');
  if (!meta.score) missing.push('resultado/marcador');
  if (!meta.timestamp) {
    missing.push(meta.dateAmbiguity ? 'fecha interpretable (fecha_ambigua_por_locale)' : 'fecha');
  }
  if (!meta.durationText) missing.push('duración');
  if (!meta.averageRank) missing.push('rango medio');
  if (extraction.fieldsMissing.length > 0) missing.push(`columnas no presentes en el scoreboard: ${extraction.fieldsMissing.join(', ')}`);

  const declaredLimits = [
    'No es fuente verificada: es texto de una página guardado manualmente por el usuario.',
    'No atribuye causas ni fugas.',
    'No mide MMR interno, talento, rango merecido ni demuestra mejora.'
  ];
  if (meta.dateAmbiguity) {
    declaredLimits.push('Fecha numérica ambigua por locale (fecha_ambigua_por_locale): se conserva el texto original y no se convierte a ISO.');
  }

  return {
    data: {
      metadata: {
        matchId,
        schemaVersion: 1,
        mapName: meta.mapName,
        modeName: meta.modeName,
        rounds: null,
        timestamp: meta.timestamp,
        dateText: meta.dateText,
        dateAmbiguity: meta.dateAmbiguity,
        durationText: meta.durationText,
        durationSeconds: meta.durationSeconds,
        score: meta.score,
        winner: meta.winner,
        result: meta.winner ? `Equipo ganador: ${meta.winner}` : null,
        averageRank: meta.averageRank,
        teams: meta.teams,
        roundEndTypes: meta.roundEndTypes,
        ingestionType: 'Observed scoreboard (normalized_input)',
        provenance: 'normalized_input',
        sourceFormat: 'tracker_text_export',
        sourceRef: `tracker-text:sha256:${digest.slice(0, 16)}`,
        sourceDigest: digest,
        derived: { synthesizedRounds: false },
        declaredLimits,
        extraction,
        missing
      },
      segments
    }
  };
}

/**
 * Parsea un texto que YA fue detectado como export de Tracker. Si la
 * estructura no es reconocible o está incompleta => TRACKER_TEXT_FORMAT_UNSUPPORTED
 * (sin análisis parcial).
 */
function parseTrackerTextExport(rawText, options = {}) {
  const text = String(rawText || '').replace(/^\uFEFF/, '');
  const detection = detectTrackerTextExport(text);
  if (!detection.isTracker) return null;

  const lines = detection.lines;
  const clusters = findHeaderClusters(lines);
  if (clusters.length === 0) {
    throw formatError(
      'Texto con marcadores de Tracker pero sin bloque Scoreboard reconocible (cabeceras ACS/K/D/A ausentes). Formato no soportado: no se cae al parser genérico.',
      { signals: detection.signals }
    );
  }
  const missingAggregate = new Set();
  const players = extractPlayers(lines, clusters, missingAggregate);
  if (players.length < 4) {
    throw formatError(
      `Bloque Scoreboard incompleto o formato cambiado (${players.length} filas de jugador reconocidas; se exigen al menos 4). Formato no soportado: sin análisis parcial.`,
      { players: players.length, headerClusters: detection.headerClusters.length }
    );
  }
  budgets.checkPlayers(players.length);

  const meta = extractMeta(lines, text, clusters, players);
  const { fieldsPresent, fieldsMissing } = summaryCounts(players);
  const teamsSeen = [...new Set(players.map(p => p.teamId).filter(Boolean))];
  const extraction = {
    playersExtracted: players.length,
    teamsDetected: teamsSeen,
    columnsDetected: clusters.length > 0 ? clusters[0].columns.map(c => c.label) : [],
    fieldsPresent,
    fieldsMissing,
    navigationIgnored: true
  };
  const match = buildTrackerMatch(players, meta, extraction, { sourceText: text });
  budgets.checkEvents(match.data.segments.length);
  return match;
}

module.exports = {
  TRACKER_FORMAT_CODE,
  MODES,
  COLUMN_ALIASES,
  detectTrackerTextExport,
  looksLikeTrackerText,
  parseTrackerTextExport,
  normalizeRank,
  duplicatedRank
};
