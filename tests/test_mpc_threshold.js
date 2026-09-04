'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { MpcThresholdSigner } = require('../scripts/mpc_threshold_signer.js');

console.log('=== Test Suite: @valorant-analytics/mpc_threshold DSSE Engine ===\n');

function makeKey() {
  return crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
}

// 1. Setup 3 independent keyholders
const kCoach = makeKey();
const kCaptain = makeKey();
const kAnalyst = makeKey();

const mpc = new MpcThresholdSigner({ threshold: 2 });
mpc.registerKeyholder('coach-key', kCoach.publicKey);
mpc.registerKeyholder('captain-key', kCaptain.publicKey);
mpc.registerKeyholder('analyst-key', kAnalyst.publicKey);

const matchTelemetryStatement = {
  _type: 'https://in-toto.io/Statement/v1',
  subject: [{ name: 'match_telemetry_report.json', digest: { sha256: 'c'.repeat(64) } }],
  predicateType: 'https://slsa.dev/provenance/v1',
  predicate: { matchId: 'vct-finals-match-101', certifiedBy: 'Multi-Party-Coaching-Staff' }
};

// 2. 2-of-3 threshold signature
const envelope = MpcThresholdSigner.signMultiPartyEnvelope(matchTelemetryStatement, [
  { keyId: 'coach-key', privateKeyPem: kCoach.privateKey },
  { keyId: 'captain-key', privateKeyPem: kCaptain.privateKey }
]);

const verif = mpc.verifyThreshold(envelope, 2);
assert.strictEqual(verif.verified, true);
assert.strictEqual(verif.validSignaturesCount, 2);
assert.strictEqual(verif.verdict, 'THRESHOLD_MET_ADMISSION_GRANTED');
console.log('✓ Atestación multi-parte 2-de-3 verificada exitosamente (THRESHOLD_MET_ADMISSION_GRANTED)');

// 3. Insufficient signatures rejected
const envelopeSingle = MpcThresholdSigner.signMultiPartyEnvelope(matchTelemetryStatement, [
  { keyId: 'coach-key', privateKeyPem: kCoach.privateKey }
]);
const verifSingle = mpc.verifyThreshold(envelopeSingle, 2);
assert.strictEqual(verifSingle.verified, false);
assert.strictEqual(verifSingle.verdict, 'INSUFFICIENT_SIGNATURES_FAIL_CLOSED');
console.log('✓ Insuficiencia de firmas interceptada fail-closed');

console.log('\nPASS @valorant-analytics/test_mpc_threshold — Firma de umbral MPC verificada (Exit Code 0).');
process.exit(0);
