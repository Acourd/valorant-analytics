#!/usr/bin/env node
/**
 * weapon_telemetry.js - Deep Weapon & Impact-Zone Telemetry
 *
 * Reconstruye zonas de daño (Head/Body/Leg) y el ratio Spray/Tap (SE/TP) a
 * partir de eventos de daño OBSERVADOS. NO infiere distancia desde el valor del
 * loadout: si no hay posiciones observadas, las bandas de distancia son `n/d`
 * y no se emite prescripción mecánica.
 *
 * Zero external dependencies. Pure Node.js, compatible con Windows/PowerShell y POSIX.
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

  const target = require('./data_contract').resolveExactHandle(handles, targetHandle, { allowFirstIfMissing: true });

  const playerSummary = playerSummaries.find(p =>
    (p.metadata?.platformUserHandle || p.attributes?.platformUserIdentifier) === target
  );

  // Eventos de daño OBSERVADOS del objetivo.
  const damageSegments = segments.filter(s =>
    s.type === 'player-round-damage' &&
    (s.attributes?.platformUserIdentifier === target || s.metadata?.platformInfo?.platformUserHandle === target)
  );

  let totalHead = 0;
  let totalBody = 0;
  let totalLeg = 0;
  let totalDamage = 0;
  let sprayInstances = 0; // multi-hit body shots (>= 3 body hits in a single exchange)
  let precisionTaps = 0;  // 1-2 hit lethal exchanges with headshots

  damageSegments.forEach(d => {
    const st = d.stats || {};
    totalHead += st.headshots?.value || 0;
    totalBody += st.bodyshots?.value || 0;
    totalLeg += st.legshots?.value || 0;
    totalDamage += st.damage?.value || 0;
    const b = st.bodyshots?.value || 0;
    const h = st.headshots?.value || 0;
    if (b >= 3) sprayInstances++;
    if (h >= 1 && (h + b) <= 2) precisionTaps++;
  });

  const totalHits = totalHead + totalBody + totalLeg;
  const observed = totalHits > 0;
  const pct = n => observed ? parseFloat(((n / totalHits) * 100).toFixed(1)) : null;
  const headPct = pct(totalHead);
  const bodyPct = pct(totalBody);
  const legPct = pct(totalLeg);
  const sprayTapRatio = observed ? parseFloat((sprayInstances / Math.max(1, precisionTaps)).toFixed(2)) : null;

  let firingDiscipline = null;
  let recoilAdvice = null;
  let kovaaksPrescription = null;
  if (observed) {
    firingDiscipline = 'Equilibrada (Control de Ráfagas Óptimo)';
    recoilAdvice = 'Mantienes buen balance entre primer disparo a la cabeza y micro-ajuste de 3 balas.';
    if (sprayTapRatio > 1.8) {
      firingDiscipline = 'Sobre-Compromiso en Spray (Spray Over-Commitment)';
      recoilAdvice = 'Tiendes a prolongar el spray a más de 4-5 balas incluso a media distancia. Fuerza micro-ráfagas de 2 balas y counter-strafe.';
    } else if (sprayTapRatio < 0.4 && headPct > 35) {
      firingDiscipline = 'Tap-Firing Quirúrgico de Alta Precisión';
      recoilAdvice = 'Excelente primer disparo a la cabeza. Asegura tener velocidad de reseteo si te empujan múltiples rivales en contacto cerrado.';
    }
    kovaaksPrescription = sprayTapRatio > 1.5
      ? 'Pasu Small Reload + 1wall6targets small (Castiga el spray innecesario y entrena micro-clicks estáticos)'
      : 'Smoothness Sphere + PatTargetSwitch (Afina la fluidez y cambio de objetivo sin perder precisión)';
  }

  return {
    player: target,
    agent: playerSummary?.metadata?.agentName || null,
    rank: playerSummary?.stats?.rank?.displayValue || 'Unranked',
    hitZoneDistribution: observed
      ? {
        head: `${headPct}% (${totalHead} impactos)`,
        body: `${bodyPct}% (${totalBody} impactos)`,
        leg: `${legPct}% (${totalLeg} impactos)`
      }
      : { head: 'n/d', body: 'n/d', leg: 'n/d' },
    zoneMetrics: {
      totalHits,
      headPct,
      bodyPct,
      legPct,
      observed
    },
    metrics: {
      totalHits,
      totalDamage,
      sprayInstances,
      precisionTaps,
      sprayTapRatio,
      firingDiscipline
    },
    // Sin posiciones observadas no se infiere distancia (jamás desde loadout).
    distanceBands: null,
    distanceNote: 'n/d: sin posiciones observadas; no se infiere distancia por valor de loadout.',
    recoilDiagnosis: observed
      ? { evaluacion: firingDiscipline, analisisTactico: recoilAdvice, kovaaksPrescription }
      : { evaluacion: 'n/d', analisisTactico: 'Sin eventos de daño observados: no se emite diagnóstico mecánico.', kovaaksPrescription: null }
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    console.log('Weapon Telemetry Engine v1.1 — Zonas de Impacto Observadas (sin inferir distancia)');
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
      console.log('🎯 TELEMETRÍA DE ARMAS E IMPACTOS: ' + result.player + ' (' + (result.agent || 'n/d') + ')');
      console.log('Distribución de Zonas: Cabeza ' + result.hitZoneDistribution.head + ' | Cuerpo ' + result.hitZoneDistribution.body + ' | Piernas ' + result.hitZoneDistribution.leg);
      console.log('Disciplina de Disparo: ' + (result.metrics.firingDiscipline || 'n/d') + ' (SE/TP Ratio: ' + (result.metrics.sprayTapRatio === null ? 'n/d' : result.metrics.sprayTapRatio) + ')');
      console.log('------------------------------------------------------------------------');
      console.log('DISTANCIA: ' + result.distanceNote);
      console.log('------------------------------------------------------------------------');
      console.log('DIAGNÓSTICO TÁCTICO: ' + result.recoilDiagnosis.analisisTactico);
      console.log('RUTINA ASOCIADA: ' + (result.recoilDiagnosis.kovaaksPrescription || 'RUTINA OMITIDA (sin eventos de daño observados)'));
      console.log('========================================================================\n');
    }
  } catch (e) {
    console.error('ERROR: ' + e.message);
    process.exit(1);
  }
}

module.exports = { analyzeWeaponTelemetry };
