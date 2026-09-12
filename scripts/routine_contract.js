#!/usr/bin/env node
'use strict';

/**
 * routine_contract.js — Contrato ÚNICO de evidencia mecánica para rutinas.
 *
 * Consumido por `learning_profile`, `weapon_telemetry`, `kovaaks_generator`,
 * `routine_synthesizer` y el CLI. Regla central:
 *
 *   Una rutina SOLO se genera si existe una debilidad fundamentada en una
 *   MÉTRICA OBSERVADA que cruza un UMBRAL DOCUMENTADO, con procedencia visible
 *   y un ejercicio asociado disponible. Si falta algo: `RUTINA OMITIDA` con
 *   métricas faltantes y datos requeridos.
 *
 * Nunca se usan valores por defecto plausibles (HS 20/30%, leg 10%, etc.).
 */

const { observedNumber, sourceProvenance } = require('./data_contract');

// Umbrales DOCUMENTADOS (referencia competitiva; no verdades absolutas).
const THRESHOLDS = Object.freeze({
  HS_LOW: { metric: 'hsPct', op: 'lt', value: 25, description: 'HS% por debajo del estándar competitivo (25-35%)' },
  LEG_HIGH: { metric: 'legPct', op: 'gt', value: 12, description: 'Impactos en pierna > 12% (mira baja / sobre-spray)' },
  OPENING_DEFICIT: { metric: 'fdMinusFk', op: 'gt', value: 0, description: 'Muertes de apertura por encima de kills (FD > FK)' },
  SPRAY_OVERCOMMIT: { metric: 'sprayTapRatio', op: 'gt', value: 1.8, description: 'Ratio spray/tap > 1.8 (ráfaga prolongada)' }
});

// Catálogo Kovaaks/Aim Lab (para synthesizer).
const SCENARIO_CATALOG = {
  CROSSHAIR_PLACEMENT: [
    { name: 'Valorant Microshot Height Lock', reps: 3, durationSec: 60, difficulty: 1.0 },
    { name: 'Ascent Head-Level Angle Hold', reps: 4, durationSec: 45, difficulty: 1.1 },
    { name: '1wall6targets Extra Small', reps: 3, durationSec: 60, difficulty: 1.2 }
  ],
  MICRO_ADJUSTMENT: [
    { name: 'Pasu Small Reload Clean', reps: 4, durationSec: 60, difficulty: 1.15 },
    { name: 'Micro Flick 180 Precision', reps: 3, durationSec: 60, difficulty: 1.2 },
    { name: 'Reflex Flick - Dynamic Click', reps: 4, durationSec: 45, difficulty: 1.25 }
  ],
  ANGLE_ISOLATION: [
    { name: 'Valorant Peeking Benchmark', reps: 5, durationSec: 60, difficulty: 1.1 },
    { name: 'Split B-Heaven Clearing Drill', reps: 3, durationSec: 60, difficulty: 1.2 }
  ],
  PISTOL_PRECISION: [
    { name: '1-Tap Ghost Precision Classic', reps: 3, durationSec: 60, difficulty: 1.0 },
    { name: 'Sheriff Click Timing Horizontal', reps: 4, durationSec: 45, difficulty: 1.3 }
  ]
};

// Catálogo de la ruta rápida (kovaaks_generator / comando `aim`).
const KOVAAKS_SCENARIOS = {
  MICRO_ADJUSTMENT: [
    { scenario: 'Pasu Small Reload / 1wall6targets extra small', aimLab: 'Microshot (Aim Lab)', duration: '5 mins (5 sets)', category: 'Micro-corrección y primer tiro', instruction: 'Mueve el codo suavemente para el desplazamiento inicial y frena con los dedos. Cero disparos precipitados.' }
  ],
  CROSSHAIR_PLACEMENT: [
    { scenario: 'Valorant Microshot Height Lock / 1wall6targets small', aimLab: 'Headshot (Aim Lab)', duration: '5 mins (5 sets)', category: 'Altura de mira y primer impacto', instruction: 'Fija la mira a altura de cabeza antes de doblar esquinas; evita impactos en pierna por mira baja.' }
  ],
  ANGLE_ISOLATION: [
    { scenario: 'Valorant Peeking Benchmark / KinTargetSwitch', aimLab: 'Gridshot (Aim Lab)', duration: '5 mins (5 sets)', category: 'Aislamiento de ángulos y apertura', instruction: 'Slice-the-pie: un ángulo por vez, sin cruzar a campo abierto antes de confirmar el tradeo.' }
  ],
  PISTOL_PRECISION: [
    { scenario: '1-Tap Ghost Precision / Sheriff Click Timing', aimLab: 'Headshot (Aim Lab)', duration: '5 mins (5 sets)', category: 'Ráfaga corta y disciplina de gatillo', instruction: 'Micro-ráfagas de 2 balas con counter-strafe; castiga el spray prolongado.' }
  ]
};

function metricOrNull(metrics, key) {
  const v = metrics ? metrics[key] : null;
  return Number.isFinite(v) ? v : null;
}

/**
 * Construye la evidencia mecánica a partir de las salidas de los módulos.
 * Solo lee campos OBSERVADOS; null cuando no existen.
 */
function buildEvidence({ profile, weapon, matchProvenance, player, temporalContext } = {}) {
  const mech = (profile && profile.mechanical) || {};
  const zones = (weapon && weapon.zoneMetrics) || {};
  const metrics = {
    hsPct: observedNumber(mech, ['hsPct']),
    fk: observedNumber(mech, ['fk']),
    fd: observedNumber(mech, ['fd']),
    acs: observedNumber(mech, ['acs']),
    headPct: observedNumber(zones, ['headPct']),
    bodyPct: observedNumber(zones, ['bodyPct']),
    legPct: observedNumber(zones, ['legPct']),
    sprayTapRatio: observedNumber((weapon && weapon.metrics) || {}, ['sprayTapRatio'])
  };
  const observed = {};
  for (const k of Object.keys(metrics)) observed[k] = metrics[k] !== null;
  const provenance = (profile && profile.provenance) || matchProvenance || sourceProvenance((profile && profile.meta) || {});
  // Por defecto NO hay contexto temporal: las áreas que exigen trade/posición/
  // tiempo quedan bloqueadas salvo que el llamador aporte evidencia observada.
  const temporal = temporalContext && temporalContext.sufficient === true
    ? temporalContext
    : { timing: false, position: false, trade: false, sufficient: false };
  return { player: player || (profile && profile.player) || null, provenance, metrics, observed, temporal };
}

/**
 * Evalúa debilidades: solo métricas observadas + umbral documentado +
 * ejercicio asociado disponible.
 */
function evaluateWeaknesses(evidence) {
  const m = evidence.metrics;
  const o = evidence.observed;
  const weaknesses = [];
  const missingMetrics = [];
  const requiredData = [];
  const blockedByTemporal = [];

  const hs = o.hsPct ? metricOrNull(m, 'hsPct') : null;
  if (hs === null) {
    missingMetrics.push('hsPct');
    requiredData.push('HS% observado (porcentaje válido 0-100)');
  } else if (hs < THRESHOLDS.HS_LOW.value) {
    weaknesses.push({ area: 'MICRO_ADJUSTMENT', reason: `HS ${hs}% por debajo del umbral ${THRESHOLDS.HS_LOW.value}%`, enablingMetric: 'hsPct', threshold: THRESHOLDS.HS_LOW.value });
  }

  const leg = o.legPct ? metricOrNull(m, 'legPct') : null;
  if (leg === null) {
    missingMetrics.push('legPct');
    requiredData.push('Distribución de impactos observada (head/body/leg)');
  } else if (leg > THRESHOLDS.LEG_HIGH.value) {
    weaknesses.push({ area: 'CROSSHAIR_PLACEMENT', reason: `Impactos en pierna ${leg}% por encima del umbral ${THRESHOLDS.LEG_HIGH.value}%`, enablingMetric: 'legPct', threshold: THRESHOLDS.LEG_HIGH.value });
  }

  const fk = o.fk ? metricOrNull(m, 'fk') : null;
  const fd = o.fd ? metricOrNull(m, 'fd') : null;
  if (fk === null || fd === null) {
    missingMetrics.push('fk/fd');
    requiredData.push('First kills y first deaths observados');
  } else if (fd > fk) {
    const opening = {
      area: 'ANGLE_ISOLATION',
      requiresTemporal: true,
      reason: `Muertes de apertura (FD ${fd}) por encima de kills de apertura (FK ${fk})`,
      enablingMetric: 'fdMinusFk',
      threshold: THRESHOLDS.OPENING_DEFICIT.value
    };
    // Regla dura: el agregado FK/FD NO habilita lectura de aperturas/tradeo.
    // Se exige contexto observado (trade/posición/timestamp).
    if (evidence.temporal && evidence.temporal.sufficient) {
      weaknesses.push(opening);
    } else {
      blockedByTemporal.push(opening);
      requiredData.push('eventos de ronda con marcas de trade, posición o timestamp (requisito para leer aperturas)');
    }
  }

  const spray = o.sprayTapRatio ? metricOrNull(m, 'sprayTapRatio') : null;
  if (spray === null) {
    missingMetrics.push('sprayTapRatio');
    requiredData.push('Eventos de daño por ronda (headshots/bodyshots/legshots)');
  } else if (spray > THRESHOLDS.SPRAY_OVERCOMMIT.value) {
    weaknesses.push({ area: 'PISTOL_PRECISION', reason: `Ratio spray/tap ${spray} por encima del umbral ${THRESHOLDS.SPRAY_OVERCOMMIT.value}`, enablingMetric: 'sprayTapRatio', threshold: THRESHOLDS.SPRAY_OVERCOMMIT.value });
  }

  const withExercise = weaknesses.filter(w =>
    Array.isArray(SCENARIO_CATALOG[w.area]) && SCENARIO_CATALOG[w.area].length > 0 &&
    Array.isArray(KOVAAKS_SCENARIOS[w.area]) && KOVAAKS_SCENARIOS[w.area].length > 0
  );
  const areasWithoutExercise = weaknesses.filter(w => !withExercise.includes(w)).map(w => w.area);

  return {
    weaknesses: withExercise,
    missingMetrics: [...new Set(missingMetrics)],
    requiredData: [...new Set(requiredData)],
    areasWithoutExercise,
    areasBlockedByTemporal: blockedByTemporal.map(w => w.area)
  };
}

/** Decisión de rutina: solo si hay ≥1 debilidad fundamentada con ejercicio. */
function canGenerateRoutine(evidence) {
  const { weaknesses, missingMetrics, requiredData, areasWithoutExercise, areasBlockedByTemporal } = evaluateWeaknesses(evidence);
  const anyObserved = Object.values(evidence.observed).some(Boolean);
  const omittedReason = weaknesses.length > 0
    ? null
    : (areasBlockedByTemporal.length > 0
      ? 'Sin debilidad accionable: la lectura de aperturas/tradeo exige eventos de ronda con trade, posición o timestamp (no observados).'
      : (anyObserved
        ? 'Sin debilidad mecánica fundamentada: métricas observadas dentro del umbral documentado.'
        : 'Sin evidencia mecánica observada suficiente.'));
  return {
    canGenerate: weaknesses.length > 0,
    weaknesses,
    missingMetrics,
    requiredData,
    areasWithoutExercise,
    areasBlockedByTemporal,
    provenance: evidence.provenance,
    omittedReason,
    thresholds: THRESHOLDS
  };
}

module.exports = {
  THRESHOLDS,
  SCENARIO_CATALOG,
  KOVAAKS_SCENARIOS,
  buildEvidence,
  evaluateWeaknesses,
  canGenerateRoutine
};
