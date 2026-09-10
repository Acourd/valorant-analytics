#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { httpsGetJson } = require('./http_fetch');

/**
 * riot_source.js - Fuente AUTORIZADA de telemetría (Riot RSO + VAL-MATCH-V1).
 *
 * Modelo de confianza (honesto y acotado):
 *   - `verified_source` significa: el payload se obtuvo por un canal AUTENTICADO
 *     (token Riot) desde un host de Riot en allowlist, y un proceso local lo
 *     ATESTIGUA con Ed25519 ligando matchId + host + endpoint + fetchedAt +
 *     digest del payload. Un verificador externo puede comprobar la firma
 *     contra un trust store y re-derivar el digest.
 *   - NO prueba la verdad interna de Riot más allá de "esta respuesta vino de
 *     Riot por un canal autorizado". Se documenta así, sin sobreafirmar.
 *   - Sin credenciales (`RIOT_API_KEY` production) y sin trust store, NADA
 *     obtiene `verified_source`: el adaptador falla cerrado.
 *
 * Requisitos Riot: las claves personales/developer NO tienen acceso a VALORANT;
 * se requiere production key (y RSO para datos de cuenta). Ver README.
 */

const ALLOWED_HOSTS = new Set([
  'americas.api.riotgames.com',
  'europe.api.riotgames.com',
  'asia.api.riotgames.com',
  'esports.api.riotgames.com'
]);

const REGION_HOSTS = {
  americas: 'americas.api.riotgames.com',
  europe: 'europe.api.riotgames.com',
  asia: 'asia.api.riotgames.com',
  esports: 'esports.api.riotgames.com'
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`;
}

function payloadDigest(payload) {
  return crypto.createHash('sha256').update(canonicalStringify(payload === undefined ? null : payload)).digest('hex');
}

function keyIdOf(publicKeyPem) {
  return crypto.createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 16);
}

function validateMatchId(matchId) {
  if (typeof matchId !== 'string' || !UUID_RE.test(matchId.trim())) {
    throw new Error('matchId inválido: se exige UUID de Riot (VAL-MATCH-V1).');
  }
  return matchId.trim().toLowerCase();
}

function matchEndpoint(matchId) {
  return `/val/match/v1/matches/${validateMatchId(matchId)}`;
}

function hostForRegion(region) {
  const host = REGION_HOSTS[String(region || '').toLowerCase()];
  if (!host) throw new Error(`Región Riot inválida: "${region}" (usa americas|europe|asia|esports).`);
  return host;
}

// Credenciales: production key (VALORANT) obligatoria para el endpoint de match.
function resolveCredentials(options = {}) {
  const apiKey = options.apiKey || process.env.RIOT_API_KEY || '';
  const rsoToken = options.rsoToken || process.env.RIOT_RSO_TOKEN || '';
  if (!apiKey && !rsoToken) {
    const err = new Error('verified_source no disponible: faltan credenciales Riot (RIOT_API_KEY production o RIOT_RSO_TOKEN). Solicita acceso en developer.riotgames.com.');
    err.code = 'RIOT_CREDENTIALS_MISSING';
    throw err;
  }
  return { apiKey, rsoToken };
}

// Fetch AUTENTICADO desde un host Riot en allowlist. Devuelve el registro crudo
// (sin atestiguar todavía).
function fetchRiotMatchById(matchId, options = {}) {
  const id = validateMatchId(matchId);
  const host = hostForRegion(options.region || process.env.RIOT_REGION || 'americas');
  if (!ALLOWED_HOSTS.has(host)) throw new Error(`Host Riot no permitido: ${host}`);
  const creds = resolveCredentials(options);
  const endpoint = matchEndpoint(id);
  const headers = {};
  if (creds.apiKey) headers['X-Riot-Token'] = creds.apiKey;
  if (creds.rsoToken) headers['Authorization'] = `Bearer ${creds.rsoToken}`;
  const url = `https://${host}${endpoint}`;
  const payload = httpsGetJson(url, { headers, timeoutMs: options.timeoutMs || 12000, maxRetries: options.maxRetries || 3 });
  return { matchId: id, host, endpoint, fetchedAt: new Date().toISOString(), payload };
}

// Atestación local (Ed25519) del registro obtenido. La clave privada es del
// proceso de ingesta; su pública se registra en el trust store.
function createAttestation(record, privateKeyPem) {
  if (!record || typeof record !== 'object') throw new Error('createAttestation requiere un registro.');
  const matchId = validateMatchId(record.matchId);
  if (!ALLOWED_HOSTS.has(record.host)) throw new Error(`Host Riot no permitido: ${record.host}`);
  if (record.endpoint !== matchEndpoint(matchId)) throw new Error('El endpoint no corresponde al matchId.');
  const fetchedAt = String(record.fetchedAt || '');
  if (Number.isNaN(Date.parse(fetchedAt))) throw new Error('fetchedAt inválido (ISO-8601).');
  if (!privateKeyPem) throw new Error('createAttestation requiere la clave privada del atestador.');
  const digest = payloadDigest(record.payload);
  const core = { v: 1, matchId, host: record.host, endpoint: record.endpoint, fetchedAt, payloadDigest: digest };
  const signature = crypto.sign(null, Buffer.from(canonicalStringify(core), 'utf8'), crypto.createPrivateKey(privateKeyPem)).toString('base64');
  const publicKeyPem = crypto.createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' });
  return { ...core, signerKeyId: keyIdOf(publicKeyPem), signature };
}

// Verificador: solo valida si host/endpoint/matchId/digest/firma/frescura
// concurren. Devuelve { valid, reason }.
function verifyAttestation(attestation, options = {}) {
  const att = attestation;
  if (!att || typeof att !== 'object') return { valid: false, reason: 'atestación ausente' };
  let matchId;
  try { matchId = validateMatchId(att.matchId); } catch (e) { return { valid: false, reason: e.message }; }
  if (!ALLOWED_HOSTS.has(att.host)) return { valid: false, reason: `host no permitido: ${att.host}` };
  if (att.endpoint !== matchEndpoint(matchId)) return { valid: false, reason: 'endpoint no corresponde al matchId' };
  if (Number.isNaN(Date.parse(String(att.fetchedAt)))) return { valid: false, reason: 'fetchedAt inválido' };
  const maxAgeMs = options.maxAgeMs || (7 * 24 * 3600 * 1000);
  if (Date.now() - Date.parse(att.fetchedAt) > maxAgeMs) return { valid: false, reason: 'atestación caducada' };
  if (options.payload !== undefined) {
    if (payloadDigest(options.payload) !== att.payloadDigest) return { valid: false, reason: 'digest del payload no coincide' };
  }
  const trusted = Array.isArray(options.trustedKeys) ? options.trustedKeys : [];
  if (trusted.length === 0) return { valid: false, reason: 'trust store vacío: sin fuente verificada' };
  const core = { v: 1, matchId: att.matchId && att.matchId.trim().toLowerCase(), host: att.host, endpoint: att.endpoint, fetchedAt: att.fetchedAt, payloadDigest: att.payloadDigest };
  for (const pem of trusted) {
    let keyid;
    try { keyid = keyIdOf(pem); } catch (e) { continue; }
    if (att.signerKeyId && keyid !== att.signerKeyId) continue;
    try {
      const ok = crypto.verify(null, Buffer.from(canonicalStringify(core), 'utf8'), crypto.createPublicKey(pem), Buffer.from(att.signature || '', 'base64'));
      if (ok) return { valid: true, reason: 'firma verificada contra trust store' };
    } catch (e) { /* probar siguiente */ }
  }
  return { valid: false, reason: 'firma no verificada' };
}

// Trust store: fichero JSON con array de claves públicas SPKI (PEM).
function loadTrustedKeys(filePath) {
  const p = filePath || process.env.RIOT_ATTESTATION_TRUST;
  if (!p) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'));
    if (Array.isArray(parsed)) return parsed.filter(k => typeof k === 'string' && k.includes('BEGIN PUBLIC KEY'));
  } catch (e) { /* fail-closed: sin trust store */ }
  return [];
}

module.exports = {
  ALLOWED_HOSTS,
  REGION_HOSTS,
  validateMatchId,
  matchEndpoint,
  hostForRegion,
  resolveCredentials,
  fetchRiotMatchById,
  createAttestation,
  verifyAttestation,
  loadTrustedKeys,
  payloadDigest,
  canonicalStringify,
  keyIdOf
};
