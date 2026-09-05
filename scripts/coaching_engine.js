#!/usr/bin/env node
/**
 * coaching_engine.js - Introspective Performance Diagnosis & Visual Learning Engine
 * Analyzes match telemetry errors and pairs them with specific tactical adjustments,
 * training drills, and curated YouTube learning resources.
 * 
 * Usage: node coaching_engine.js <match_id_or_json> [target_handle]
 */

const fs = require('fs');
const { extractMatchId, fetchMatch } = require('./fetch_match');
const { parseDuels } = require('./duel_matrix');

const CURATED_RESOURCES = {
  iso_site_entry: {
    title: 'Apertura de Sitios con ISO & Uso Angular de Contingency',
    creators: ['Zonda FPS (Español)', 'Woohoojin (Inglés)', 'SkillCapped Valorant', 'ikahQT (Radiant Iso)'],
    keyConcepts: [
      'Uso diagonal de la muralla (Contingency) para cortar crossfires en vez de avanzar en línea recta',
      'Combo Undercut + Double Tap: debufeo a través de pared para asegurar 1-tap al cuerpo',
      'Esperar la utilidad de soporte de iniciador antes de cruzar cables de Cypher / Vyse'
    ],
    searchQuery: 'https://www.youtube.com/results?search_query=valorant+iso+site+entry+guide'
  },
  gunfight_hygiene: {
    title: 'Higiene de Duelo (Gunfight Hygiene) & Counter-Strafing vs Diamantes',
    creators: ['Woohoojin (Gunfight Hygiene Guide)', 'Sero Valorant (Movement & Peeking)', 'Valorant Domingo (Español)'],
    keyConcepts: [
      'Dead-zoning y A-D counter-strafing para evitar quedar estático al disparar',
      'Pre-aiming a off-angles verticales (cajas de B en Sunset, generador en Ascent)',
      'Nunca agacharse (crouch spray) en el primer micro-segundo de un duelo contra rifles'
    ],
    searchQuery: 'https://www.youtube.com/results?search_query=valorant+gunfight+hygiene+woohoojin'
  },
  disadvantage_pacing: {
    title: 'Gestión de Desventaja Numérica (3v5 y 2v4) & Pacing de Retake',
    creators: ['Valorant Domingo (Español)', 'Sovereign Guides', 'Coach Mills'],
    keyConcepts: [
      'Freno de emergencia: si 2 compañeros mueren a los 15s, congelar el empuje y jugar a rotación/fake',
      'Ceder el sitio en defensa para jugar el retake 5v4/4v4 agrupado con escudo de Iso',
      'Aislar duelos 1v1 individuales en vez de intentar un spray-transfer contra 2 enemigos'
    ],
    searchQuery: 'https://www.youtube.com/results?search_query=valorant+how+to+play+numbers+disadvantage+guide'
  },
  fatigue_and_consistency: {
    title: 'Gestión de Fatiga Neuromuscular & Consistencia en Baja Sensibilidad',
    creators: ['Voltaic Aim Community', 'Ronn Rhythms', 'Zonda FPS'],
    keyConcepts: [
      'Estructura 3+1: máximo 3 partidas competitivas por bloque para evitar caída de HS% (de 42% a 24%)',
      'Rutina de 10 min de reseteo motor entre partidas (micro-ajustes de dedos)',
      'Cero partidas de promoción con privación de sueño'
    ],
    searchQuery: 'https://www.youtube.com/results?search_query=valorant+aim+consistency+voltaic'
  }
};

function generateCoachingReport(matchData, targetHandle) {
  if (!matchData || typeof matchData !== 'object') {
    throw new Error('generateCoachingReport requiere un objeto de telemetría válido.');
  }
  const { playerMap, duelMatrix, target } = parseDuels(matchData, targetHandle);
  const effectiveTarget = target || (targetHandle ? Object.keys(playerMap).find(h => h.toLowerCase().includes(targetHandle.toLowerCase())) : Object.keys(playerMap)[0]);
  
  if (!effectiveTarget || !playerMap[effectiveTarget]) {
    return { error: `Player ${targetHandle || 'desconocido'} not found in match.` };
  }

  const p = playerMap[effectiveTarget];
  const opponents = Object.values(playerMap).filter(o => o.team !== p.team);
  const killsOnOpponents = duelMatrix[effectiveTarget] || {};

  const hardOpponents = [];
  opponents.forEach(opp => {
    const kills = killsOnOpponents[opp.handle] || 0;
    const deaths = (duelMatrix[opp.handle] || {})[effectiveTarget] || 0;
    if (deaths > kills) {
      hardOpponents.push({ opp, kills, deaths, diff: deaths - kills });
    }
  });

  return {
    player: p,
    hardOpponents,
    resources: CURATED_RESOURCES
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
  console.log(`Player: ${report.player.handle} (${report.player.agent} - ${report.player.rank})`);
  console.log(`\n1. Duelos con Mayor Fricción en la Partida:`);
  report.hardOpponents.forEach(h => {
    console.log(`  - vs ${h.opp.handle} (${h.opp.agent} - ${h.opp.rank}): ${h.kills} Kills / ${h.deaths} Deaths (-${h.diff})`);
  });

  console.log(`\n2. Módulos de Aprendizaje Visual Recomendados:`);
  Object.values(report.resources).forEach(r => {
    console.log(`\n▶ ${r.title}`);
    console.log(`  Creadores recomendados: ${r.creators.join(', ')}`);
    console.log(`  Conceptos clave:`);
    r.keyConcepts.forEach(c => console.log(`    * ${c}`));
    console.log(`  Búsqueda directa: ${r.searchQuery}`);
  });
}

module.exports = { generateCoachingReport, CURATED_RESOURCES };
