#!/usr/bin/env node
'use strict';

/**
 * plan_store.js — Historial local SEGURO y versionado del ciclo de planes.
 *
 * Modelo de privacidad/retención (documentado en README):
 *   - Directorio: `VALORANT_PLANS_DIR` o `<VALORANT_CACHE_DIR|repo/.cache>/plans`.
 *   - Un archivo JSON por plan (`<planId>.json`), permisos 0600 en POSIX,
 *     escritura atómica (tmp `wx` + fsync + link), symlinks rechazados.
 *   - Se guardan SOLO campos del plan: jugador, referencia+digest de entrada,
 *     procedencia, fecha, métrica/valor/umbral/limitación, acción, rutina,
 *     siguiente dato, estado y bitácora breve. Sin credenciales, tokens ni
 *     datos de terceros.
 *   - `planId` determinista: mismo contenido ⇒ mismo id.
 *   - Los datos sintéticos (`synthetic_demo`) NO se persisten.
 *   - Retención: local e indefinida hasta cierre/cancelación; el usuario puede
 *     borrar los archivos manualmente. Límite de registros por presupuesto.
 *   - Lecturas corruptas/oversized/versión futura/symlink fallan cerrado SIN
 *     destruir registros válidos.
 *
 * Cero dependencias.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const budgets = require('./resource_budget');
const { canonicalStringify } = require('./evidence_policy');

const RECORD_SCHEMA_VERSION = 1;
const STATUSES = Object.freeze(['PENDIENTE', 'INTENTADO', 'CERRADO', 'CANCELADO']);

function planError(code, message, details = {}) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  return err;
}

function storeDir(env = process.env) {
  const base = env.VALORANT_PLANS_DIR || path.join(env.VALORANT_CACHE_DIR || path.join(__dirname, '..', '.cache'), 'plans');
  return path.resolve(base);
}

function ensureDir(dir) {
  if (fs.existsSync(dir)) {
    const lst = fs.lstatSync(dir);
    if (lst.isSymbolicLink()) throw planError('PLAN_UNSAFE_PATH', `El directorio de planes es un enlace simbólico: ${dir}. Se rechaza.`);
    if (!lst.isDirectory()) throw planError('PLAN_UNSAFE_PATH', `La ruta de planes no es un directorio: ${dir}.`);
    return dir;
  }
  fs.mkdirSync(dir, { recursive: true });
  try { fs.chmodSync(dir, 0o700); } catch (e) { /* Windows: mejor esfuerzo */ }
  return dir;
}

function sanitizeNote(note) {
  if (note === undefined || note === null) return null;
  const max = budgets.getBudgets().maxNoteChars;
  const clean = String(note).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return clean.length === 0 ? null : clean.slice(0, max);
}

function planIdFor(record) {
  const core = {
    player: record.player,
    sourceRef: record.sourceRef,
    provenance: record.provenance,
    metric: record.metric,
    value: record.value,
    threshold: record.threshold,
    actionArea: record.action ? record.action.area : null,
    nextDato: record.nextData ? record.nextData : null
  };
  return crypto.createHash('sha256').update(canonicalStringify(core)).digest('hex').slice(0, 16);
}

function validateRecordShape(rec, label) {
  if (!rec || typeof rec !== 'object') throw planError('PLAN_CORRUPT', `Registro de plan inválido (${label}).`);
  const v = rec.schemaVersion;
  if (v === undefined || v === null) throw planError('PLAN_CORRUPT', `Registro sin schemaVersion (${label}).`);
  const n = Number(v);
  if (!Number.isInteger(n)) throw planError('PLAN_CORRUPT', `schemaVersion no entero (${label}).`);
  if (n > RECORD_SCHEMA_VERSION) throw planError('PLAN_SCHEMA_UNSUPPORTED', `schemaVersion de plan ${n} no soportada (máx ${RECORD_SCHEMA_VERSION}) (${label}).`);
  if (!rec.player || typeof rec.player !== 'string') throw planError('PLAN_CORRUPT', `Registro sin jugador exacto (${label}).`);
  if (!STATUSES.includes(rec.status)) throw planError('PLAN_CORRUPT', `Estado de plan desconocido: ${rec.status} (${label}).`);
  return true;
}

function readFileSafe(file) {
  const lst = fs.lstatSync(file);
  if (lst.isSymbolicLink()) throw planError('PLAN_UNSAFE_PATH', `Registro es un enlace simbólico: ${file}. Se rechaza.`);
  if (!lst.isFile()) throw planError('PLAN_UNSAFE_PATH', `Ruta de registro no es un archivo: ${file}.`);
  const maxBytes = budgets.getBudgets().maxFileBytes;
  if (lst.size > maxBytes) throw planError('PLAN_RECORD_TOO_LARGE', `Registro de plan demasiado grande: ${lst.size} bytes > ${maxBytes}.`);
  const text = fs.readFileSync(file, 'utf8');
  let rec;
  try { rec = JSON.parse(text); } catch (e) { throw planError('PLAN_CORRUPT', `Registro de plan ilegible: ${file}.`); }
  validateRecordShape(rec, path.basename(file));
  return rec;
}

function atomicWrite(file, obj) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(obj, null, 2));
    fs.fsyncSync(fd);
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch (e) { /* cerrado */ } }
  }
  try { fs.chmodSync(tmp, 0o600); } catch (e) { /* Windows */ }
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    // Windows no reemplaza con rename: se reemplaza de forma controlada.
    try { fs.rmSync(file, { force: true }); } catch (e2) { /* inexistente */ }
    fs.renameSync(tmp, file);
  }
}

function listRecordFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  ensureDir(dir);
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
}

function savePlan(input) {
  if (input.provenance === 'synthetic_demo') {
    throw planError('PLAN_DEMO_NOT_TRACKABLE', 'Los datos sintéticos (--demo) no habilitan seguimiento: no se persiste ningún plan.');
  }
  const dir = ensureDir(storeDir());
  const planId = planIdFor(input);
  const file = path.join(dir, `${planId}.json`);

  const existingFiles = listRecordFiles(dir);
  if (!existingFiles.includes(`${planId}.json`) && existingFiles.length >= budgets.getBudgets().maxPlans) {
    throw planError('PLAN_LIMIT_EXCEEDED', `Límite de planes locales alcanzado (${budgets.getBudgets().maxPlans}). Cierra o elimina planes para crear nuevos.`);
  }

  if (fs.existsSync(file)) {
    const existing = readFileSafe(file);
    const sameCore = planIdFor(existing) === planId;
    if (sameCore) return existing; // idempotente: mismo contenido ⇒ mismo registro
    throw planError('PLAN_CONFLICT', `Conflicto de planId ${planId}: contenido distinto con el mismo identificador.`);
  }

  const now = new Date().toISOString();
  const record = {
    schemaVersion: RECORD_SCHEMA_VERSION,
    planId,
    player: input.player,
    sourceRef: input.sourceRef,
    provenance: input.provenance,
    createdAt: now,
    updatedAt: now,
    status: 'PENDIENTE',
    metric: input.metric || null,
    value: input.value === undefined ? null : input.value,
    threshold: input.threshold === undefined ? null : input.threshold,
    limitation: input.limitation || null,
    action: input.action || null,
    routine: input.routine || null,
    nextData: input.nextData || null,
    log: [],
    comparisons: []
  };
  atomicWrite(file, record);
  return record;
}

function findPlanFile(idOrPrefix, dir) {
  const files = listRecordFiles(dir);
  const exact = files.find(f => f === `${idOrPrefix}.json`);
  if (exact) return path.join(dir, exact);
  const matches = files.filter(f => f.startsWith(String(idOrPrefix)));
  if (matches.length === 0) throw planError('PLAN_NOT_FOUND', `Plan no encontrado: "${idOrPrefix}". Usa "plan list" para ver los identificadores.`);
  if (matches.length > 1) {
    throw planError('PLAN_AMBIGUOUS', `Identificador "${idOrPrefix}" es ambiguo: coincide con ${matches.length} planes. Candidatos: ${matches.map(m => m.replace(/\.json$/, '')).join(', ')}`);
  }
  return path.join(dir, matches[0]);
}

function readPlan(idOrPrefix, options = {}) {
  if (typeof idOrPrefix !== 'string' || idOrPrefix.trim() === '') {
    throw planError('PLAN_ID_REQUIRED', 'Se requiere un planId explícito (o prefijo inequívoco). Ningún plan se selecciona en silencio.');
  }
  const dir = ensureDir(options.dir || storeDir());
  return readFileSafe(findPlanFile(idOrPrefix.trim(), dir));
}

function listPlans(options = {}) {
  const dir = ensureDir(options.dir || storeDir());
  const plans = [];
  const corrupt = [];
  for (const f of listRecordFiles(dir)) {
    const file = path.join(dir, f);
    try {
      plans.push(readFileSafe(file));
    } catch (e) {
      corrupt.push({ planId: f.replace(/\.json$/, ''), status: 'CORRUPTO', code: e.code || 'PLAN_CORRUPT', error: e.message });
    }
  }
  plans.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { plans, corrupt };
}

function updatePlan(idOrPrefix, mutate, options = {}) {
  const dir = ensureDir(options.dir || storeDir());
  const file = findPlanFile(idOrPrefix.trim(), dir);
  const rec = readFileSafe(file);
  if (rec.status === 'CERRADO' || rec.status === 'CANCELADO') {
    throw planError('PLAN_CLOSED', `El plan ${rec.planId} está ${rec.status}: no admite más cambios.`);
  }
  const updated = mutate(rec);
  updated.updatedAt = new Date().toISOString();
  atomicWrite(file, updated);
  return updated;
}

function markIntent(idOrPrefix, note, options = {}) {
  return updatePlan(idOrPrefix, rec => {
    rec.status = 'INTENTADO';
    rec.log.push({ at: new Date().toISOString(), tipo: 'intent', nota: sanitizeNote(note) });
    return rec;
  }, options);
}

function closePlan(idOrPrefix, kind = 'CERRADO', note, options = {}) {
  const estado = kind === 'CANCELADO' ? 'CANCELADO' : 'CERRADO';
  return updatePlan(idOrPrefix, rec => {
    rec.status = estado;
    rec.log.push({ at: new Date().toISOString(), tipo: estado.toLowerCase(), nota: sanitizeNote(note) });
    return rec;
  }, options);
}

function recordComparison(idOrPrefix, comparison, options = {}) {
  return updatePlan(idOrPrefix, rec => {
    rec.comparisons.push({
      at: new Date().toISOString(),
      estado: comparison.estado,
      metrica: comparison.metrica,
      anterior: comparison.anterior,
      actual: comparison.actual,
      delta: comparison.delta,
      faltante: comparison.faltante || null
    });
    return rec;
  }, options);
}

/**
 * Exportación EXPLÍCITA y pseudonimizada (a stdout; nunca escribe archivos).
 */
function exportPlans({ pseudonymized = false, options = {} } = {}) {
  const { plans, corrupt } = listPlans(options);
  const shape = rec => ({
    planId: rec.planId,
    player: pseudonymized ? `jugador-${crypto.createHash('sha256').update(rec.player).digest('hex').slice(0, 12)}` : rec.player,
    provenance: rec.provenance,
    createdAt: rec.createdAt,
    status: rec.status,
    metric: rec.metric,
    value: rec.value,
    threshold: rec.threshold,
    limitation: rec.limitation,
    action: rec.action,
    routine: rec.routine,
    nextData: rec.nextData,
    comparisons: rec.comparisons,
    log: rec.log
  });
  return { schemaVersion: RECORD_SCHEMA_VERSION, pseudonymized: Boolean(pseudonymized), plans: plans.map(shape), corrupt };
}

module.exports = {
  RECORD_SCHEMA_VERSION,
  STATUSES,
  planError,
  storeDir,
  sanitizeNote,
  planIdFor,
  savePlan,
  readPlan,
  listPlans,
  markIntent,
  closePlan,
  recordComparison,
  exportPlans
};
