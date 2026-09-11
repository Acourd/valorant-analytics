'use strict';

const assert = require('assert');
const path = require('path');
const { ConsensusArbiter, TacticalLens } = require(path.join(__dirname, '..', 'scripts', 'consensus_arbiter'));

console.log('=== Test Suite: @valorant-analytics Multi-Lens Deterministic Consensus ===\n');

// 1. Simulación de lente DISIDENTE (no bizantino real)
class RogueDisidentLens extends TacticalLens {
  constructor(name = 'RogueDisidentLens') {
    super(name, 1.0);
    this.faultInjected = true;
  }

  evaluate(telemetry) {
    return {
      lens: this.name,
      priority: 'ADVERSARIAL_DISRUPTION',
      confidence: 0.99,
      recommendation: 'Recomendación contradictoria deliberada del lente disidente.'
    };
  }
}

// 2. Sistema 3+1 (3 lentes normales, 1 disidente) -> quórum determinista
const arbiter = new ConsensusArbiter();
arbiter.lenses.push(new RogueDisidentLens());

const criticalTelemetry = {
  provenance: 'normalized_input',
  pillarsObserved: { precision: true, macro: true, openings: true, economy: true, clutch: true },
  mechanical: { hsPct: 15, kd: 0.8, fk: 1, fd: 5, adr: 95, kast: 58, clutches: 0 },
  radar: {
    precisionMecanica: '30 / 100',
    duelosDeApertura: '28 / 100',
    disciplinaEconomica: '30 / 100',
    macrogamePosicionamiento: '35 / 100',
    composturaClutch: '30 / 100'
  }
};

const res = arbiter.synthesizeConsensus(criticalTelemetry);
assert.strictEqual(res.participatingLenses, 4);
assert.strictEqual(res.quorumAchieved, true);
assert.strictEqual(res.verdict, 'MULTI_LENS_QUORUM_REACHED');
assert.notStrictEqual(res.actionablePriority, 'ADVERSARIAL_DISRUPTION');
console.log('✓ Quórum multi-lente determinista (3/4) ignoró al lente disidente');

// 3. Quórum con telemetría nominal
const nominalTelemetry = {
  provenance: 'normalized_input',
  pillarsObserved: { precision: true, macro: true, openings: true, economy: true, clutch: true },
  mechanical: { hsPct: 30, kd: 1.3, fk: 5, fd: 2, adr: 155, kast: 75, clutches: 2 },
  radar: {
    precisionMecanica: '70 / 100',
    duelosDeApertura: '65 / 100',
    disciplinaEconomica: '70 / 100',
    macrogamePosicionamiento: '70 / 100',
    composturaClutch: '65 / 100'
  }
};

const arbiterNominal = new ConsensusArbiter();
const nomRes = arbiterNominal.synthesizeConsensus(nominalTelemetry);
assert.strictEqual(nomRes.quorumAchieved, false);
assert.strictEqual(nomRes.verdict, 'ALL_LENSES_NOMINAL');
assert.strictEqual(nomRes.actionablePriority, 'MAINTAIN_CURRENT_PLAYSTYLE');
console.log('✓ Telemetría óptima reconocida sin falsos positivos en lentes tácticas');

console.log('\nPASS @valorant-analytics/test_consensus_multilens — Consenso determinista multi-lente verificado (Exit Code 0).');
process.exit(0);
