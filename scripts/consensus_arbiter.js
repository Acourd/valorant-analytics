#!/usr/bin/env node
'use strict';

/**
 * consensus_arbiter.js - Byzantine Multi-Lens Coaching Consensus Engine
 * 
 * Orchestrates 3 independent tactical analytical lenses to synthesize
 * non-contradictory coaching prescriptions via Byzantine Fault Tolerant (BFT) quorum.
 * 
 * Lenses:
 *  1. Aggressive Entry Lens (Pacing & opening space)
 *  2. Economy & Sentinel Lens (Credit discipline & save cycles)
 *  3. Anchor & Utility Lens (Trade discipline & spacing)
 * 
 * Zero external dependencies. Pure Node.js CommonJS.
 */

class TacticalLens {
  constructor(name, weight = 1.0) {
    this.name = name;
    this.weight = weight;
  }

  evaluate(telemetry) {
    throw new Error('Debe implementarse evaluate()');
  }
}

class EntryDuelistLens extends TacticalLens {
  constructor() {
    super('EntryDuelistLens', 1.0);
  }

  evaluate(telemetry) {
    const radar = telemetry.radar || {};
    const firstDuels = radar.primerosDuelos || 50;
    const adr = telemetry.adr || 130;

    let priority = 'PACE_BALANCED';
    let recommendation = 'Ritmo de apertura adecuado.';

    if (firstDuels < 40) {
      priority = 'INCREASE_FIRST_CONTACT';
      recommendation = 'Buscar contacto temprano proactivo con cobertura de utilería.';
    } else if (firstDuels > 70 && adr < 120) {
      priority = 'TEMPER_AGGRESSION';
      recommendation = 'Sobrecarga de duelos iniciales de bajo porcentaje. Esperar sincronía de equipo.';
    }

    return {
      lens: this.name,
      priority,
      confidence: 0.85,
      recommendation
    };
  }
}

class EconomySentinelLens extends TacticalLens {
  constructor() {
    super('EconomySentinelLens', 1.0);
  }

  evaluate(telemetry) {
    const radar = telemetry.radar || {};
    const ecoScore = radar.gestionEconomica || 50;

    let priority = 'ECO_STABLE';
    let recommendation = 'Economía equilibrada.';

    if (ecoScore < 45) {
      priority = 'FORCE_BUY_DISCIPLINE';
      recommendation = 'Eliminar compras forzadas aisladas en rondas semi-eco; sincronizar con el banco del equipo.';
    } else if (ecoScore > 80) {
      priority = 'UPGRADE_INVESTMENT';
      recommendation = 'Banco de créditos saludable: invertir en utilería completa o rifles principales tempranos.';
    }

    return {
      lens: this.name,
      priority,
      confidence: 0.90,
      recommendation
    };
  }
}

class AnchorUtilityLens extends TacticalLens {
  constructor() {
    super('AnchorUtilityLens', 1.0);
  }

  evaluate(telemetry) {
    const radar = telemetry.radar || {};
    const spacing = radar.spacingYTrades || 50;
    const survivability = radar.supervivencia || 50;

    let priority = 'TRADE_STABLE';
    let recommendation = 'Espaciado y trade fragging en rango óptimo.';

    if (spacing < 45 || survivability < 40) {
      priority = 'TIGHTEN_SPACING';
      recommendation = 'Cerrar distancia con el compañero de dúo/anchor; re-peeks aislados penalizados.';
    }

    return {
      lens: this.name,
      priority,
      confidence: 0.88,
      recommendation
    };
  }
}

class ConsensusArbiter {
  constructor() {
    this.lenses = [
      new EntryDuelistLens(),
      new EconomySentinelLens(),
      new AnchorUtilityLens()
    ];
  }

  /**
   * Reconciles proposals from all lenses using BFT quorum logic
   */
  synthesizeConsensus(telemetry) {
    const votes = this.lenses.map(lens => lens.evaluate(telemetry));

    // Agrupar votos por severidad / tipo de intervención
    const criticalActions = votes.filter(v => 
      ['INCREASE_FIRST_CONTACT', 'TEMPER_AGGRESSION', 'FORCE_BUY_DISCIPLINE', 'TIGHTEN_SPACING'].includes(v.priority)
    );

    const quorumAchieved = criticalActions.length >= 2;
    let verdict = quorumAchieved ? 'BYZANTINE_QUORUM_REACHED' : 'UNANIMOUS_STABILITY';

    if (criticalActions.length === 0) {
      verdict = 'ALL_LENSES_NOMINAL';
    }

    const unifiedRecommendations = votes.map(v => `[${v.lens}] ${v.recommendation}`);

    return {
      evaluatedAt: new Date().toISOString(),
      participatingLenses: votes.length,
      verdict,
      quorumAchieved,
      votes,
      actionablePriority: criticalActions.length > 0 ? criticalActions[0].priority : 'MAINTAIN_CURRENT_PLAYSTYLE',
      synthesis: unifiedRecommendations
    };
  }
}

module.exports = {
  ConsensusArbiter,
  TacticalLens,
  EntryDuelistLens,
  EconomySentinelLens,
  AnchorUtilityLens
};

if (require.main === module) {
  const arbiter = new ConsensusArbiter();
  const sampleTelemetry = {
    adr: 105,
    radar: {
      primerosDuelos: 32,
      gestionEconomica: 38,
      spacingYTrades: 41,
      supervivencia: 35
    }
  };

  const report = arbiter.synthesizeConsensus(sampleTelemetry);
  console.log(`[ConsensusArbiter] Veredicto: ${report.verdict} (Quorum: ${report.quorumAchieved})`);
  report.synthesis.forEach(line => console.log(`  • ${line}`));
}
