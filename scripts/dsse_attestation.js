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

function writeKeystoreAtomic(keystorePath, keystore, fence) {
  try {
    const lst = fs.lstatSync(keystorePath);
    if (lst.isSymbolicLink()) {
      throw new Error(`El keystore es un enlace simbólico. Nunca se instala sobre un symlink.`);
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
    if (fence && fence.lockPath && typeof fence.owner === 'string') {
      let cur = null;
      try { cur = fs.readFileSync(fence.lockPath, 'utf8'); } catch (_) {}
      if (cur !== fence.owner) {
        try { fs.unlinkSync(tmp); } catch (_) {}
        throw new Error('Fencing: lock perdido antes del commit; se aborta la escritura sin tocar el destino.');
      }
    }
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
  return withFileLock(lockPath, (owner) => writeKeystoreAtomic(keystorePath, keystore, { lockPath, owner }));
}

function currentThreadId() {
  try {
    const wt = require('worker_threads');
    if (wt && typeof wt.threadId === 'number') return String(wt.threadId);
  } catch (e) { /* continuar */ }
  return 'm';
}

// Reentrancia serial por hilo/isolate: si ESTE hilo ya posee el lock (marco
// exterior), un marco interior lo adopta sin tocar el archivo. Serial = seguro.
// Otros hilos tienen su propio mapa (isolates separados) y jamás adoptan.
const activeLocks = new Map();

function withFileLock(lockPath, fn, options = {}) {
  const retries = options.retries || 100;
  const waitMs = options.waitMs || 50;
  const staleMs = options.staleMs || 30000;
  const abandonFloorMs = Math.max(staleMs, 60000);
  const transient = new Set(['EEXIST', 'EPERM', 'EACCES', 'EBUSY']);
  const owner = `${process.pid}:${currentThreadId()}:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`;
  const inspectLock = () => {
    let st;
    try {
      st = fs.lstatSync(lockPath);
    } catch (e) {
      return e.code === 'ENOENT' ? { state: 'missing' } : { state: 'unreadable' };
    }
    if (st.isSymbolicLink()) return { state: 'suspicious', reason: 'symlink' };
    let raw = '';
    try { raw = fs.readFileSync(lockPath, 'utf8'); } catch (e) { return { state: 'unreadable' }; }
    const m = raw.trim().match(/^(\d+):([A-Za-z0-9_-]+):(\d+):([0-9a-f]+)$/);
    if (!m) return { state: 'malformed', mtimeMs: st.mtimeMs };
    const ownerPid = parseInt(m[1], 10);
    const ownerTid = m[2];
    const ownerStamp = parseInt(m[3], 10);
    let alive = null;
    try { process.kill(ownerPid, 0); alive = true; }
    catch (e) { alive = e.code === 'ESRCH' ? false : null; }
    return { state: 'held', pid: ownerPid, tid: ownerTid, stamp: ownerStamp, alive, mtimeMs: st.mtimeMs };
  };
  let acquired = false;
  let adoptedOwner = null;
  for (let i = 0; i < retries; i++) {
    try {
      // Creación atómica CON contenido: jamás existe un lock vacío observable.
      fs.writeFileSync(lockPath, owner, { flag: 'wx', mode: 0o600 });
      const back = fs.readFileSync(lockPath, 'utf8');
      if (back !== owner) {
        throw new Error('contención: el lock cambió durante la adquisición');
      }
      acquired = true;
      break;
    } catch (e) {
      if (e.code !== undefined && !transient.has(e.code)) throw e;
      if (/contención/.test(e.message)) { execSleep(waitMs); continue; }
      const info = inspectLock();
      if (info.state === 'missing') continue;
      if (info.state === 'held') {
        let cur = null;
        try { cur = fs.readFileSync(lockPath, 'utf8'); } catch (_) {}
        if (cur === owner) { acquired = true; break; }
        if (activeLocks.has(lockPath)) {
          // Reentrancia del MISMO hilo: el marco exterior (serial, sin
          // concurrencia real) conserva la propiedad. Se adopta su token
          // para fencing; el marco exterior conserva la limpieza.
          adoptedOwner = activeLocks.get(lockPath);
          acquired = true;
          break;
        }
        if (info.pid === process.pid) {
          // Mismo proceso, OTRO hilo/worker (o hilo muerto): la identidad es el
          // TOKEN COMPLETO, jamás el PID solo. Un holder vivo jamás se desaloja
          // por mtime. Solo se recupera un lock abandonado cuyo mtime supera el
          // piso absoluto (ningún hold legítimo, de escala ms, lo alcanza).
          try {
            const st = fs.lstatSync(lockPath);
            if ((Date.now() - st.mtimeMs) > Math.max(staleMs, 60000)) {
              try { fs.unlinkSync(lockPath); } catch (_) {}
              continue;
            }
          } catch (_) {}
          execSleep(waitMs);
          continue;
        }
        if (info.alive === false) {
          try { fs.unlinkSync(lockPath); } catch (_) {}
          continue;
        }
        execSleep(waitMs);
        continue;
      }
      // Malformed/suspicious/unreadable: recuperar solo por mtime del kernel,
      // nunca por contenido. Ningún holder legítimo crea symlinks ni contenido
      // malformado (creación atómica con contenido), así que lo anómalo más
      // antiguo que la quiescencia es residuo o sabotaje inerte: se elimina.
      const quiesceLimit = options.quiesceMs || 2000;
      try {
        const st = fs.lstatSync(lockPath);
        if ((Date.now() - st.mtimeMs) > quiesceLimit) {
          try { fs.unlinkSync(lockPath); } catch (_) {}
          continue;
        }
      } catch (_) {}
      execSleep(waitMs);
    }
  }
  if (!acquired) {
    throw new Error(`No se pudo adquirir el lock ${lockPath} tras ${retries} intentos.`);
  }
  const effectiveOwner = adoptedOwner || owner;
  if (!adoptedOwner) activeLocks.set(lockPath, owner);
  // Verificación de propiedad antes de entrar a la sección crítica (fencing).
  try {
    if (fs.readFileSync(lockPath, 'utf8') !== effectiveOwner) {
      if (!adoptedOwner) activeLocks.delete(lockPath);
      throw new Error(`Lock perdido antes de entrar a sección crítica (${lockPath}).`);
    }
  } catch (e) {
    if (/Lock perdido/.test(e.message)) throw e;
    if (!adoptedOwner) activeLocks.delete(lockPath);
    throw new Error(`No se pudo verificar propiedad del lock ${lockPath}.`);
  }
  try {
    return fn(effectiveOwner);
  } finally {
    if (!adoptedOwner) {
      activeLocks.delete(lockPath);
      try {
        if (fs.readFileSync(lockPath, 'utf8') === effectiveOwner) fs.unlinkSync(lockPath);
      } catch (e) { /* otro dueño o ya liberado */ }
    }
  }
}

function execSleep(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) { /* espera activa acotada para IPC sin timers */ }
}

function registerTrustedKey(keystorePath, publicKeyPem, label) {
  const lockPath = `${keystorePath}.lock`;
  return withFileLock(lockPath, (owner) => {
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
      writeKeystoreAtomic(keystorePath, ks, { lockPath, owner });
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
  withFileLock,
  writeKeystoreAtomic
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
