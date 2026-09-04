#!/usr/bin/env node
'use strict';

/**
 * drift_detector.js - Tactical & Mechanical Drift Entropy Detector
 * 
 * Measures round-by-round mechanical entropy, attack/defense variance,
 * and first engagement drift throughout competitive Valorant matches.
 * Identifies tactical collapse and posture shifts (e.g. passive baiting, dry-peeking).
 * 
 * Zero external dependencies. Pure Node.js CommonJS.
 */

class DriftDetector {
  constructor() {}

  /**
   * Calculates Shannon entropy of a probability distribution
   */
  calculateEntropy(probabilities) {
    let entropy = 0;
    for (const p of probabilities) {
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }
    return Number(entropy.toFixed(3));
  }

  /**
   * Evaluates Attack vs Defense performance divergence
   */
  evaluateSideDivergence(rounds, targetPlayer) {
    if (!rounds || !Array.isArray(rounds) || rounds.length === 0) {
      return { divergenceScore: 0, attackAdvantage: 0, classification: 'NO_DATA' };
    }

    let atkKills = 0, atkDeaths = 0, atkDamage = 0, atkRounds = 0;
    let defKills = 0, defDeaths = 0, defDamage = 0, defRounds = 0;

    rounds.forEach((r, idx) => {
      // First 12 rounds: typically side 1 (Attack or Defense). Standard match: 1-12, 13-24
      const isAttack = r.playerSide ? r.playerSide.toLowerCase() === 'attack' : idx < 12;
      const pStat = (r.playerStats || []).find(p => (p.player || p.puuid) === targetPlayer);

      if (isAttack) {
        atkRounds++;
        if (pStat) {
          atkKills += (pStat.kills ? pStat.kills.length : (pStat.killsCount || 0));
          atkDeaths += (pStat.wasKilled ? 1 : 0);
          atkDamage += (pStat.damage || pStat.score || 0);
        }
      } else {
        defRounds++;
        if (pStat) {
          defKills += (pStat.kills ? pStat.kills.length : (pStat.killsCount || 0));
          defDeaths += (pStat.wasKilled ? 1 : 0);
          defDamage += (pStat.damage || pStat.score || 0);
        }
      }
    });

    const atkADR = atkRounds > 0 ? Number((atkDamage / atkRounds).toFixed(1)) : 0;
    const defADR = defRounds > 0 ? Number((defDamage / defRounds).toFixed(1)) : 0;
    const atkKD = atkDeaths > 0 ? Number((atkKills / atkDeaths).toFixed(2)) : atkKills;
    const defKD = defDeaths > 0 ? Number((defKills / defDeaths).toFixed(2)) : defKills;

    const adrDiff = Math.abs(atkADR - defADR);
    const maxADR = Math.max(1, Math.max(atkADR, defADR));
    const divergencePct = Math.min(100, Number(((adrDiff / maxADR) * 100).toFixed(1)));

    let classification = 'BALANCED_EXECUTION';
    if (divergencePct > 35) {
      classification = atkADR > defADR ? 'ATTACK_OVERINDEXED' : 'DEFENSE_ANCHOR_HEAVY';
    }

    return {
      attack: { rounds: atkRounds, kills: atkKills, deaths: atkDeaths, adr: atkADR, kd: atkKD },
      defense: { rounds: defRounds, kills: defKills, deaths: defDeaths, adr: defADR, kd: defKD },
      divergenceScore: divergencePct,
      classification
    };
  }

  /**
   * Analyzes round quadrant momentum drift across 4 match quarters
   */
  evaluateQuarterDrift(rounds, targetPlayer) {
    if (!rounds || !Array.isArray(rounds) || rounds.length < 4) {
      return { quarters: [], entropy: 0, driftDetected: false };
    }

    const quarterSize = Math.ceil(rounds.length / 4);
    const quarters = [];

    for (let q = 0; q < 4; q++) {
      const slice = rounds.slice(q * quarterSize, (q + 1) * quarterSize);
      let kills = 0;
      let deaths = 0;

      slice.forEach(r => {
        const pStat = (r.playerStats || []).find(p => (p.player || p.puuid) === targetPlayer);
        if (pStat) {
          kills += (pStat.kills ? pStat.kills.length : (pStat.killsCount || 0));
          deaths += (pStat.wasKilled ? 1 : 0);
        }
      });

      quarters.push({
        quarter: q + 1,
        roundsCount: slice.length,
        kills,
        deaths,
        diff: kills - deaths
      });
    }

    const totalKills = quarters.reduce((acc, q) => acc + q.kills, 0);
    const probs = quarters.map(q => totalKills > 0 ? q.kills / totalKills : 0.25);
    const entropy = this.calculateEntropy(probs);

    // Max entropy for 4 uniform bins is log2(4) = 2.0
    // Low entropy (< 1.5) implies high concentration/inconsistency
    const driftDetected = entropy < 1.6 && totalKills >= 8;

    return {
      quarters,
      killDistributionEntropy: entropy,
      maxPossibleEntropy: 2.0,
      driftDetected,
      diagnosis: driftDetected
        ? 'Deriva mecánica detectada: Rendimiento altamente concentrado en un solo tramo de la partida.'
        : 'Distribución de impacto estable y homogénea a lo largo de los cuartos.'
    };
  }

  /**
   * Full drift telemetry audit
   */
  auditMatchDrift(matchData, targetPlayer) {
    let rounds = matchData.rounds || [];

    if (rounds.length === 0 && matchData.data && Array.isArray(matchData.data.segments)) {
      const roundSummaries = matchData.data.segments.filter(s => s.type === 'round-summary');
      const playerRounds = matchData.data.segments.filter(s => s.type === 'player-round');

      rounds = roundSummaries.map(rs => {
        const rNum = rs.attributes?.round;
        const prs = playerRounds.filter(p => p.attributes?.round === rNum);
        const myRound = prs.find(p => (p.attributes?.platformUserIdentifier || '').toLowerCase() === (targetPlayer || '').toLowerCase());

        return {
          roundNumber: rNum,
          playerSide: myRound?.metadata?.teamSide || (rNum <= 12 ? 'attack' : 'defense'),
          playerStats: prs.map(p => ({
            player: p.attributes?.platformUserIdentifier,
            kills: p.stats?.kills?.value ? Array(p.stats.kills.value).fill({}) : [],
            killsCount: p.stats?.kills?.value || 0,
            wasKilled: (p.stats?.deaths?.value || 0) > 0,
            damage: p.stats?.damage?.value || 0
          }))
        };
      });
    }

    const side = this.evaluateSideDivergence(rounds, targetPlayer);
    const quarter = this.evaluateQuarterDrift(rounds, targetPlayer);

    return {
      player: targetPlayer,
      sideDivergence: side,
      quarterDrift: quarter,
      overallStability: (100 - (side.divergenceScore * 0.5 + (quarter.driftDetected ? 30 : 0))).toFixed(1),
      summary: `${side.classification} | Entropía: ${quarter.killDistributionEntropy}/2.0`
    };
  }
}

module.exports = {
  DriftDetector
};

if (require.main === module) {
  const detector = new DriftDetector();
  const dummyRounds = Array.from({ length: 20 }, (_, i) => ({
    playerSide: i < 10 ? 'Attack' : 'Defense',
    playerStats: [
      {
        player: 'TenZ#0001',
        killsCount: i < 5 ? 2 : (i < 10 ? 0 : 1),
        wasKilled: i % 2 === 0,
        damage: i < 5 ? 220 : (i < 10 ? 80 : 140)
      }
    ]
  }));

  const report = detector.auditMatchDrift({ rounds: dummyRounds }, 'TenZ#0001');
  console.log(`[DriftDetector] Estabilidad: ${report.overallStability}% -> ${report.summary}`);
}
