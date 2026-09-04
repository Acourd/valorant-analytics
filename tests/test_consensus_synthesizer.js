#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { ConsensusArbiter } = require(path.join(__dirname, '..', 'scripts', 'consensus_arbiter'));
const { RoutineSynthesizer } = require(path.join(__dirname, '..', 'scripts', 'routine_synthesizer'));

console.log('[TEST] Iniciando verificación de Consensus Arbiter & Routine Synthesizer...');

// 1. Consensus Arbiter (BFT Quorum)
const arbiter = new ConsensusArbiter();
const poorTelemetry = {
  adr: 98,
  radar: {
    primerosDuelos: 30,
    gestionEconomica: 35,
    spacingYTrades: 38,
    supervivencia: 32
  }
};

const consensusResult = arbiter.synthesizeConsensus(poorTelemetry);
assert.strictEqual(consensusResult.quorumAchieved, true, 'Quórum bizantino debe alcanzarse con múltiples áreas críticas');
assert.strictEqual(consensusResult.verdict, 'BYZANTINE_QUORUM_REACHED');
assert.strictEqual(consensusResult.participatingLenses, 3);
assert(consensusResult.synthesis.length === 3);

// 2. Routine Synthesizer
const synthesizer = new RoutineSynthesizer({ targetDurationMinutes: 15 });
const plan = synthesizer.synthesizeRoutine({
  player: 'TenZ#0001',
  hitDistribution: { head: 14.0, body: 68.0, leg: 18.0 },
  radar: { primerosDuelos: 35, punteriaMecanica: 40 }
});

assert(plan.drillPlan.length > 0, 'Debe sintetizar al menos un ejercicio');
assert(plan.totalRoutineMinutes <= 15.5, 'Rutina no debe superar sustancialmente los 15 minutos');
assert(plan.identifiedWeaknesses.some(w => w.area === 'CROSSHAIR_PLACEMENT'), 'Debe detectar debilidad en crosshair placement debido a leg% > 12%');

console.log('✓ Todas las aserciones de Consensus Arbiter & Routine Synthesizer pasaron exitosamente (Exit Code 0).');
