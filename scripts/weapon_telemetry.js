#!/usr/bin/env node
/**
 * weapon_telemetry.js - Deep Weapon & Engagement Distance Telemetry
 * 
 * Reconstructs damage zones (Head/Body/Leg), infers engagement distance bands
 * (Close 0-15m, Mid 15-30m, Long 30-50m) from loadouts and round damage instances,
 * computes the Spray vs. Tap-Fire Efficiency ratio (SE/TP), and prescribes
 * precision biomechanical adjustments for Kovaaks / Aim Lab.
 * 
 * Zero external dependencies. Pure Node.js, compatible with Windows/PowerShell and POSIX.
 * 
 * Usage:
 *   node weapon_telemetry.js <match_json_file> [player_handle] [--json]
 */

const fs = require('fs');
const path = require('path');

function analyzeWeaponTelemetry(matchData, targetHandle) {
  if (!matchData || !matchData.data) {
    throw new Error('Datos de partida inválidos: estructura matchData.data ausente.');
  }

  const segments = matchData.data.segments || [];
  const playerSummaries = segments.filter(s => s.type === 'player-summary');
  
  const handles = playerSummaries.map(p => 
    p.metadata?.platformUserHandle || p.attributes?.platformUserIdentifier || 'Unknown'
  );

  let target = targetHandle
    ? handles.find(h => h.toLowerCase().includes(targetHandle.toLowerCase()))
    : handles[0];
  if (!target) target = handles[0] || 'Unknown';

  const playerSummary = playerSummaries.find(p => 
    (p.metadata?.platformUserHandle || p.attributes?.platformUserIdentifier) === target
  );

  // Extract all player-round-damage instances involving the target
  const damageSegments = segments.filter(s => 
    s.type === 'player-round-damage' && 
    (s.attributes?.platformUserIdentifier === target || s.metadata?.platformInfo?.platformUserHandle === target)
  );

  // Extract loadout values by round for the target player
  const playerRounds = segments.filter(s => 
    s.type === 'player-round' && 
    (s.attributes?.platformUserIdentifier === target || s.metadata?.platformInfo?.platformUserHandle === target)
  );

  const roundLoadoutMap = {};
  playerRounds.forEach(r => {
    const roundNum = r.attributes?.round || 1;
    roundLoadoutMap[roundNum] = r.stats?.loadoutValue?.value || 0;
  });

  let totalHead = 0;
  let totalBody = 0;
  let totalLeg = 0;
  let totalDamage = 0;
  let sprayInstances = 0; // multi-hit body shots (>= 3 body hits in a single exchange)
  let precisionTaps = 0;  // 1-2 hit lethal exchanges with headshots

  // Distance band aggregators
  const bands = {
    closeRange: { name: 'Close Range (0-15m / Pistol & Eco)', hits: 0, head: 0, body: 0, damage: 0, duels: 0 },
    midRange:   { name: 'Mid Range (15-30m / Rifle Standard)', hits: 0, head: 0, body: 0, damage: 0, duels: 0 },
    longRange:  { name: 'Long Range (30-50m / Heavy & Sniper)', hits: 0, head: 0, body: 0, damage: 0, duels: 0 }
  };

  damageSegments.forEach(d => {
    const st = d.stats || {};
    const h = st.headshots?.value || 0;
    const b = st.bodyshots?.value || 0;
    const l = st.legshots?.value || 0;
    const dmg = st.damage?.value || 0;
    const roundNum = d.attributes?.round || 1;
    const loadout = roundLoadoutMap[roundNum] || 2500;

    totalHead += h;
    totalBody += b;
    totalLeg += l;
    totalDamage += dmg;

    if (b >= 3) sprayInstances++;
    if (h >= 1 && (h + b) <= 2) precisionTaps++;

    let bandKey = 'midRange';
    if (loadout <= 1500) bandKey = 'closeRange';
    else if (loadout >= 4600) bandKey = 'longRange';

    bands[bandKey].duels++;
    bands[bandKey].hits += (h + b + l);
    bands[bandKey].head += h;
    bands[bandKey].body += b;
    bands[bandKey].damage += dmg;
  });

  const totalHits = Math.max(1, totalHead + totalBody + totalLeg);
  const headPct = parseFloat(((totalHead / totalHits) * 100).toFixed(1));
  const bodyPct = parseFloat(((totalBody / totalHits) * 100).toFixed(1));
  const legPct = parseFloat(((totalLeg / totalHits) * 100).toFixed(1));

  const sprayTapRatio = parseFloat((sprayInstances / Math.max(1, precisionTaps)).toFixed(2));
  
  let firingDiscipline = 'Equilibrada (Control de Ráfagas Óptimo)';
  let recoilAdvice = 'Mantienes buen balance entre primer disparo a la cabeza y micro-ajuste de 3 balas.';
  if (sprayTapRatio > 1.8) {
    firingDiscipline = 'Sobre-Compromiso en Spray (Spray Over-Commitment)';
    recoilAdvice = 'Tiendes a prolongar el spray a más de 4-5 balas incluso a media distancia. Fuerza micro-ráfagas de 2 balas y counter-strafe.';
  } else if (sprayTapRatio < 0.4 && headPct > 35) {
    firingDiscipline = 'Tap-Firing Quirúrgico de Alta Precisión';
    recoilAdvice = 'Excelente primer disparo a la cabeza. Asegura tener velocidad de reseteo si te empujan múltiples rivales en contacto cerrado.';
  }

  const distanceProfile = Object.entries(bands).map(([k, b]) => {
    const hits = Math.max(1, b.hits);
    const bandHsPct = parseFloat(((b.head / hits) * 100).toFixed(1));
    return {
      band: k,
      name: b.name,
      duels: b.duels,
      totalDamage: b.damage,
      headshots: b.head,
      hsAccuracy: bandHsPct + '%',
      conversionRating: bandHsPct >= 30 ? 'Elite' : bandHsPct >= 20 ? 'Sólido' : 'Subóptimo (Fuga de daño)'
    };
  });

  return {
    player: target,
    agent: playerSummary?.metadata?.agentName || 'Agente',
    rank: playerSummary?.stats?.rank?.displayValue || 'Unranked',
    hitZoneDistribution: {
      head: headPct + '% (' + totalHead + ' impactos)',
      body: bodyPct + '% (' + totalBody + ' impactos)',
      leg: legPct + '% (' + totalLeg + ' impactos)'
    },
    metrics: {
      totalHits,
      totalDamage,
      sprayInstances,
      precisionTaps,
      sprayTapRatio,
      firingDiscipline
    },
    distanceBands: distanceProfile,
    recoilDiagnosis: {
      evaluacion: firingDiscipline,
      analisisTactico: recoilAdvice,
      kovaaksPrescription: sprayTapRatio > 1.5 
        ? 'Pasu Small Reload + 1wall6targets small (Castiga el spray innecesario y entrena micro-clicks estáticos)'
        : 'Smoothness Sphere + PatTargetSwitch (Afina la fluidez y cambio de objetivo sin perder precisión)'
    }
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    console.log('Weapon Telemetry Engine v1.0 — Análisis de Armas, Zonas de Impacto y Bandas de Distancia');
    console.log('Uso: node weapon_telemetry.js <partida.json> [handle] [--json]');
    process.exit(0);
  }

  const filePath = args[0];
  const target = args[1] && !args[1].startsWith('--') ? args[1] : null;
  const asJson = args.includes('--json');

  try {
    const raw = fs.readFileSync(path.resolve(filePath), 'utf8');
    const data = JSON.parse(raw);
    const result = analyzeWeaponTelemetry(data, target);

    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\n========================================================================');
      console.log('🎯 TELEMETRÍA DE ARMAS Y BANDAS DE IMPACTO: ' + result.player + ' (' + result.agent + ')');
      console.log('Distribución de Zonas: Cabeza ' + result.hitZoneDistribution.head + ' | Cuerpo ' + result.hitZoneDistribution.body + ' | Piernas ' + result.hitZoneDistribution.leg);
      console.log('Disciplina de Disparo: ' + result.metrics.firingDiscipline + ' (SE/TP Ratio: ' + result.metrics.sprayTapRatio + ')');
      console.log('------------------------------------------------------------------------');
      console.log('DISTANCIA Y CONVERSIÓN POR TIER:');
      result.distanceBands.forEach(d => {
        console.log('  • ' + d.name);
        console.log('     Duelos: ' + d.duels + ' | Daño: ' + d.totalDamage + ' | HS: ' + d.hsAccuracy + ' [' + d.conversionRating + ']');
      });
      console.log('------------------------------------------------------------------------');
      console.log('DIAGNÓSTICO TÁCTICO: ' + result.recoilDiagnosis.analisisTactico);
      console.log('RUTINA ASOCIADA: ' + result.recoilDiagnosis.kovaaksPrescription);
      console.log('========================================================================\n');
    }
  } catch (e) {
    console.error('ERROR: ' + e.message);
    process.exit(1);
  }
}

module.exports = { analyzeWeaponTelemetry };
