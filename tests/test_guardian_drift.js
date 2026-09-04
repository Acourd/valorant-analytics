#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { SessionGuardian } = require(path.join(__dirname, '..', 'scripts', 'session_guardian'));
const { DriftDetector } = require(path.join(__dirname, '..', 'scripts', 'drift_detector'));

console.log('[TEST] Iniciando verificación de Session Guardian & Drift Detector...');

// 1. Session Guardian (Tilt & Fatigue)
const guardian = new SessionGuardian();
const dummyRounds = [
  { firstDeathPlayer: 'TenZ#0001', firstDeathTraded: false, playerStats: [{ player: 'TenZ#0001', wasKilled: true, killsCount: 0 }] },
  { firstDeathPlayer: 'TenZ#0001', firstDeathTraded: false, playerStats: [{ player: 'TenZ#0001', wasKilled: true, killsCount: 0 }] },
  { firstDeathPlayer: 'TenZ#0001', firstDeathTraded: false, playerStats: [{ player: 'TenZ#0001', wasKilled: true, killsCount: 0 }] },
  { firstDeathPlayer: 'TenZ#0001', firstDeathTraded: false, playerStats: [{ player: 'TenZ#0001', wasKilled: true, killsCount: 0 }] }
];

const tiltAudit = guardian.calculateTiltIndex(dummyRounds, 'TenZ#0001');
assert(tiltAudit.tiltIndex >= 50, 'Tilt index debe superar 50 ante 4 muertes consecutivas y FB aislados');
assert(['ELEVATED_RISK', 'CRITICAL_TILT'].includes(tiltAudit.level), 'Nivel de tilt debe reflejar riesgo elevado');

const fatigueAudit = guardian.calculateFatigueFactor({ totalRounds: 40, continuousMinutes: 180, firstHalfADR: 170, secondHalfADR: 110 });
assert(fatigueAudit.fatigueFactor >= 0.70, 'Fatiga debe ser severa tras 180 minutos con caída de ADR');

// 2. Drift Detector
const detector = new DriftDetector();
const entropy = detector.calculateEntropy([0.25, 0.25, 0.25, 0.25]);
assert.strictEqual(entropy, 2.0, 'Entropía de 4 bins idénticos debe ser exactamente 2.0');

const biasedEntropy = detector.calculateEntropy([1.0, 0.0, 0.0, 0.0]);
assert.strictEqual(biasedEntropy, 0.0, 'Entropía de distribución completamente sesgada debe ser 0.0');

const matchRounds = Array.from({ length: 24 }, (_, i) => ({
  playerSide: i < 12 ? 'Attack' : 'Defense',
  playerStats: [
    {
      player: 'TenZ#0001',
      killsCount: i < 12 ? 1 : 2,
      wasKilled: true,
      damage: i < 12 ? 100 : 180
    }
  ]
}));

const sideDivergence = detector.evaluateSideDivergence(matchRounds, 'TenZ#0001');
assert(sideDivergence.divergenceScore > 0, 'Debe detectar divergencia numérica entre Attack y Defense');
assert(typeof sideDivergence.classification === 'string');

console.log('✓ Todas las aserciones de Session Guardian & Drift Detector pasaron exitosamente (Exit Code 0).');
