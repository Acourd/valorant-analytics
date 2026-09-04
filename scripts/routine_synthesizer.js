#!/usr/bin/env node
'use strict';

/**
 * routine_synthesizer.js - Evolutionary Adaptive Routine & Aim Synthesizer
 * 
 * Dynamically synthesizes and mutates personalized aim and tactical routines
 * by mapping identified mechanical bottlenecks to targeted training modules.
 * Adapts difficulty tiers and focus drills based on telemetry feedback loops.
 * 
 * Zero external dependencies. Pure Node.js CommonJS.
 */

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

class RoutineSynthesizer {
  constructor(options = {}) {
    this.targetDurationMinutes = options.targetDurationMinutes || 15;
  }

  /**
   * Synthesizes an adaptive routine based on match telemetry weaknesses
   */
  synthesizeRoutine(telemetry) {
    const weaknesses = [];
    const radar = telemetry.radar || {};

    const hsPct = telemetry.hitDistribution ? telemetry.hitDistribution.head : 20;
    const legPct = telemetry.hitDistribution ? telemetry.hitDistribution.leg : 10;
    const firstDuels = radar.primerosDuelos || 50;
    const mechanicalProwess = radar.punteriaMecanica || 50;

    // Detect primary training catalysts
    if (legPct > 12) {
      weaknesses.push({
        area: 'CROSSHAIR_PLACEMENT',
        reason: `Leg shot rate (${legPct}%) excede umbral de seguridad (12%). La mira se posiciona baja al doblar esquinas.`
      });
    }

    if (mechanicalProwess < 50 || hsPct < 22) {
      weaknesses.push({
        area: 'MICRO_ADJUSTMENT',
        reason: `Efectividad de micro-ajuste reducida (HS: ${hsPct}%). Se requiere calibrar el micro-flick terminal.`
      });
    }

    if (firstDuels < 45) {
      weaknesses.push({
        area: 'ANGLE_ISOLATION',
        reason: `Aislamiento deficiente en primeros duelos (${firstDuels}/100). Necesidad de slice-the-pie proactivo.`
      });
    }

    // Si no hay fallas severas, mantener régimen de afinación general
    if (weaknesses.length === 0) {
      weaknesses.push({
        area: 'PISTOL_PRECISION',
        reason: 'Mecánicas nominales: optimizar rondas de pistolas y consistencia de 1er tiro.'
      });
    }

    // Synthesize modules
    const routine = [];
    let allocatedSec = 0;
    const maxSec = this.targetDurationMinutes * 60;

    for (const w of weaknesses) {
      const candidates = SCENARIO_CATALOG[w.area] || SCENARIO_CATALOG.CROSSHAIR_PLACEMENT;
      for (const scenario of candidates) {
        if (allocatedSec + (scenario.durationSec * scenario.reps) <= maxSec) {
          routine.push({
            scenario: scenario.name,
            focus: w.area,
            reps: scenario.reps,
            durationPerRep: `${scenario.durationSec}s`,
            totalTimeMin: Number(((scenario.durationSec * scenario.reps) / 60).toFixed(1)),
            difficultyMultiplier: scenario.difficulty
          });
          allocatedSec += scenario.durationSec * scenario.reps;
        }
      }
    }

    return {
      player: telemetry.player || telemetry.target || 'Player#0000',
      synthesizedAt: new Date().toISOString(),
      targetDurationMin: this.targetDurationMinutes,
      totalRoutineMinutes: Number((allocatedSec / 60).toFixed(1)),
      identifiedWeaknesses: weaknesses,
      drillPlan: routine,
      neuroMuscleAdvice: 'Mantener respiración diafragmática en secuencias de micro-corrección. Priorizar precisión (>92%) sobre velocidad pura.'
    };
  }
}

module.exports = {
  RoutineSynthesizer,
  SCENARIO_CATALOG
};

if (require.main === module) {
  const synthesizer = new RoutineSynthesizer({ targetDurationMinutes: 15 });
  const sampleTelemetry = {
    player: 'TenZ#0001',
    hitDistribution: { head: 17.5, body: 68.0, leg: 14.5 },
    radar: { primerosDuelos: 38, punteriaMecanica: 42 }
  };

  const plan = synthesizer.synthesizeRoutine(sampleTelemetry);
  console.log(`[RoutineSynthesizer] Rutina sintetizada: ${plan.totalRoutineMinutes} min (${plan.drillPlan.length} escenarios)`);
  plan.drillPlan.forEach(d => console.log(`  • [${d.focus}] ${d.scenario} x${d.reps} (${d.totalTimeMin}m)`));
}
