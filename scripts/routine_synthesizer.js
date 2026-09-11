#!/usr/bin/env node
'use strict';

/**
 * routine_synthesizer.js - Evolutionary Adaptive Routine & Aim Synthesizer
 *
 * Sintetiza rutinas SOLO a partir del contrato único de evidencia mecánica
 * (`routine_contract`). Sin defaults plausibles (HS%, leg%, radar) ni
 * debilidades forzadas: si no hay una debilidad fundamentada en una métrica
 * observada que cruce un umbral documentado, devuelve RUTINA OMITIDA con las
 * métricas faltantes y los datos requeridos.
 *
 * Zero external dependencies. Pure Node.js CommonJS.
 */

const { SCENARIO_CATALOG, buildEvidence, canGenerateRoutine } = require('./routine_contract');
const { provenanceLabel } = require('./data_contract');

class RoutineSynthesizer {
  constructor(options = {}) {
    this.targetDurationMinutes = options.targetDurationMinutes || 15;
  }

  /**
   * Sintetiza la rutina desde el perfil/evidencia mecánica observada.
   * @param {object} telemetry perfil con `mechanical` observado y `provenance`
   */
  synthesizeRoutine(telemetry) {
    const evidence = buildEvidence({ profile: telemetry, player: telemetry && telemetry.player });
    const gate = canGenerateRoutine(evidence);
    const player = evidence.player || (telemetry && telemetry.target) || null;
    const base = {
      player,
      provenance: gate.provenance,
      provenanceLabel: provenanceLabel(gate.provenance),
      thresholds: gate.thresholds
    };

    if (!gate.canGenerate) {
      return {
        ...base,
        omitted: true,
        reason: 'RUTINA OMITIDA',
        omittedReason: gate.omittedReason,
        missingMetrics: gate.missingMetrics,
        requiredData: gate.requiredData,
        targetDurationMin: this.targetDurationMinutes,
        totalRoutineMinutes: 0,
        identifiedWeaknesses: [],
        drillPlan: [],
        neuroMuscleAdvice: null
      };
    }

    const drillPlan = [];
    let allocatedSec = 0;
    const maxSec = this.targetDurationMinutes * 60;
    for (const w of gate.weaknesses) {
      const candidates = SCENARIO_CATALOG[w.area] || [];
      for (const scenario of candidates) {
        const blockSec = scenario.durationSec * scenario.reps;
        if (allocatedSec + blockSec <= maxSec) {
          drillPlan.push({
            scenario: scenario.name,
            focus: w.area,
            reason: w.reason,
            enablingMetric: w.enablingMetric,
            threshold: w.threshold,
            reps: scenario.reps,
            durationPerRep: `${scenario.durationSec}s`,
            totalTimeMin: Number((blockSec / 60).toFixed(1)),
            difficultyMultiplier: scenario.difficulty
          });
          allocatedSec += blockSec;
        }
      }
    }

    return {
      ...base,
      omitted: false,
      synthesizedAt: new Date().toISOString(),
      targetDurationMin: this.targetDurationMinutes,
      totalRoutineMinutes: Number((allocatedSec / 60).toFixed(1)),
      identifiedWeaknesses: gate.weaknesses.map(w => ({
        area: w.area,
        reason: w.reason,
        enablingMetric: w.enablingMetric,
        threshold: w.threshold
      })),
      drillPlan,
      neuroMuscleAdvice: 'Mantener respiración diafragmática en secuencias de micro-corrección. Priorizar precisión (>92%) sobre velocidad pura.'
    };
  }
}

module.exports = {
  RoutineSynthesizer,
  SCENARIO_CATALOG
};
