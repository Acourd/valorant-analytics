#!/usr/bin/env node
'use strict';

/**
 * dsse_attestation.js - Cryptographic DSSE & in-toto v1 Statement Generator
 * 
 * Provides verifiable provenance, tamper-evidence, and cryptographic non-repudiation
 * for competitive Valorant match diagnoses and coaching prescriptions.
 * 
 * Implements in-toto Statement v1 inside a Dead Simple Signing Envelope (DSSE)
 * using native Node.js crypto (Ed25519 asymmetric signatures + SHA-256 digests).
 * 
 * Zero external dependencies. Pure Node.js CommonJS.
 */

const crypto = require('crypto');

const STATEMENT_TYPE_V1 = 'https://in-toto.io/Statement/v1';
const PREDICATE_TYPE_VALORANT = 'https://valorant-analytics.dev/attestation/v1';

/**
 * Generates an ephemeral or deterministic Ed25519 keypair for telemetry attestation
 */
function generateAttestationKeyPair() {
  return crypto.generateKeyPairSync('ed25519');
}

/**
 * Computes deterministic SHA-256 hex digest of any object or string
 */
function sha256Digest(data) {
  const content = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Creates an in-toto Statement v1 payload for match telemetry
 */
function createStatement(matchReport) {
  const subjectName = matchReport.player || matchReport.target || 'Unknown#0000';
  const reportDigest = sha256Digest(matchReport);

  return {
    _type: STATEMENT_TYPE_V1,
    subject: [
      {
        name: subjectName,
        digest: {
          sha256: reportDigest
        }
      }
    ],
    predicateType: PREDICATE_TYPE_VALORANT,
    predicate: {
      timestamp: new Date().toISOString(),
      map: matchReport.map || 'Unknown',
      agent: matchReport.agent || 'Unknown',
      rank: matchReport.rank || 'Unranked',
      radar: matchReport.radar || {},
      fugasDeElo: matchReport.eloLeaks || matchReport.fugasDeElo || [],
      reglaCognitiva: matchReport.prescripcionInmediata?.reglaMental || 'None'
    }
  };
}

/**
 * Encapsulates an in-toto Statement in a DSSE envelope signed with Ed25519
 */
function signTelemetryReport(matchReport, keyPair = null) {
  const keys = keyPair || generateAttestationKeyPair();
  const statement = createStatement(matchReport);
  const payloadBytes = Buffer.from(JSON.stringify(statement), 'utf8');
  const payloadBase64 = payloadBytes.toString('base64');

  // Pre-Authentication Encoding (PAE) según especificación oficial DSSE:
  // PAE(type, body) = "DSSEv1" + " " + len(type) + " " + type + " " + len(body) + " " + body
  const payloadType = 'application/vnd.in-toto+json';
  const paeString = `DSSEv1 ${payloadType.length} ${payloadType} ${payloadBytes.length} ${payloadBytes.toString('latin1')}`;
  const paeBuffer = Buffer.from(paeString, 'latin1');

  const signature = crypto.sign(null, paeBuffer, keys.privateKey);

  const publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const keyId = crypto.createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 16);

  return {
    payloadType,
    payload: payloadBase64,
    signatures: [
      {
        keyid: keyId,
        sig: signature.toString('base64')
      }
    ],
    publicKeyPem
  };
}

/**
 * Verifies a DSSE attestation envelope against the provided public key
 */
function verifyTelemetryAttestation(envelope, publicKeyPem = null) {
  if (!envelope || !envelope.payload || !Array.isArray(envelope.signatures) || envelope.signatures.length === 0) {
    return { verified: false, error: 'Estructura de sobre DSSE inválida' };
  }

  const pem = publicKeyPem || envelope.publicKeyPem;
  if (!pem) {
    return { verified: false, error: 'Clave pública ausente para verificación' };
  }

  try {
    const publicKey = crypto.createPublicKey(pem);
    const payloadBytes = Buffer.from(envelope.payload, 'base64');
    const paeString = `DSSEv1 ${envelope.payloadType.length} ${envelope.payloadType} ${payloadBytes.length} ${payloadBytes.toString('latin1')}`;
    const paeBuffer = Buffer.from(paeString, 'latin1');

    const sigBuffer = Buffer.from(envelope.signatures[0].sig, 'base64');
    const verified = crypto.verify(null, paeBuffer, publicKey, sigBuffer);

    if (!verified) {
      return { verified: false, error: 'Firma criptográfica Ed25519 no coincide con el payload' };
    }

    const statement = JSON.parse(payloadBytes.toString('utf8'));
    return {
      verified: true,
      statement,
      signerKeyId: envelope.signatures[0].keyid
    };
  } catch (err) {
    return { verified: false, error: err.message };
  }
}

module.exports = {
  generateAttestationKeyPair,
  sha256Digest,
  createStatement,
  signTelemetryReport,
  verifyTelemetryAttestation
};

if (require.main === module) {
  console.log('=== DSSE IN-TOTO ATTESTATION ENGINE (Ed25519) ===');
  const mockReport = {
    player: 'TenZ#0001',
    map: 'Lotus',
    agent: 'Iso',
    rank: 'Radiant',
    radar: { precisionMecanica: '92 / 100' }
  };

  const envelope = signTelemetryReport(mockReport);
  console.log('✓ Sobre DSSE generado y firmado con Ed25519: keyid', envelope.signatures[0].keyid);

  const res = verifyTelemetryAttestation(envelope);
  if (res.verified) {
    console.log('✓ Atestación in-toto v1 verificada exitosamente (Exit 0)');
    process.exit(0);
  } else {
    console.error('✗ Fallo en verificación:', res.error);
    process.exit(1);
  }
}
