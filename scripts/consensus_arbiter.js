#!/usr/bin/env node
'use strict';

/**
 * consensus_arbiter.js - Multi-Lens Coaching Consensus Engine (determinista)
 *
 * Arbitraje multi-lente sobre el CONTRATO REAL de `learning_profile`:
 *   - `radar` (claves precisionMecanica, duelosDeApertura, disciplinaEconomica,
 *     macrogamePosicionamiento, composturaClutch) como "N / 100".
 *   - `pillarsObserved` (qué pilares tienen métrica OBSERVADA).
 *   - `mechanical` (FK/FD/ADR/HS% observados) y `provenance`.
 *
 * Sin defaults plausibles: un lente sin métrica observada vota
 * `INSUFFICIENT_EVIDENCE` y el veredicto global lo declara, en lugar de
 * inventar estabilidad o quórum.
 *
 * Zero external dependencies. Pure Node.js CommonJS.
 */

const { provenanceLabel } = require('./data_contract');

function radarScore(profile, key) {
  const raw = profile && profile.radar ? profile.radar[key] : null;
  const m = String(raw === undefined || raw === null ? '' : raw).match(/(\d+)\s*\/\s*100/);
  return m ? parseInt(m[1], 10) : null;
}

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

  evaluate(profile) {
    const observed = (profile.pillarsObserved || {}).openings;
    const mech = profile.mechanical || {};
    if (!observed) {
      return { lens: this.name, priority: 'INSUFFICIENT_EVIDENCE', confidence: 0, recommendation: 'Sin FK/FD observados: no se emite lectura de aperturas.', missing: ['firstKills/firstDeaths'] };
    }
    const score = radarScore(profile, 'duelosDeApertura');
    const fdOverFk = (mech.fd !== null && mech.fd !== undefined && mech.fk !== null && mech.fk !== undefined) ? mech.fd > mech.fk : null;
    let priority = 'PACE_BALANCED';
    let recommendation = 'Ritmo de apertura dentro de lo observado.';
    if (fdOverFk === true || (score !== null && score < 40)) {
      priority = 'INCREASE_FIRST_CONTACT';
      recommendation = 'Déficit de apertura observado (FD>FK o score < 40): revisar entradas sin utilidad de soporte.';
    } else if (score !== null && score > 70 && mech.adr !== null && mech.adr !== undefined && mech.adr < 120) {
      priority = 'TEMPER_AGGRESSION';
      recommendation = 'Contacto temprano alto con ADR observado bajo: sincronizar con el equipo.';
    }
    return { lens: this.name, priority, confidence: 0.8, recommendation, evidence: { score, fk: mech.fk, fd: mech.fd, adr: mech.adr } };
  }
}

class EconomySentinelLens extends TacticalLens {
  constructor() {
    super('EconomySentinelLens', 1.0);
  }

  evaluate(profile) {
    const observed = (profile.pillarsObserved || {}).economy;
    if (!observed) {
      return { lens: this.name, priority: 'INSUFFICIENT_EVIDENCE', confidence: 0, recommendation: 'Sin tiers económicos observados: no se emite lectura de economía.', missing: ['economia (buy-tiers por ronda)'] };
    }
    const score = radarScore(profile, 'disciplinaEconomica');
    let priority = 'ECO_STABLE';
    let recommendation = 'Economía dentro de lo observado.';
    if (score !== null && score < 45) {
      priority = 'FORCE_BUY_DISCIPLINE';
      recommendation = 'Conversión económica baja observada: evitar compras forzadas aisladas.';
    } else if (score !== null && score > 80) {
      priority = 'UPGRADE_INVESTMENT';
      recommendation = 'Conversión económica alta observada: invertir en utilería completa o rifles tempranos.';
    }
    return { lens: this.name, priority, confidence: 0.85, recommendation, evidence: { score } };
  }
}

class AnchorUtilityLens extends TacticalLens {
  constructor() {
    super('AnchorUtilityLens', 1.0);
  }

  evaluate(profile) {
    const observed = profile.pillarsObserved || {};
    if (!observed.macro || !observed.clutch) {
      return { lens: this.name, priority: 'INSUFFICIENT_EVIDENCE', confidence: 0, recommendation: 'Sin KAST/ADR y datos de clutch observados: no se emite lectura de anclaje.', missing: ['kast+adr', 'clutches'] };
    }
    const macro = radarScore(profile, 'macrogamePosicionamiento');
    const clutch = radarScore(profile, 'composturaClutch');
    let priority = 'SPACING_STABLE';
    let recommendation = 'KAST/ADR y clutch observados dentro de rangos documentados (sin datos de tradeo por ronda ni timestamps).';
    if ((macro !== null && macro < 45) || (clutch !== null && clutch < 40)) {
      priority = 'TIGHTEN_SPACING';
      recommendation = 'Macro (<45) o clutch (<40) observados bajo umbral: cerrar distancia con el compañero y evitar re-peeks aislados.';
    }
    return {
      lens: this.name,
      priority,
      confidence: 0.8,
      recommendation,
      evidence: { macro, clutch },
      metric: 'KAST/ADR (macro) y clutches observados',
      threshold: 'macro < 45 o clutch < 40',
      limitation: 'No hay eventos de tradeo ni timestamps: la recomendación es de espaciado, no de tiempos.'
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
   * Reconcilia los votos de los lentes con quórum DETERMINISTA entre 3 lentes
 * locales. NO es tolerancia bizantina real: no hay nodos remotos, firmas
 * cruzadas ni adversarios externos. Si algún
   * lente carece de evidencia observada, el veredicto lo declara.
   */
  synthesizeConsensus(profile) {
    const votes = this.lenses.map(lens => lens.evaluate(profile));
    const insufficient = votes.filter(v => v.priority === 'INSUFFICIENT_EVIDENCE');
    const provenance = (profile && profile.provenance) || 'normalized_input';
    const synthesis = votes.map(v => `[${v.lens}] ${v.recommendation}`);

    if (insufficient.length > 0) {
      return {
        evaluatedAt: new Date().toISOString(),
        participatingLenses: votes.length - insufficient.length,
        verdict: 'INSUFFICIENT_EVIDENCE',
        quorumAchieved: false,
        votes,
        actionablePriority: 'NONE',
        missing: [...new Set(insufficient.flatMap(v => v.missing || []))],
        provenance,
        provenanceLabel: provenanceLabel(provenance),
        synthesis
      };
    }

    const criticalActions = votes.filter(v =>
      ['INCREASE_FIRST_CONTACT', 'TEMPER_AGGRESSION', 'FORCE_BUY_DISCIPLINE', 'TIGHTEN_SPACING'].includes(v.priority)
    );

    const quorumAchieved = criticalActions.length >= 2;
    let verdict = quorumAchieved ? 'MULTI_LENS_QUORUM_REACHED' : 'UNANIMOUS_STABILITY';
    if (criticalActions.length === 0) verdict = 'ALL_LENSES_NOMINAL';

    return {
      evaluatedAt: new Date().toISOString(),
      participatingLenses: votes.length,
      verdict,
      quorumAchieved,
      votes,
      actionablePriority: criticalActions.length > 0 ? criticalActions[0].priority : 'MAINTAIN_CURRENT_PLAYSTYLE',
      missing: [],
      provenance,
      provenanceLabel: provenanceLabel(provenance),
      synthesis
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
