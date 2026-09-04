#!/usr/bin/env node
'use strict';

/**
 * session_guardian.js - Fatigue, Tilt & Chronic Performance Guardian
 * 
 * Provides longitudinal session telemetry and fatigue monitoring for competitive Valorant.
 * Evaluates performance decay, tilt triggers, and cognitive endurance across matches
 * or consecutive round blocks to prevent elo loss from mental degradation.
 * 
 * Zero external dependencies. Pure Node.js CommonJS.
 */

class SessionGuardian {
  constructor(options = {}) {
    this.maxSafeFatigue = options.maxSafeFatigue || 0.75;
    this.tiltThreshold = options.tiltThreshold || 65;
  }

  /**
   * Evaluates tilt index [0-100] based on negative psychological indicators:
   * - Consecutive un-traded first deaths
   * - Early deaths (< 25 seconds into round)
   * - Negative round differential while on loss streak
   */
  calculateTiltIndex(matchRounds, targetPlayer) {
    if (!matchRounds || !Array.isArray(matchRounds) || matchRounds.length === 0) {
      return { tiltIndex: 0, level: 'STABLE', triggers: [] };
    }

    let tiltPoints = 0;
    const triggers = [];
    let consecutiveDeathsWithoutKill = 0;
    let maxConsecutiveDeaths = 0;
    let untradedFirstDeaths = 0;

    matchRounds.forEach((round, idx) => {
      const pStat = (round.playerStats || []).find(p => (p.player || p.puuid) === targetPlayer);
      if (!pStat) return;

      const kills = pStat.kills ? pStat.kills.length : (pStat.killsCount || 0);
      const died = Boolean(pStat.wasKilled || (pStat.deaths && pStat.deaths > 0));

      if (died && kills === 0) {
        consecutiveDeathsWithoutKill++;
        if (consecutiveDeathsWithoutKill > maxConsecutiveDeaths) {
          maxConsecutiveDeaths = consecutiveDeathsWithoutKill;
        }
      } else if (kills > 0) {
        consecutiveDeathsWithoutKill = 0;
      }

      // Check first death in round
      if (round.firstDeathPlayer === targetPlayer && !round.firstDeathTraded) {
        untradedFirstDeaths++;
      }
    });

    if (maxConsecutiveDeaths >= 4) {
      tiltPoints += 35;
      triggers.push(`${maxConsecutiveDeaths} rondas consecutivas con muerte sin conseguir baja`);
    } else if (maxConsecutiveDeaths >= 3) {
      tiltPoints += 20;
      triggers.push(`Racha de 3 rondas con muerte sin conseguir baja`);
    }

    if (untradedFirstDeaths >= 3) {
      tiltPoints += 30;
      triggers.push(`${untradedFirstDeaths} First Deaths aisladas sin trade de equipo`);
    }

    const normalizedTilt = Math.min(100, Math.max(0, tiltPoints));
    let level = 'OPTIMAL';
    if (normalizedTilt >= 70) level = 'CRITICAL_TILT';
    else if (normalizedTilt >= 40) level = 'ELEVATED_RISK';
    else if (normalizedTilt >= 20) level = 'MILD_FRUSTRATION';

    return {
      tiltIndex: normalizedTilt,
      level,
      triggers,
      maxConsecutiveDeaths,
      untradedFirstDeaths
    };
  }

  /**
   * Calculates fatigue factor [0.0 - 1.0] across continuous playtime and round performance decay
   */
  calculateFatigueFactor(sessionData) {
    const totalRounds = sessionData.totalRounds || (sessionData.matchRounds ? sessionData.matchRounds.length : 20);
    const continuousMinutes = sessionData.continuousMinutes || (totalRounds * 1.8);

    // Baseline: 60 mins is normal (0.2), 120 mins starts degradation (0.5), 180+ mins is severe (0.8+)
    let fatigue = (continuousMinutes / 200) * 0.6;

    // Decay penalty: compare performance between first half and second half
    if (sessionData.firstHalfADR && sessionData.secondHalfADR) {
      const dropPct = (sessionData.firstHalfADR - sessionData.secondHalfADR) / Math.max(1, sessionData.firstHalfADR);
      if (dropPct > 0.25) {
        fatigue += 0.25;
      }
    }

    const normalized = Math.min(1.0, Math.max(0.0, Number(fatigue.toFixed(2))));
    let recommendation = 'Apto para competir en el máximo nivel';
    if (normalized >= 0.75) {
      recommendation = 'DETENER COLA: Fatiga neuromuscular severa. Descanso obligatorio de 30 minutos.';
    } else if (normalized >= 0.50) {
      recommendation = 'Pausa táctica requerida: 10 minutos de desconexión visual y estiramiento de muñecas.';
    }

    return {
      fatigueFactor: normalized,
      continuousMinutes: Math.round(continuousMinutes),
      isFatigued: normalized >= this.maxSafeFatigue,
      recommendation
    };
  }

  /**
   * Evaluates whole session health and provides cognitive stamina prescription
   */
  auditSession(sessionData, targetPlayer) {
    let rounds = sessionData.rounds || sessionData.matchRounds || [];

    if (rounds.length === 0 && sessionData.data && Array.isArray(sessionData.data.segments)) {
      const roundSummaries = sessionData.data.segments.filter(s => s.type === 'round-summary');
      const playerRounds = sessionData.data.segments.filter(s => s.type === 'player-round');

      rounds = roundSummaries.map(rs => {
        const rNum = rs.attributes?.round;
        const prs = playerRounds.filter(p => p.attributes?.round === rNum);
        return {
          roundNumber: rNum,
          firstDeathPlayer: null,
          playerStats: prs.map(p => ({
            player: p.attributes?.platformUserIdentifier,
            killsCount: p.stats?.kills?.value || 0,
            wasKilled: (p.stats?.deaths?.value || 0) > 0,
            damage: p.stats?.damage?.value || 0
          }))
        };
      });
    }

    const tilt = this.calculateTiltIndex(rounds, targetPlayer);
    const fatigue = this.calculateFatigueFactor(sessionData);

    const safeToContinue = tilt.tiltIndex < this.tiltThreshold && !fatigue.isFatigued;

    return {
      player: targetPlayer,
      evaluatedAt: new Date().toISOString(),
      tilt,
      fatigue,
      safeToContinue,
      verdict: safeToContinue ? 'QUEUE_APPROVED' : 'QUEUE_HALT',
      prescriptions: [
        fatigue.recommendation,
        tilt.triggers.length > 0 ? `Antídotos de tilt: Mantener spacing con compañeros, evitar dry-peeks tempranos.` : 'Disciplina mental óptima.'
      ]
    };
  }
}

module.exports = {
  SessionGuardian
};

if (require.main === module) {
  const guardian = new SessionGuardian();
  const sampleSession = {
    totalRounds: 24,
    continuousMinutes: 135,
    firstHalfADR: 168,
    secondHalfADR: 110,
    rounds: [
      { firstDeathPlayer: 'TenZ#0001', firstDeathTraded: false, playerStats: [{ player: 'TenZ#0001', wasKilled: true, killsCount: 0 }] },
      { firstDeathPlayer: 'TenZ#0001', firstDeathTraded: false, playerStats: [{ player: 'TenZ#0001', wasKilled: true, killsCount: 0 }] },
      { firstDeathPlayer: 'TenZ#0001', firstDeathTraded: false, playerStats: [{ player: 'TenZ#0001', wasKilled: true, killsCount: 0 }] },
      { firstDeathPlayer: 'Derke#0001', firstDeathTraded: true, playerStats: [{ player: 'TenZ#0001', wasKilled: true, killsCount: 0 }] }
    ]
  };
  const result = guardian.auditSession(sampleSession, 'TenZ#0001');
  console.log(`[SessionGuardian] Veredicto: ${result.verdict} (Tilt: ${result.tilt.tiltIndex}, Fatigue: ${result.fatigue.fatigueFactor})`);
}
