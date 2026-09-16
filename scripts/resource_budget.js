#!/usr/bin/env node
'use strict';

/**
 * resource_budget.js — Presupuestos de recursos EXPLÍCITOS y configurables.
 *
 * Valores seguros por defecto; se pueden sobreescribir con variables de entorno
 * `VA_BUDGET_<NOMBRE>` (solo números) o por opciones. Al exceder un límite se
 * falla cerrado con un código estable y sin análisis parcial:
 *   - INPUT_TOO_LARGE           (archivo/texto)
 *   - SCHEMA_LIMIT_EXCEEDED     (profundidad JSON, jugadores, rondas, eventos, arreglos)
 *   - RESOURCE_BUDGET_EXCEEDED  (tiempo de proceso, workers concurrentes)
 *
 * Cero dependencias.
 */

const DEFAULTS = Object.freeze({
  // 5 MiB: un export de partida normal pesa <1 MiB; margen amplio y seguro.
  maxFileBytes: 5 * 1024 * 1024,
  // 200 000 caracteres: un marcador pegado enorme ronda decenas de KB.
  maxTextChars: 200000,
  // 64 niveles: JSON.parse no limita profundidad; 64 evita recursiones patológicas.
  maxJsonDepth: 64,
  // 64 jugadores: una partida tiene 10-20; 64 deja margen sin permitir abuso.
  maxPlayers: 64,
  // 200 rondas: un competitivo largo ronda 40; 200 es holgado.
  maxRounds: 200,
  // 100 000 eventos: agregados por ronda de partidas largas con detalle.
  maxEvents: 100000,
  // 20 000 elementos por arreglo: cubre listas de daño/kills reales.
  maxArrayItems: 20000,
  // 30 s: operación intensiva sobre un archivo dentro de presupuesto.
  maxProcessingMs: 30000,
  // 16 workers: suficiente estrés interno sin saturar runners pequeños.
  maxWorkers: 16
});

function envName(key) {
  // maxFileBytes -> VA_BUDGET_MAX_FILE_BYTES
  return 'VA_BUDGET_' + key.replace(/([A-Z])/g, '_$1').toUpperCase();
}

function parseEnvNumber(key) {
  const raw = process.env[envName(key)];
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getBudgets(overrides = {}) {
  const budgets = {};
  for (const key of Object.keys(DEFAULTS)) {
    const envValue = parseEnvNumber(key);
    budgets[key] = overrides[key] !== undefined ? overrides[key] : (envValue !== null ? envValue : DEFAULTS[key]);
  }
  return budgets;
}

function budgetError(code, message, details = {}) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  return err;
}

function checkFileSize(bytes, budgets = getBudgets()) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw budgetError('INPUT_TOO_LARGE', `Tamaño de archivo inválido: ${bytes}.`, { bytes });
  }
  if (bytes > budgets.maxFileBytes) {
    throw budgetError('INPUT_TOO_LARGE', `Archivo demasiado grande: ${bytes} bytes supera el máximo ${budgets.maxFileBytes} (INPUT_TOO_LARGE).`, { bytes, maxFileBytes: budgets.maxFileBytes });
  }
  return true;
}

function checkTextLength(text, budgets = getBudgets()) {
  const length = typeof text === 'string' ? text.length : 0;
  if (length > budgets.maxTextChars) {
    throw budgetError('INPUT_TOO_LARGE', `Texto demasiado largo: ${length} caracteres supera el máximo ${budgets.maxTextChars} (INPUT_TOO_LARGE).`, { length, maxTextChars: budgets.maxTextChars });
  }
  return true;
}

// Profundidad máxima por recorrido iterativo (sin recursión). La raíz es
// profundidad 0; cada nivel anidado suma 1. Una cadena de N objetos tiene
// profundidad N.
function checkJsonDepth(value, budgets = getBudgets(), limit = null) {
  const max = limit === null ? budgets.maxJsonDepth : limit;
  const stack = [{ node: value, depth: 0 }];
  while (stack.length > 0) {
    const { node, depth } = stack.pop();
    if (depth > max) {
      throw budgetError('SCHEMA_LIMIT_EXCEEDED', `Profundidad JSON ${depth} supera el máximo ${max} (SCHEMA_LIMIT_EXCEEDED).`, { depth, maxJsonDepth: max });
    }
    if (node && typeof node === 'object') {
      const children = Array.isArray(node) ? node : Object.values(node);
      for (const child of children) stack.push({ node: child, depth: depth + 1 });
    }
  }
  return true;
}

function checkCount(kind, count, limit) {
  if (!Number.isFinite(count) || count < 0) {
    throw budgetError('SCHEMA_LIMIT_EXCEEDED', `Conteo inválido de ${kind}: ${count}.`, { kind, count });
  }
  if (count > limit) {
    throw budgetError('SCHEMA_LIMIT_EXCEEDED', `Demasiados ${kind}: ${count} supera el máximo ${limit} (SCHEMA_LIMIT_EXCEEDED).`, { kind, count, limit });
  }
  return true;
}

function checkPlayers(n, budgets = getBudgets()) { return checkCount('jugadores', n, budgets.maxPlayers); }
function checkRounds(n, budgets = getBudgets()) { return checkCount('rondas', n, budgets.maxRounds); }
function checkEvents(n, budgets = getBudgets()) { return checkCount('eventos', n, budgets.maxEvents); }
function checkArrayItems(kind, n, budgets = getBudgets()) { return checkCount(`elementos de ${kind}`, n, budgets.maxArrayItems); }

// Presupuesto de tiempo cooperativo: se consulta en puntos de control.
class TimeBudget {
  constructor(ms = getBudgets().maxProcessingMs) {
    this.maxMs = ms;
    this.start = Date.now();
  }
  elapsed() { return Date.now() - this.start; }
  checkpoint(step = 'proceso') {
    if (this.elapsed() > this.maxMs) {
      throw budgetError('RESOURCE_BUDGET_EXCEEDED', `Tiempo máximo excedido en ${step}: ${this.elapsed()}ms > ${this.maxMs}ms (RESOURCE_BUDGET_EXCEEDED).`, { step, elapsedMs: this.elapsed(), maxMs: this.maxMs });
    }
  }
}

function assertWorkerBudget(n, budgets = getBudgets()) {
  if (!Number.isInteger(n) || n < 1) {
    throw budgetError('RESOURCE_BUDGET_EXCEEDED', `Número de workers inválido: ${n}.`, { workers: n });
  }
  if (n > budgets.maxWorkers) {
    throw budgetError('RESOURCE_BUDGET_EXCEEDED', `Workers ${n} superan el máximo ${budgets.maxWorkers} (RESOURCE_BUDGET_EXCEEDED).`, { workers: n, maxWorkers: budgets.maxWorkers });
  }
  return true;
}

module.exports = {
  DEFAULTS,
  getBudgets,
  budgetError,
  checkFileSize,
  checkTextLength,
  checkJsonDepth,
  checkCount,
  checkPlayers,
  checkRounds,
  checkEvents,
  checkArrayItems,
  TimeBudget,
  assertWorkerBudget
};
