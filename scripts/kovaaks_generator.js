#!/usr/bin/env node
/**
 * kovaaks_generator.js - Adaptive 15-Minute Kovaaks Aim Routine Generator
 * Generates custom Kovaaks training playlists based on match telemetry, map geometry,
 * and specific mechanical bottlenecks (horizontal micro-adjustments, vertical tracking, dynamic clicks).
 * 
 * Usage: node kovaaks_generator.js <match_id_or_json_file> [target_player_handle]
 */

const fs = require('fs');
const { extractMatchId, fetchMatch } = require('./fetch_match');
const { parseDuels } = require('./duel_matrix');

function generateKovaaksRoutine(matchData, targetHandle) {
  const meta = matchData.data?.metadata || {};
  const segments = matchData.data?.segments || [];
  const mapName = meta.mapName || 'Ascent';

  const { playerMap, target } = parseDuels(matchData, targetHandle);
  const p = target ? playerMap[target] : Object.values(playerMap)[0];
  const stats = p ? (segments.find(s => s.type === 'player-summary' && (s.metadata?.platformUserHandle === p.handle || s.attributes?.platformUserIdentifier === p.handle))?.stats || {}) : {};

  const hsPct = parseFloat(stats.hsAccuracy?.displayValue || stats.headshotsPercentage?.displayValue || '30%');
  const fk = stats.firstKills?.value || 0;
  const fd = stats.firstDeaths?.value || 0;
  const losesOpenings = fd > fk;
  const isVerticalMap = ['Abyss', 'Split', 'Icebox'].includes(mapName);

  const playlist = [];

  // Phase 1: Micro-Calibration & Dynamic Clicking (5 mins)
  // Prioridad biomecánica: si pierde aperturas (FD>FK) → velocidad de micro-ajuste
  // y cambio de objetivo; si el HS% es bajo → corrección de primer tiro.
  if (hsPct < 30 && losesOpenings) {
    playlist.push({
      scenario: 'Valorant Microshot Speed / 1w4ts reload',
      aimLab: 'Sixshot (Aim Lab)',
      duration: '5 mins (5 sets)',
      category: 'Dynamic Clicking & Opening Duel Speed',
      instruction: 'Estás perdiendo duelos de apertura (FD>FK): prioriza la transición entre objetivos a la altura de la cabeza y el 1-tap confirmado antes de desplazarte.'
    });
  } else if (hsPct < 30) {
    playlist.push({
      scenario: 'Pasu Small Reload / 1wall6targets extra small',
      aimLab: 'Microshot (Aim Lab)',
      duration: '5 mins (5 sets)',
      category: 'Dynamic Clicking & Micro-correction',
      instruction: 'Enfócate en mover el codo suavemente para el desplazamiento inicial y frena con los dedos. Cero disparos precipitados.'
    });
  } else {
    playlist.push({
      scenario: 'Valorant Microshot Speed / 1w4ts reload',
      aimLab: 'Sixshot (Aim Lab)',
      duration: '5 mins (5 sets)',
      category: 'Static Speed & Crosshair Snapping',
      instruction: 'Acelera la transición entre objetivos estáticos a la altura de la cabeza. Confirma el 1-tap antes de mover la mira.'
    });
  }

  // Phase 2: Map Geometry & Vertical/Horizontal Stability (5 mins)
  if (isVerticalMap) {
    playlist.push({
      scenario: 'Vertical Smoothness Training / Popcorn Small',
      aimLab: 'Smoothsphere (Aim Lab)',
      duration: '5 mins (5 sets)',
      category: 'Vertical Control & Forearm Gliding',
      instruction: `Ajuste para ${mapName}: alivia la presión del antebrazo sobre la alfombrilla para permitir micro-ajustes verticales hacia arriba y abajo sin atascos.`
    });
  } else {
    playlist.push({
      scenario: 'Close Fast Strafes Easy / Thin Aiming Long',
      aimLab: 'Strafetrack (Aim Lab)',
      duration: '5 mins (5 sets)',
      category: 'Smooth Horizontal Tracking & Counter-Strafe Reading',
      instruction: 'Sigue objetivos en movimiento horizontal manteniendo el pulso constante sin temblor en 1600 DPI.'
    });
  }

  // Phase 3: High-Reactivity Target Switching & Iso Entry Flow (5 mins)
  playlist.push({
    scenario: 'KinTargetSwitch / PatTargetSwitch 360',
    aimLab: 'Gridshot (Aim Lab)',
    duration: '5 mins (5 sets)',
    category: 'Target Switching & Multi-Kill Flow',
    instruction: 'Simula los dobles contactos de Iso tras abrir con escudo. Elimina el primer objetivo y transfórmalo de inmediato al segundo con un barrido limpio.'
  });

  return {
    player: p?.handle || targetHandle,
    map: mapName,
    hsPct: `${hsPct}%`,
    firstDuels: { firstKills: fk, firstDeaths: fd, entryRating: Math.round((fk / Math.max(1, fk + fd)) * 100) },
    sensitivityRecommendation: hsPct >= 35 ? 'Mantener 0.110 (176 eDPI) para máxima precisión de primer disparo.' : 'Probar 0.114 - 0.115 (182-184 eDPI) si notas que el brazo se fatiga en Kovaaks.',
    platforms: ['Kovaaks', 'Aim Lab'],
    routine: playlist
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args[0]) {
    console.error('Usage: node kovaaks_generator.js <match_id_or_json_file> [target_player_handle]');
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
  const res = generateKovaaksRoutine(matchData, handle);

  console.log(`\n=== ADAPTIVE 15-MIN KOVAAKS AIM ROUTINE (AIM LAB): ${res.player} ===`);
  console.log(`Map Reference: ${res.map} | Match HS%: ${res.hsPct}`);
  console.log(`Hardware/Sens Advice: ${res.sensitivityRecommendation}`);
  console.log(`\n--- 15-MINUTE WORKOUT PLAN ---`);
  res.routine.forEach((r, idx) => {
    console.log(`\n[Bloque ${idx + 1}] 🎯 ${r.scenario} | ${r.aimLab} (${r.duration})`);
    console.log(`  Enfoque: ${r.category}`);
    console.log(`  Técnica: ${r.instruction}`);
  });
}

module.exports = { generateKovaaksRoutine };
