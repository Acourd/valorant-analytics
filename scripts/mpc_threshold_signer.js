'use strict';

/**
 * mpc_threshold_signer.js — Multi-Party Threshold Signature & DSSE Enclave Signer.
 * Enforces M-of-N quorum threshold signing policies on in-toto Statements and DSSE envelopes.
 * Eliminates single-point-of-compromise in build supply chains.
 * Zero external dependencies. Pure Node.js CommonJS.
 */

const crypto = require('crypto');
const { generateKeyPair, createStatement } = require('./dsse_attestation.js');
const { pae } = require('./dsse_pae.js');

class MpcThresholdSigner {
  constructor(options = {}) {
    this.threshold = Number.isInteger(options.threshold) ? options.threshold : 2;
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
    // PAE byte-correcta sobre el payload CRUDO (no sobre su Base64): misma
    // implementación que el verificador DSSE, por lo que son interoperables.
    const paeBuffer = pae(payloadType, Buffer.from(payloadStr, 'utf8'));

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
    const trustedCount = Object.keys(this.keyholders).length;
    const base = {
      threshold: Number.isInteger(expectedThreshold) ? expectedThreshold : null,
      validSignaturesCount: 0,
      totalTrustedKeyholders: trustedCount,
      validSigners: [],
      rejectedSignatures: [],
      statement: null,
      auditDigest: null
    };

    // El umbral debe ser un entero 1..keyholders confiables: un umbral 0 o
    // negativo jamás admite nada, y no puede exigirse más que los custodios.
    if (!Number.isInteger(expectedThreshold) || expectedThreshold < 1) {
      return { ...base, verified: false, verdict: 'INVALID_THRESHOLD_FAIL_CLOSED', error: 'threshold debe ser un entero >= 1 (el umbral 0 o negativo no admite ninguna firma).' };
    }
    if (expectedThreshold > trustedCount) {
      return { ...base, verified: false, verdict: 'INVALID_THRESHOLD_FAIL_CLOSED', error: `threshold ${expectedThreshold} supera los keyholders confiables (${trustedCount}).` };
    }
    if (!envelope || typeof envelope !== 'object' ||
        typeof envelope.payloadType !== 'string' || envelope.payloadType.length === 0 ||
        typeof envelope.payload !== 'string' || envelope.payload.length === 0 ||
        !Array.isArray(envelope.signatures) || envelope.signatures.length === 0) {
      return { ...base, verified: false, verdict: 'MALFORMED_ENVELOPE_FAIL_CLOSED', error: 'Sobre DSSE vacío o malformado (payload y firmas obligatorios).' };
    }

    const { payloadType, payload, signatures } = envelope;
    const paeBuffer = pae(payloadType, Buffer.from(payload, 'base64'));

    const validSigners = new Set();
    const rejectedSignatures = [];

    for (const sigInfo of signatures) {
      const { keyid, sig } = sigInfo || {};
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
      .update(paeBuffer)
      .update(JSON.stringify(Array.from(validSigners).sort()))
      .digest('hex');

    return {
      verified: thresholdMet,
      threshold: expectedThreshold,
      validSignaturesCount: validSigners.size,
      totalTrustedKeyholders: trustedCount,
      validSigners: Array.from(validSigners),
      rejectedSignatures,
      statement: decodedStatement,
      auditDigest,
      verdict: thresholdMet ? 'THRESHOLD_MET_ADMISSION_GRANTED' : 'INSUFFICIENT_SIGNATURES_FAIL_CLOSED'
    };
  }
}

module.exports = { MpcThresholdSigner };
