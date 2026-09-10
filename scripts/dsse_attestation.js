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
 * Almacén externo de claves confiables (formato: { keys: [...], generation: N }).
 * La verificación segura EXIGE que el firmante esté registrado aquí.
 *
 * PROTOCOLO DE PUBLICACIÓN POR GENERACIONES (commit-record, sin locks):
 *
 * Reemplaza el diseño anterior de lock de exclusión mutua + fencing
 * check-then-rename, cuya validación e instalación podían separarse (TOCTOU).
 * Aquí la instalación de cada generación es UNA SOLA operación atómica: la
 * creación exclusiva (wx) del marcador de commit. Validar e instalar no
 * pueden separarse porque son la misma operación.
 *
 * Archivos junto a keystorePath (K):
 *   K.g<N>.<nonce> : contenido inmutable de la generación N. Se crea con wx
 *                    y se sincroniza (fsync) ANTES de tocar ningún marcador.
 *   K.commit.<N>    : marcador de la generación N = verdad canónica. Se crea
 *                    con wx (contenido pid:tid:nonce) y NUNCA se elimina: la
 *                    numeración es estrictamente monótona para siempre, entre
 *                    procesos e hilos, sin relojes ni mtime.
 *   K               : keystore legado del formato anterior (single-file).
 *                    Solo lectura; se elimina tras la primera publicación.
 *
 * Propiedades:
 *   - Sin TOCTOU: quien gana el marcador publica; quien pierde (EEXIST)
 *     relee el estado del ganador y reintenta re-aplicando su mutación.
 *     Las mutaciones son conmutativas/idempotentes, por lo que el estado
 *     converge conteniendo todos los commits ganados (sin lost-update).
 *   - Sin relojes: ninguna decisión depende de Date.now() ni de mtime; los
 *     saltos de reloj y mtimes arbitrarios no alteran el protocolo.
 *   - Hilos/workers terminados: dejan a lo sumo contenido huérfano SIN
 *     marcador: estado inerte que no bloquea a nadie ni requiere reinicio.
 *   - Durabilidad ordenada: contenido completo y sincronizado antes del
 *     marcador; un marcador legítimo siempre referencia contenido íntegro.
 *   - Retención histórica (sin GC automático): el contenido commiteado JAMÁS
 *     se elimina automáticamente. La compactación es una operación explícita,
 *     separada y futura. Solo cada perdedor retira su PROPIO contenido no
 *     referenciable por marcador alguno. Así toda lectura de un marcador
 *     encuentra siempre su contenido: no existe carrera lector-GC.
 *   - Fail-closed: marcador ilegible (parcial o manipulado) SIEMPRE aborta:
 *     el contenido huérfano sin marcador VÁLIDO es inerte y jamás se adopta
 *     como estado. La recuperación exige intervención manual explícita.
 *   - Vínculo criptográfico: el marcador lleva el digest SHA-256 del contenido
 *     que compromete; toda lectura verifica marcador→digest→contenido antes
 *     de aceptarlo. Digest distinto o generación inconsistente = fail-closed.
 *
 * Convergencia: commitKeystore converge sin pérdida para mutaciones
 * conmutativas/idempotentes (p. ej., añadir una clave). Un REEMPLAZO total
 * del estado es responsabilidad de la función de mutación y exige
 * coordinación externa del llamador: la API no expone escritura ciega.
 */

const MARKER_RE = /^(\d+):([A-Za-z0-9_-]+):([0-9a-f]+):([0-9a-f]{64})$/;

function currentThreadId() {
  try {
    const wt = require('worker_threads');
    if (wt && typeof wt.threadId === 'number') return String(wt.threadId);
  } catch (e) { /* continuar */ }
  return 'm';
}

function listKeystoreGenerationFiles(keystorePath) {
  const dir = path.dirname(keystorePath);
  const base = path.basename(keystorePath);
  const markers = [];
  const contents = new Map();
  let entries;
  try { entries = fs.readdirSync(dir); } catch (e) { return { markers, contents }; }
  for (const name of entries) {
    if (!name.startsWith(base + '.')) continue;
    const rest = name.slice(base.length + 1);
    let m = rest.match(/^commit\.(\d+)$/);
    if (m) { markers.push(parseInt(m[1], 10)); continue; }
    m = rest.match(/^g(\d+)\.([0-9a-f]+)$/);
    if (m) {
      const g = parseInt(m[1], 10);
      if (!contents.has(g)) contents.set(g, []);
      contents.get(g).push(m[2]);
    }
  }
  return { markers, contents };
}

function readLegacyKeystore(keystorePath) {
  let st;
  try { st = fs.lstatSync(keystorePath); }
  catch (e) { return null; } // sin estado previo: keystore nuevo
  if (st.isSymbolicLink()) {
    throw new Error(`El keystore es un enlace simbólico (${keystorePath}): elimínalo manualmente. Nunca se escribe ni se sigue un symlink.`);
  }
  let raw;
  try { raw = fs.readFileSync(keystorePath, 'utf8'); }
  catch (e) {
    // Desapareció entre lstat y read (migración concurrente): no es ilegible,
    // es ausente; el sondeo exterior re-lista los marcadores.
    if (e.code === 'ENOENT') return null;
    throw new Error(`El keystore legado (${keystorePath}) existe pero es ilegible: inspecciónalo manualmente (fail-closed; jamás se sobrescribe estado potencialmente recuperable).`);
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.keys)) return { keystore: parsed, generation: 0 };
  } catch (e) { /* ilegible: fail-closed abajo */ }
  throw new Error(`El keystore legado (${keystorePath}) existe pero es ilegible: inspecciónalo manualmente (fail-closed; jamás se sobrescribe estado potencialmente recuperable).`);
}

function readGenerationContent(keystorePath, gen, nonce, expectedDigest) {
  const contentPath = `${keystorePath}.g${gen}.${nonce}`;
  let raw;
  try {
    raw = fs.readFileSync(contentPath);
  } catch (e) {
    throw new Error(`Contenido de la generación ${gen} ausente o ilegible (${contentPath}) pese a existir su marcador: posible sabotaje o corrupción de disco (fail-closed).`);
  }
  if (expectedDigest) {
    // Vínculo criptográfico marcador→contenido: el digest grabado en el
    // marcador DEBE coincidir con los bytes del contenido referenciado.
    const actualDigest = crypto.createHash('sha256').update(raw).digest('hex');
    if (actualDigest !== expectedDigest) {
      throw new Error(`El contenido de la generación ${gen} no coincide con el digest de su marcador (${contentPath}): manipulación detectada (fail-closed).`);
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    throw new Error(`Contenido de la generación ${gen} sin JSON válido (${contentPath}): fail-closed.`);
  }
  if (!parsed || !Array.isArray(parsed.keys)) {
    throw new Error(`Contenido de la generación ${gen} sin estructura válida { keys: [] } (${contentPath}): fail-closed.`);
  }
  if (parsed.generation !== gen) {
    throw new Error(`La generación del contenido (${parsed.generation}) no coincide con su marcador (${gen}): posible mezcla de estados (fail-closed).`);
  }
  return parsed;
}

function readCommittedKeystore(keystorePath) {
  for (let probe = 0; probe < 5; probe++) {
    const { markers, contents } = listKeystoreGenerationFiles(keystorePath);
    if (markers.length === 0) {
      const legacy = readLegacyKeystore(keystorePath);
      if (legacy === null) {
        // Sin legado: o el keystore es genuinamente nuevo, o una primera
        // migración concurrente acaba de commitear. Re-listar una vez antes
        // de concluir "nuevo" evita leer un vacío rancio.
        const re = listKeystoreGenerationFiles(keystorePath);
        if (re.markers.length > 0) continue;
      }
      return legacy;
    }
    const gen = Math.max(...markers);
    const markerPath = `${keystorePath}.commit.${gen}`;
    let raw = null;
    try { raw = fs.readFileSync(markerPath); }
    catch (e) { execSleep(20); continue; } // desapareció entre readdir y read: reintentar
    const m = raw.toString('utf8').trim().match(MARKER_RE);
    if (!m) {
      // Escritura parcial (caída) o sabotaje: reintentar antes de concluir;
      // al agotar, FAIL-CLOSED. La adopción automática de contenido huérfano
      // está PROHIBIDA: un contenido sin marcador VÁLIDO es inerte y jamás
      // se publica. Ningún marcador inválido puede alterar el estado.
      if (probe < 4) { execSleep(20); continue; }
      throw new Error(`Marcador de commit de la generación ${gen} ilegible (${markerPath}): fail-closed; jamás se publica contenido huérfano (${(contents.get(gen) || []).length} candidato(s) retenido(s) como inerte(s)). Estado de la generación anterior intacto; inspecciónalo manualmente.`);
    }
    return { keystore: readGenerationContent(keystorePath, gen, m[3], m[4]), generation: gen };
  }
  throw new Error(`No se pudo leer el estado del keystore (${keystorePath}) de forma consistente tras 5 intentos.`);
}

function loadOrCreateKeystore(keystorePath) {
  const state = readCommittedKeystore(keystorePath);
  return state ? state.keystore : { keys: [] };
}

function commitKeystore(keystorePath, mutate, options = {}) {
  const maxAttempts = options.maxAttempts || 50;
  const waitMs = options.waitMs || 25;
  if (typeof mutate !== 'function') throw new Error('commitKeystore requiere una función de mutación (current => candidate).');
  fs.mkdirSync(path.dirname(keystorePath), { recursive: true });
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const state = readCommittedKeystore(keystorePath);
    const base = state ? state.keystore : { keys: [] };
    const baseGen = state ? state.generation : 0;
    const candidate = mutate(structuredClone(base));
    if (candidate === null || candidate === undefined) return base; // no-op explícito (idempotencia)
    if (!candidate || !Array.isArray(candidate.keys)) {
      throw new Error(`La mutación del keystore debe producir { keys: [] }; recibido: ${typeof candidate}`);
    }
    const nextGen = baseGen + 1;
    const nonce = crypto.randomBytes(8).toString('hex');
    candidate.generation = nextGen;
    candidate.writer = `${process.pid}:${currentThreadId()}:${nonce}`;
    const contentPath = `${keystorePath}.g${nextGen}.${nonce}`;
    const markerPath = `${keystorePath}.commit.${nextGen}`;
    // 1) Contenido durable ANTES del marcador (wx: creación y contenido son
    //    una sola operación; jamás se sigue un symlink preexistente). El
    //    digest del contenido exacto se graba dentro del marcador.
    const contentJson = JSON.stringify(candidate, null, 2);
    const contentDigest = crypto.createHash('sha256').update(Buffer.from(contentJson, 'utf8')).digest('hex');
    let fd = fs.openSync(contentPath, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, contentJson);
      fs.fsyncSync(fd);
    } finally {
      try { fs.closeSync(fd); } catch (e) {}
    }
    try { fs.chmodSync(contentPath, 0o600); } catch (e) { /* Windows: mejor esfuerzo */ }
    // 2) Marcador: LA operación atómica de validación+instalación. Su
    //    contenido (pid:tid:nonce:digest) vincula criptográficamente la
    //    generación comprometida con los bytes exactos publicados.
    let committed = false;
    try {
      const mfd = fs.openSync(markerPath, 'wx', 0o600);
      try {
        fs.writeFileSync(mfd, `${process.pid}:${currentThreadId()}:${nonce}:${contentDigest}`);
        fs.fsyncSync(mfd);
      } finally {
        try { fs.closeSync(mfd); } catch (e) {}
      }
      committed = true;
    } catch (e) {
      if (e.code !== 'EEXIST') {
        try { fs.unlinkSync(contentPath); } catch (_) {}
        throw new Error(`No se pudo publicar la generación ${nextGen} del keystore (${e.message}). Estado anterior intacto.`);
      }
      // Perdimos esta generación: el contenido del ganador (ya durable) es
      // la nueva base. Se retira el huérfano propio y se reintenta
      // re-aplicando la mutación sobre el estado ganador.
      try { fs.unlinkSync(contentPath); } catch (_) {}
      execSleep(waitMs);
      continue;
    }
    // 3) Durabilidad del directorio. El contenido histórico se RETIENE: la
    //    compactación es una operación explícita futura, jamás automática
    //    (un GC aquí competiría con lectores activos de generaciones previas).
    try {
      const dirFd = fs.openSync(path.dirname(keystorePath), 'r');
      try { fs.fsyncSync(dirFd); } finally { try { fs.closeSync(dirFd); } catch (e) {} }
    } catch (e) { /* filesystems sin fsync de directorio */ }
    // El formato legado queda obsoleto: los marcadores son la única verdad.
    try {
      if (fs.lstatSync(keystorePath).isFile()) fs.unlinkSync(keystorePath);
    } catch (e) { /* ya ausente: los marcadores mandan */ }
    return candidate;
  }
  throw new Error(`No se pudo publicar el keystore tras ${maxAttempts} generaciones (contención persistente). Estado anterior intacto.`);
}

function execSleep(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) { /* espera activa acotada para IPC sin timers */ }
}

function registerTrustedKey(keystorePath, publicKeyPem, label) {
  const keyid = crypto.createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 16);
  commitKeystore(keystorePath, (current) => {
    if (current.keys.some(k => k.keyid === keyid)) return null; // ya registrado: idempotente
    current.keys.push({ keyid, publicKeyPem, label: label || 'sin etiqueta', created: new Date().toISOString() });
    return current;
  });
  return keyid;
}

module.exports = {
  generateAttestationKeyPair,
  sha256Digest,
  createStatement,
  signTelemetryReport,
  verifyTelemetryAttestation,
  loadOrCreateKeystore,
  registerTrustedKey,
  commitKeystore
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
  const demoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsse-demo-'));
  const demoKeystore = path.join(demoDir, 'keystore.json');
  registerTrustedKey(demoKeystore, envelope.publicKeyPem, 'demo-local');
  const res = verifyTelemetryAttestation(envelope, null, { trustedKeystore: loadOrCreateKeystore(demoKeystore).keys });
  try { fs.rmSync(demoDir, { recursive: true, force: true }); } catch (e) { /* continuar */ }
  if (res.verified) {
    console.log('Atestación in-toto v1 verificada contra almacén confiable (Exit 0)');
    process.exit(0);
  } else {
    console.error('Fallo en verificación:', res.error);
    process.exit(1);
  }
}

