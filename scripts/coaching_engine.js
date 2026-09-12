#!/usr/bin/env node
/**
 * coaching_engine.js - Introspective Performance Diagnosis & Learning Resources
 *
 * Vincula errores OBSERVADOS en la telemetría (duelos por ronda y K/D del
 * marcador) con recursos educativos GENÉRICOS. Reglas:
 *   - Recomendación SOLO si hay métrica observada que cruce un umbral explícito.
 *   - Los recursos no recomendados NO se renderizan ni se presentan como
 *     diagnóstico.
 *   - Cada recomendación declara métrica, umbral, procedencia y limitación.
 *   - Sin datos observados: INSUFFICIENT_DATA, sin recomendaciones.
 *
 * Usage: node coaching_engine.js <match_id_or_json> [target_handle]
 */

const fs = require('fs');
const { extractMatchId, fetchMatch } = require('./fetch_match');
const { parseDuels } = require('./duel_matrix');

const CURATED_RESOURCES = {
  iso_site_entry: {
    title: 'Apertura de Sitios con Agentes de Entrada & Uso Angular de Utilidad',
    creators: ['Zonda FPS (Español)', 'Woohoojin (Inglés)', 'SkillCapped Valorant', 'ikahQT (Radiant Iso)'],
    keyConcepts: [
      'Uso diagonal de la utilidad de entrada para cortar crossfires en vez de avanzar en línea recta',
      'Combo de utilidad + double tap coordinado con el soporte',
      'Esperar la utilidad de soporte de iniciador antes de cruzar utilidades de anclaje'
    ],
    searchQuery: 'https://www.youtube.com/results?search_query=valorant+iso+site+entry+guide'
  },
  gunfight_hygiene: {
    title: 'Higiene de Duelo (Gunfight Hygiene) & Counter-Strafing',
    creators: ['Woohoojin (Gunfight Hygiene Guide)', 'Sero Valorant (Movement & Peeking)', 'Valorant Domingo (Español)'],
    keyConcepts: [
      'Dead-zoning y A-D counter-strafing para evitar quedar estático al disparar',
      'Pre-aiming a off-angles verticales',
      'Evitar el crouch-spray instantáneo en el primer contacto contra rifles'
    ],
    searchQuery: 'https://www.youtube.com/results?search_query=valorant+gunfight+hygiene+woohoojin'
  },
  disadvantage_pacing: {
    title: 'Gestión de Desventaja Numérica & Pacing de Retake',
    creators: ['Valorant Domingo (Español)', 'Sovereign Guides', 'Coach Mills'],
    keyConcepts: [
      'Freno de emergencia tras muertes tempranas: congelar el empuje y jugar rotación/fake',
      'Ceder el sitio en defensa para jugar el retake agrupado',
      'Aislar duelos 1v1 en vez de intentar un spray-transfer contra dos enemigos'
    ],
    searchQuery: 'https://www.youtube.com/results?search_query=valorant+how+to+play+numbers+disadvantage+guide'
  },
  fatigue_and_consistency: {
    title: 'Gestión de Fatiga y Consistencia Mecánica',
    creators: ['Voltaic Aim Community', 'Ronn Rhythms', 'Zonda FPS'],
    keyConcepts: [
      'Bloques de juego acotados con pausas de reseteo motor entre partidas',
      'Rutina breve de micro-ajustes antes de competir',
      'Evitar sesiones de promoción con privación de sueño'
    ],
    searchQuery: 'https://www.youtube.com/results?search_query=valorant+aim+consistency+voltaic'
  }
};

const RESOURCE_NOTE = 'Recurso educativo GENÉRICO: no es un diagnóstico ni deriva de métricas observadas.';

function findSummary(segments, handle) {
  return segments.find(s => s.type === 'player-summary' &&
    (s.metadata?.platformUserHandle === handle || s.attributes?.platformUserIdentifier === handle)) || null;
}

function generateCoachingReport(matchData, targetHandle) {
  if (!matchData || typeof matchData !== 'object') {
    throw new Error('generateCoachingReport requiere un objeto de telemetría válido.');
  }
  const { playerMap, duelMatrix, target } = parseDuels(matchData, targetHandle);
  const effectiveTarget = target || require('./data_contract').resolveExactHandle(Object.keys(playerMap), targetHandle);

  if (!effectiveTarget || !playerMap[effectiveTarget]) {
    return { error: `Player ${targetHandle || 'desconocido'} not found in match.` };
  }

  const segments = matchData.data?.segments || [];
  const killSegments = segments.filter(s => s.type === 'player-round-kills');
  const p = playerMap[effectiveTarget];
  const summary = findSummary(segments, effectiveTarget);
  const st = (summary && summary.stats) || {};
  const killsObserved = st.kills && st.kills.value !== undefined && st.kills.value !== null;
  const deathsObserved = st.deaths && st.deaths.value !== undefined && st.deaths.value !== null;
  const pKills = killsObserved ? Number(st.kills.value) : null;
  const pDeaths = deathsObserved ? Number(st.deaths.value) : null;
  const duelDataObserved = killSegments.length > 0;

  const basePlayer = {
    handle: p.handle,
    agent: p.agent || null,
    rank: p.rank === 'Unranked' ? null : p.rank,
    team: p.team || null
  };
  const provenance = 'normalized_input';
  const globalLimitations = [
    'Datos locales normalizados (NO verificados): describen duelos observados, no causas ni mejora garantizada.',
    'Sin timestamps de ronda no se afirman tiempos de tradeo ni refrags.'
  ];

  if (!duelDataObserved && !(killsObserved && deathsObserved)) {
    return {
      player: basePlayer,
      provenance,
      insufficient: true,
      hardOpponents: [],
      resources: {},
      recommendations: [],
      unrecommended: Object.keys(CURATED_RESOURCES),
      missing: ['eventos player-round-kills o K/D del marcador observados'],
      limitations: globalLimitations
    };
  }

  const hardOpponents = [];
  if (duelDataObserved) {
    const opponents = Object.values(playerMap).filter(o => o.team !== p.team);
    const killsOnOpponents = duelMatrix[effectiveTarget] || {};
    opponents.forEach(opp => {
      const kills = killsOnOpponents[opp.handle] || 0;
      const deaths = (duelMatrix[opp.handle] || {})[effectiveTarget] || 0;
      if (deaths > kills) {
        hardOpponents.push({ opp, kills, deaths, diff: deaths - kills });
      }
    });
  }

  const isEntryAgent = ['Iso', 'Jett', 'Raze', 'Neon', 'Yoru', 'Reyna', 'Phoenix'].includes(p.agent);
  const recommendations = [];
  if (duelDataObserved && hardOpponents.length > 0) {
    recommendations.push({
      module: 'gunfight_hygiene',
      metric: 'duelos por ronda (muertes > bajas)',
      threshold: 'deaths > kills vs el rival',
      evidence: hardOpponents.slice(0, 3).map(h => `${h.opp.handle}: ${h.kills}K/${h.deaths}D`),
      provenance,
      limitation: 'Solo refleja los duelos registrados en estos datos; sin timestamps no indica cuándo ni por qué.',
      rationale: 'Higiene de duelo sugerida por derrotas observadas en duelos directos, no por defecto.'
    });
  }
  if (killsObserved && deathsObserved && pDeaths > pKills && isEntryAgent) {
    recommendations.push({
      module: 'iso_site_entry',
      metric: 'K/D del marcador + agente de entrada observado',
      threshold: 'deaths > kills y agente de entrada',
      evidence: [`${pKills}K/${pDeaths}D`, `agente ${p.agent}`],
      provenance,
      limitation: 'No hay datos de utilidad ni de rondas para verificar aperturas concretas.',
      rationale: 'Aperturas de sitio sugeridas por balance negativo con agente de entrada.'
    });
  }
  if (killsObserved && deathsObserved && pDeaths > pKills) {
    recommendations.push({
      module: 'disadvantage_pacing',
      metric: 'K/D del marcador',
      threshold: 'deaths > kills',
      evidence: [`${pKills}K/${pDeaths}D`],
      provenance,
      limitation: 'No se dispone de economía ni de tiempos de ronda para atribuir causas.',
      rationale: 'Gestión de desventaja sugerida cuando el balance de bajas observado es negativo.'
    });
  }

  const resources = {};
  recommendations.forEach(r => {
    if (CURATED_RESOURCES[r.module]) resources[r.module] = CURATED_RESOURCES[r.module];
  });

  return {
    player: basePlayer,
    provenance,
    insufficient: false,
    hardOpponents,
    resources,
    recommendations,
    unrecommended: Object.keys(CURATED_RESOURCES).filter(k => !resources[k]),
    resourceNote: RESOURCE_NOTE,
    missing: [],
    limitations: globalLimitations
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args[0]) {
    console.log('Usage: node coaching_engine.js <match_id_or_json> [target_handle]');
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
  const report = generateCoachingReport(matchData, handle);
  if (report.error) {
    console.error(`Error: ${report.error}`);
    process.exit(1);
  }

  console.log(`\n=== INTROSPECTIVE COACHING & LEARNING REPORT ===`);
  console.log(`Player: ${report.player.handle} (${report.player.agent || 'n/d'} - ${report.player.rank || 'n/d'})`);
  if (report.insufficient) {
    console.log(`\nINSUFFICIENT_DATA: faltan ${report.missing.join(', ')}.`);
    console.log(`No se emiten recomendaciones. Limitaciones: ${report.limitations.join(' ')}`);
    process.exit(0);
  }
  console.log(`\n1. Duelos con Mayor Fricción en la Partida:`);
  if (report.hardOpponents.length === 0) console.log('  (sin duelos observados con balance negativo)');
  report.hardOpponents.forEach(h => {
    console.log(`  - vs ${h.opp.handle} (${h.opp.agent || 'n/d'} - ${h.opp.rank || 'n/d'}): ${h.kills} Kills / ${h.deaths} Deaths (-${h.diff})`);
  });
  console.log(`\n2. Recomendaciones (con métrica observada + umbral):`);
  report.recommendations.forEach(r => {
    console.log(`  • ${r.module}: ${r.rationale}`);
    console.log(`    Métrica: ${r.metric} | Umbral: ${r.threshold} | Procedencia: ${r.provenance}`);
    console.log(`    Evidencia: ${r.evidence.join('; ')}`);
    console.log(`    Limitación: ${r.limitation}`);
  });
  console.log(`\n3. Recursos educativos recomendados:`);
  Object.values(report.resources).forEach(r => {
    console.log(`\n▶ ${r.title}`);
    console.log(`  Creadores: ${r.creators.join(', ')}`);
    console.log(`  Conceptos clave:`);
    r.keyConcepts.forEach(c => console.log(`    * ${c}`));
    console.log(`  Búsqueda directa: ${r.searchQuery}`);
  });
  if (report.unrecommended.length > 0) console.log(`\n(No recomendados, no renderizados: ${report.unrecommended.join(', ')})`);
  console.log(`\nNota: ${report.resourceNote}`);
}

module.exports = { generateCoachingReport, CURATED_RESOURCES };
