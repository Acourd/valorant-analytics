#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const {
  signTelemetryReport,
  verifyTelemetryAttestation,
  generateAttestationKeyPair
} = require(path.join(__dirname, '..', 'scripts', 'dsse_attestation'));
const {
  MerkleTree,
  sha256,
  buildMatchMerkleLedger
} = require(path.join(__dirname, '..', 'scripts', 'merkle_ledger'));

console.log('[TEST] Iniciando verificación de DSSE Attestation & Merkle Ledger...');

// 1. DSSE Attestation
const sampleReport = {
  player: 'TenZ#0001',
  map: 'Bind',
  agent: 'Jett',
  rank: 'Radiant',
  radar: { primerosDuelos: 85, punteriaMecanica: 90 }
};

const keyPair = generateAttestationKeyPair();
const envelope = signTelemetryReport(sampleReport, keyPair);

assert.strictEqual(envelope.payloadType, 'application/vnd.in-toto+json');
assert(Array.isArray(envelope.signatures) && envelope.signatures.length > 0);

const verification = verifyTelemetryAttestation(envelope);
assert.strictEqual(verification.verified, true, 'La firma Ed25519 sobre PAE debe ser válida');
assert.strictEqual(verification.statement.subject[0].name, 'TenZ#0001');

// 2. Tamper resistance
const tamperedEnvelope = JSON.parse(JSON.stringify(envelope));
tamperedEnvelope.payload = Buffer.from(JSON.stringify({ hacked: true })).toString('base64');
const tamperedVerification = verifyTelemetryAttestation(tamperedEnvelope);
assert.strictEqual(tamperedVerification.verified, false, 'Payload alterado debe fallar verificación');

// 3. Merkle Tree & Proofs
const events = [
  { round: 1, type: 'first_blood', killer: 'TenZ#0001', victim: 'Chronicle#0001' },
  { round: 1, type: 'plant', site: 'A' },
  { round: 2, type: 'defuse', player: 'Derke#0001' }
];
const tree = new MerkleTree(events);
const root = tree.getRoot();
assert(typeof root === 'string' && root.length === 64, 'Merkle root debe ser un SHA-256 válido');

const proof = tree.getProof(0);
const leaf0 = sha256(events[0]);
const validProof = MerkleTree.verifyProof(leaf0, proof, root);
assert.strictEqual(validProof, true, 'Prueba de inclusión Merkle debe verificar con éxito');

const fakeLeaf = sha256({ fake: true });
const invalidProof = MerkleTree.verifyProof(fakeLeaf, proof, root);
assert.strictEqual(invalidProof, false, 'Hoja falsificada no debe verificar');

console.log('✓ Todas las aserciones de DSSE & Merkle pasaron exitosamente (Exit Code 0).');
