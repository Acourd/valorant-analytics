#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const {
  PreflightError,
  sanitizePlayerHandle,
  sanitizeFilePath,
  runPreflight
} = require(path.join(__dirname, '..', 'scripts', 'preflight_guard'));

console.log('[TEST] Iniciando verificación de Preflight Guard...');

// 1. Sanitize Player Handle
const validHandle = sanitizePlayerHandle('TenZ#0001');
assert.strictEqual(validHandle, 'TenZ#0001', 'Riot ID válido debe preservarse');

assert.throws(() => {
  sanitizePlayerHandle('TenZWithoutTag');
}, PreflightError, 'Debe lanzar PreflightError si falta el tag (#)');

assert.throws(() => {
  sanitizePlayerHandle('');
}, PreflightError, 'Debe lanzar PreflightError si el handle está vacío');

assert.throws(() => {
  sanitizePlayerHandle('A'.repeat(30) + '#0001');
}, PreflightError, 'Debe lanzar PreflightError si el nombre excede 24 caracteres');

// 2. Sanitize File Path & Path Traversal Prevention
const safePath = sanitizeFilePath('examples/sample_match.json');
assert(typeof safePath === 'string', 'Ruta segura debe normalizarse');

// 3. Command Preflight Checks
const allowVerdict = runPreflight('match', ['examples/sample_match.json', 'TenZ#0001']);
assert.strictEqual(allowVerdict.verdict, 'ALLOW', 'Comando match válido debe ser ALLOW');

const denyVerdict = runPreflight('malicious_rm_rf_command', []);
assert.strictEqual(denyVerdict.verdict, 'DENY', 'Comando desconocido sin archivo debe ser DENY');

console.log('✓ Todas las aserciones de Preflight Guard pasaron exitosamente (Exit Code 0).');
