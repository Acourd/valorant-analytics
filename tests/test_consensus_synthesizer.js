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

// 2. Routine Synthesizer (contrato de evidencia mecánica observada)
const synthesizer = new RoutineSynthesizer({ targetDurationMinutes: 15 });
const plan = synthesizer.synthesizeRoutine({
  player: 'TenZ#0001',
  provenance: 'normalized_input',
  mechanical: { hsPct: 14.0, fk: 1, fd: 4, acs: 200, legPct: 18.0 }
});

assert.strictEqual(plan.omitted, false, 'Con evidencia observada debe sintetizar');
assert(plan.drillPlan.length > 0, 'Debe sintetizar al menos un ejercicio');
assert(plan.totalRoutineMinutes <= 15.5, 'Rutina no debe superar sustancialmente los 15 minutos');
assert(plan.identifiedWeaknesses.some(w => w.area === 'MICRO_ADJUSTMENT'), 'HS bajo debe detectar micro-ajuste');
assert(plan.identifiedWeaknesses.some(w => w.area === 'ANGLE_ISOLATION'), 'FD>FK debe detectar apertura');
assert.ok(/normali/i.test(plan.provenanceLabel), 'Procedencia visible');
assert(plan.omitted === false && plan.identifiedWeaknesses.every(w => w.enablingMetric), 'Cada debilidad cita su métrica habilitante');
// Sin evidencia mecánica: omitir, sin defaults.
const omitted = synthesizer.synthesizeRoutine({ player: 'X#1', provenance: 'normalized_input' });
assert.strictEqual(omitted.omitted, true, 'Sin evidencia debe omitir');
assert.deepStrictEqual(omitted.drillPlan, []);
assert.ok(omitted.missingMetrics.length > 0, 'Debe declarar métricas faltantes');

console.log('✓ Todas las aserciones de Consensus Arbiter & Routine Synthesizer pasaron exitosamente (Exit Code 0).');
