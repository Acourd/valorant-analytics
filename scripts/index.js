#!/usr/bin/env node
'use strict';

/**
 * index.js — Punto de entrada de BIBLIOTECA de valorant-analytics.
 *
 * Importar este módulo NO ejecuta la CLI ni imprime nada: expone el motor
 * determinista para uso programático. La interfaz de línea de comandos vive en
 * `cli.js` (bin `valorant-analytics`) y solo se ejecuta con `require.main`.
 *
 * Zero dependencias externas.
 */

const { evaluateLearningProfile } = require('./learning_profile');
const { auditDuoSynergy } = require('./duo_synergy');
const { parseDuels } = require('./duel_matrix');
const { analyzeEconomy } = require('./economy_analyzer');
const { generateKovaaksRoutine } = require('./kovaaks_generator');
const { analyzeWeaponTelemetry } = require('./weapon_telemetry');
const { generateCoachingReport } = require('./coaching_engine');
const {
  validateRadar,
  validateHitZones,
  validateLearningProfile,
  validateWeaponTelemetry,
  validateDuoSynergy,
  validateDuelMatrix,
  InvariantViolationError
} = require('./invariant_validator');
const {
  classifyEvidence,
  observeMatchTelemetry,
  observeDuelRows,
  observeVerifiedMatch,
  ingestVerifiedMatch,
  stableRef,
  canonicalStringify
} = require('./evidence_policy');
const {
  PROVENANCE,
  LABELS,
  normalizeHandleKey,
  resolveExactHandle,
  sourceProvenance,
  provenanceLabel,
  mayAssertCauses,
  observedNumber
} = require('./data_contract');
const {
  parseTextScoreboard,
  assembleRawMatchStructure,
  resolveMatchDataResilient
} = require('./universal_ingestor');
const { SessionGuardian } = require('./session_guardian');
const { DriftDetector } = require('./drift_detector');
const { ConsensusArbiter } = require('./consensus_arbiter');
const { RoutineSynthesizer } = require('./routine_synthesizer');
const routineContract = require('./routine_contract');
const { buildEvidence, canGenerateRoutine, evaluateWeaknesses } = require('./routine_contract');
const { runCli } = require('./cli');

module.exports = {
  // Motores
  evaluateLearningProfile,
  auditDuoSynergy,
  parseDuels,
  analyzeEconomy,
  generateKovaaksRoutine,
  analyzeWeaponTelemetry,
  generateCoachingReport,
  // Política de evidencia y contrato de datos
  classifyEvidence,
  observeMatchTelemetry,
  observeDuelRows,
  observeVerifiedMatch,
  ingestVerifiedMatch,
  stableRef,
  canonicalStringify,
  PROVENANCE,
  LABELS,
  normalizeHandleKey,
  resolveExactHandle,
  sourceProvenance,
  provenanceLabel,
  mayAssertCauses,
  observedNumber,
  // Ingesta
  parseTextScoreboard,
  assembleRawMatchStructure,
  resolveMatchDataResilient,
  // Observabilidad longitudinal
  SessionGuardian,
  DriftDetector,
  ConsensusArbiter,
  RoutineSynthesizer,
  // Contrato de rutinas
  buildEvidence,
  canGenerateRoutine,
  evaluateWeaknesses,
  routineContract,
  // Invariantes
  validateRadar,
  validateHitZones,
  validateLearningProfile,
  validateWeaponTelemetry,
  validateDuoSynergy,
  validateDuelMatrix,
  InvariantViolationError,
  // CLI programática
  runCli
};
