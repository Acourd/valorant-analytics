'use strict';

const assert = require('assert');
const path = require('path');
const { ConsensusArbiter, TacticalLens } = require(path.join(__dirname, '..', 'scripts', 'consensus_arbiter'));

console.log('=== Test Suite: @valorant-analytics Byzantine Fault Tolerance Engine ===\n');

// 1. Simulación de lente bizantina maliciosa / equivocante
class RogueByzantineLens extends TacticalLens {
  constructor(name = 'RogueByzantineLens') {
    super(name, 1.0);
    this.faultInjected = true;
  }

  evaluate(telemetry) {
    return {
      lens: this.name,
      priority: 'ADVERSARIAL_DISRUPTION',
      confidence: 0.99,
      recommendation: 'Inyección bizantina deliberada de prescripción contradictoria.'
    };
  }
}

// 2. Sistema 3+1 (3 honestos, 1 bizantino) -> Quórum sostenido
const arbiter = new ConsensusArbiter();
arbiter.lenses.push(new RogueByzantineLens());

const criticalTelemetry = {
  adr: 95,
  radar: {
    primerosDuelos: 28,
    gestionEconomica: 30,
    spacingYTrades: 35,
    supervivencia: 30
  }
};

const res = arbiter.synthesizeConsensus(criticalTelemetry);
assert.strictEqual(res.participatingLenses, 4);
assert.strictEqual(res.quorumAchieved, true);
assert.strictEqual(res.verdict, 'BYZANTINE_QUORUM_REACHED');
assert.notStrictEqual(res.actionablePriority, 'ADVERSARIAL_DISRUPTION');
console.log('✓ Quórum bizantino BFT (3/4) toleró la inyección de 1 lente adversarial disidente');

// 3. Quórum con telemetría nominal
const nominalTelemetry = {
  adr: 155,
  radar: {
    primerosDuelos: 60,
    gestionEconomica: 65,
    spacingYTrades: 70,
    supervivencia: 65
  }
};

const arbiterNominal = new ConsensusArbiter();
const nomRes = arbiterNominal.synthesizeConsensus(nominalTelemetry);
assert.strictEqual(nomRes.quorumAchieved, false);
assert.strictEqual(nomRes.verdict, 'ALL_LENSES_NOMINAL');
assert.strictEqual(nomRes.actionablePriority, 'MAINTAIN_CURRENT_PLAYSTYLE');
console.log('✓ Telemetría óptima reconocida sin falsos positivos en lentes tácticas');

console.log('\nPASS @valorant-analytics/test_byzantine_fault — Tolerancia a fallos bizantinos verificada (Exit Code 0).');
process.exit(0);
