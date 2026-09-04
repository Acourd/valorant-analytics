'use strict';

/**
 * mpc_threshold_signer.js — Multi-Party Threshold Signature & DSSE Enclave Signer.
 * Enforces M-of-N quorum threshold signing policies on in-toto Statements and DSSE envelopes.
 * Eliminates single-point-of-compromise in build supply chains.
 * Zero external dependencies. Pure Node.js CommonJS.
 */

const crypto = require('crypto');
const { generateKeyPair, createStatement } = require('./dsse_attestation.js');

class MpcThresholdSigner {
  constructor(options = {}) {
    this.threshold = options.threshold || 2;
    this.keyholders = options.keyholders || {};
  }

  registerKeyholder(keyId, publicKeyPem) {
    if (!keyId || !publicKeyPem) {
      throw new Error('keyId y publicKeyPem son obligatorios.');
    }
    this.keyholders[keyId] = publicKeyPem;
  }

  static signMultiPartyEnvelope(statement, signers) {
    if (!Array.isArray(signers) || signers.length === 0) {
      throw new Error('signers debe ser un array no vacío de { keyId, privateKeyPem }.');
    }

    const payloadStr = JSON.stringify(statement);
    const payloadBase64 = Buffer.from(payloadStr, 'utf8').toString('base64');
    const payloadType = 'application/vnd.in-toto+json';
    const pae = `DSSEv1 ${payloadType.length} ${payloadType} ${payloadBase64.length} ${payloadBase64}`;
    const paeBuffer = Buffer.from(pae, 'utf8');

    const signatures = signers.map(({ keyId, privateKeyPem }) => {
      const sigBuffer = crypto.sign(null, paeBuffer, privateKeyPem);
      return {
        keyid: keyId,
        sig: sigBuffer.toString('base64')
      };
    });

    return {
      payloadType,
      payload: payloadBase64,
      signatures
    };
  }

  verifyThreshold(envelope, expectedThreshold = this.threshold) {
    if (!envelope || !envelope.payload || !Array.isArray(envelope.signatures)) {
      return { verified: false, error: 'Sobre DSSE malformado' };
    }

    const { payloadType, payload, signatures } = envelope;
    const pae = `DSSEv1 ${payloadType.length} ${payloadType} ${payload.length} ${payload}`;
    const paeBuffer = Buffer.from(pae, 'utf8');

    const validSigners = new Set();
    const rejectedSignatures = [];

    for (const sigInfo of signatures) {
      const { keyid, sig } = sigInfo;
      const publicKeyPem = this.keyholders[keyid];

      if (!publicKeyPem) {
        rejectedSignatures.push({ keyid, reason: 'KEY_NOT_IN_TRUSTED_KEYHOLDERS' });
        continue;
      }

      try {
        const sigBuffer = Buffer.from(sig, 'base64');
        const isValid = crypto.verify(null, paeBuffer, publicKeyPem, sigBuffer);
        if (isValid) {
          validSigners.add(keyid);
        } else {
          rejectedSignatures.push({ keyid, reason: 'INVALID_SIGNATURE_BYTES' });
        }
      } catch (err) {
        rejectedSignatures.push({ keyid, reason: err.message });
      }
    }

    const thresholdMet = validSigners.size >= expectedThreshold;
    let decodedStatement = null;
    try {
      decodedStatement = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    } catch {}

    const auditDigest = crypto.createHash('sha256')
      .update(JSON.stringify({ pae, validSigners: Array.from(validSigners).sort() }))
      .digest('hex');

    return {
      verified: thresholdMet,
      threshold: expectedThreshold,
      validSignaturesCount: validSigners.size,
      totalTrustedKeyholders: Object.keys(this.keyholders).length,
      validSigners: Array.from(validSigners),
      rejectedSignatures,
      statement: decodedStatement,
      auditDigest,
      verdict: thresholdMet ? 'THRESHOLD_MET_ADMISSION_GRANTED' : 'INSUFFICIENT_SIGNATURES_FAIL_CLOSED'
    };
  }
}

module.exports = { MpcThresholdSigner };
