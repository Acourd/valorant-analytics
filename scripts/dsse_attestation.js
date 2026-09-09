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
const fs = require('fs');
const path = require('path');

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

  // Pre-Authentication Encoding (PAE) segÃºn especificaciÃ³n oficial DSSE:
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
 * Verifies a DSSE attestation envelope.
 * Secure-by-default: the signer must be present in an EXTERNAL trusted keystore.
 * Envelope-carried keys are NOT trusted unless options.allowSelfSigned is set
 * (explicit insecure mode) â€” trusting the key inside the envelope proves only
 * internal consistency, never authorship.
 */
function verifyTelemetryAttestation(envelope, publicKeyPem = null, options = {}) {
  if (!envelope || !envelope.payload || !Array.isArray(envelope.signatures) || envelope.signatures.length === 0) {
    return { verified: false, error: 'Estructura de sobre DSSE invÃ¡lida' };
  }

  const keyid = envelope.signatures[0].keyid;

  if (options.trustedKeystore && Array.isArray(options.trustedKeystore)) {
    const trusted = options.trustedKeystore.find(k => k.keyid === keyid);
    if (!trusted) {
      return { verified: false, error: `Firmante no confiable: keyid ${keyid} ausente del almacÃ©n de claves. Registra la clave con registerTrustedKey antes de verificar.` };
    }
    return verifyWithPem(envelope, trusted.publicKeyPem, keyid);
  }

  if (!options.allowSelfSigned) {
    return { verified: false, error: 'Sobre auto-firmado sin almacÃ©n de claves: el firmante no es confiable por defecto. Usa trustedKeystore o allowSelfSigned (modo inseguro explÃ­cito).' };
  }

  const pem = publicKeyPem || envelope.publicKeyPem;
  if (!pem) {
    return { verified: false, error: 'Clave pÃºblica ausente para verificaciÃ³n' };
  }
  return verifyWithPem(envelope, pem);
}

function verifyWithPem(envelope, pem) {
  const keyid = envelope.signatures[0].keyid;
  try {
    const publicKey = crypto.createPublicKey(pem);
    const payloadBytes = Buffer.from(envelope.payload, 'base64');
    const paeString = `DSSEv1 ${envelope.payloadType.length} ${envelope.payloadType} ${payloadBytes.length} ${payloadBytes.toString('latin1')}`;
    const paeBuffer = Buffer.from(paeString, 'latin1');

    const sigBuffer = Buffer.from(envelope.signatures[0].sig, 'base64');
    const verified = crypto.verify(null, paeBuffer, publicKey, sigBuffer);

    if (!verified) {
      return { verified: false, error: 'Firma criptogrÃ¡fica Ed25519 no coincide con el payload' };
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

/**
 * AlmacÃ©n externo de claves confiables (formato: { "keys": [{ keyid, publicKeyPem, label, created }] }).
 * La verificaciÃ³n segura EXIGE que el firmante estÃ© registrado aquÃ­.
 */
function loadOrCreateKeystore(keystorePath) {
  try {
    const raw = fs.readFileSync(keystorePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.keys)) return parsed;
  } catch (e) { /* crear nuevo */ }
  return { keys: [] };
}

function writeKeystoreAtomic(keystorePath, keystore) {
  try {
    const lst = fs.lstatSync(keystorePath);
    if (lst.isSymbolicLink()) {
      throw new Error(`El keystore es un enlace simbólico (${keystorePath}): elimínalo manualmente. Nunca se instala sobre un symlink.`);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const nonce = crypto.randomBytes(8).toString('hex');
  const tmp = `${keystorePath}.tmp-${process.pid}-${nonce}`;
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(keystore, null, 2));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    try { fs.chmodSync(tmp, 0o600); } catch (e) { /* Windows: mejor esfuerzo */ }
    fs.renameSync(tmp, keystorePath);
    try {
      const dirFd = fs.openSync(path.dirname(keystorePath), 'r');
      try { fs.fsyncSync(dirFd); } finally { try { fs.closeSync(dirFd); } catch (e) {} }
    } catch (e) { /* filesystems sin fsync de directorio */ }
  } catch (e) {
    if (fd !== null) { try { fs.closeSync(fd); } catch (_) {} }
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw new Error(`No se pudo instalar el keystore (${e.message}). Estado anterior intacto.`);
  }
}

function saveKeystore(keystorePath, keystore) {
  fs.mkdirSync(path.dirname(keystorePath), { recursive: true });
  const lockPath = `${keystorePath}.lock`;
  return withFileLock(lockPath, () => writeKeystoreAtomic(keystorePath, keystore));
}

function withFileLock(lockPath, fn, options = {}) {
  const retries = options.retries || 100;
  const waitMs = options.waitMs || 50;
  const staleMs = options.staleMs || 30000;
  const transient = new Set(['EEXIST', 'EPERM', 'EACCES', 'EBUSY']);
  const owner = `${process.pid}:${Date.now()}`;
  let fd = null;
  for (let i = 0; i < retries; i++) {
    try {
      fd = fs.openSync(lockPath, 'wx', 0o600);
      try {
        fs.writeFileSync(fd, owner);
        fs.fsyncSync(fd);
      } catch (e) {
        try { fs.closeSync(fd); } catch (_) {}
        try { fs.unlinkSync(lockPath); } catch (_) {}
        throw new Error(`No se pudo inicializar el lock ${lockPath} (${e.message}).`);
      }
      break;
    } catch (e) {
      if (e.code !== undefined && !transient.has(e.code)) throw e;
      if (/No se pudo inicializar/.test(e.message)) throw e;
      try {
        const raw = fs.readFileSync(lockPath, 'utf8');
        const stamp = parseInt(String(raw).split(':')[1] || '0', 10);
        if (Number.isFinite(stamp) && Date.now() - stamp > staleMs) {
          try { fs.unlinkSync(lockPath); } catch (_) {}
          continue;
        }
      } catch (_) { /* lock ilegible: reintentar con backoff */ }
      execSleep(waitMs);
    }
  }
  if (fd === null) throw new Error(`No se pudo adquirir el lock ${lockPath} tras ${retries} intentos.`);
  try {
    return fn();
  } finally {
    try { fs.closeSync(fd); } catch (e) { /* continuar */ }
    try {
      const raw = fs.readFileSync(lockPath, 'utf8');
      if (raw === owner) fs.unlinkSync(lockPath);
    } catch (e) { /* otro dueño o ya liberado */ }
  }
}

function execSleep(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) { /* espera activa acotada para IPC sin timers */ }
}

function registerTrustedKey(keystorePath, publicKeyPem, label) {
  const lockPath = `${keystorePath}.lock`;
  return withFileLock(lockPath, () => {
    try {
      const lst = fs.lstatSync(keystorePath);
      if (lst.isSymbolicLink()) {
        throw new Error(`El keystore es un enlace simbólico (${keystorePath}): elimínalo manualmente. Nunca se instala sobre un symlink.`);
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    const ks = loadOrCreateKeystore(keystorePath);
    const keyid = crypto.createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 16);
    if (!ks.keys.some(k => k.keyid === keyid)) {
      ks.keys.push({ keyid, publicKeyPem, label: label || 'sin etiqueta', created: new Date().toISOString() });
      writeKeystoreAtomic(keystorePath, ks);
    }
    return keyid;
  });
}

module.exports = {
  generateAttestationKeyPair,
  sha256Digest,
  createStatement,
  signTelemetryReport,
  verifyTelemetryAttestation,
  loadOrCreateKeystore,
  saveKeystore,
  registerTrustedKey,
  withFileLock
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
  console.log('Sobre DSSE generado y firmado con Ed25519: keyid', envelope.signatures[0].keyid);

  const os = require('os');
  const demoKeystore = path.join(os.tmpdir(), 'dsse-demo-keystore.json');
  try { fs.unlinkSync(demoKeystore); } catch (e) { /* continuar */ }
  registerTrustedKey(demoKeystore, envelope.publicKeyPem, 'demo-local');
  const res = verifyTelemetryAttestation(envelope, null, { trustedKeystore: loadOrCreateKeystore(demoKeystore).keys });
  try { fs.unlinkSync(demoKeystore); } catch (e) { /* continuar */ }
  if (res.verified) {
    console.log('AtestaciÃ³n in-toto v1 verificada contra almacÃ©n confiable (Exit 0)');
    process.exit(0);
  } else {
    console.error('Fallo en verificaciÃ³n:', res.error);
    process.exit(1);
  }
}
