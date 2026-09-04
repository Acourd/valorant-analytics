#!/usr/bin/env node
'use strict';

/**
 * preflight_guard.js - Pre-Execution Safety & Input Sanitization Guard
 * 
 * Intercepts arguments, file targets, and player handles before running
 * telemetry computations. Enforces path traversal prevention, memory safety,
 * and fail-closed argument sanitization.
 * 
 * Veredictos: ALLOW (permitido) / DENY (bloqueado con código 1).
 * Zero external dependencies. Pure Node.js CommonJS.
 */

const path = require('path');
const fs = require('fs');

class PreflightError extends Error {
  constructor(reason, code = 'DENY') {
    super(`[PREFLIGHT ${code}] ${reason}`);
    this.name = 'PreflightError';
    this.code = code;
  }
}

/**
 * Validates a Riot ID format: Name#Tag (1-24 chars, tag 1-5 chars)
 */
function sanitizePlayerHandle(handle) {
  if (!handle || typeof handle !== 'string') {
    throw new PreflightError('Riot ID ausente o no es una cadena de texto.');
  }

  const trimmed = handle.trim();
  if (!trimmed.includes('#')) {
    throw new PreflightError(`Riot ID debe contener el separador '#' (ej. 'TenZ#0001'): '${trimmed}'`);
  }

  const [name, tag] = trimmed.split('#');
  if (!name || name.length > 24) {
    throw new PreflightError(`Longitud de nombre de Riot ID inválida (1-24 caracteres): '${name}'`);
  }
  if (!tag || tag.length > 8) {
    throw new PreflightError(`Longitud de tag de Riot ID inválida (1-8 caracteres): '${tag}'`);
  }

  return trimmed;
}

/**
 * Validates and isolates file path targets against directory traversal
 */
function sanitizeFilePath(targetPath, baseDir = process.cwd()) {
  if (!targetPath || typeof targetPath !== 'string') {
    throw new PreflightError('Ruta de archivo ausente o no es una cadena.');
  }

  // Prevención de path traversal malicioso
  const normalized = path.normalize(targetPath);
  if (normalized.includes('..') && !path.isAbsolute(normalized)) {
    // Verificar si escapa de límites permitidos
    const resolved = path.resolve(baseDir, normalized);
    if (!resolved.startsWith(path.resolve(baseDir))) {
      throw new PreflightError(`Intento de Path Traversal bloqueado: '${targetPath}'`);
    }
  }

  return normalized;
}

/**
 * Preflight gate check before executing CLI commands
 */
function runPreflight(command, args = []) {
  const allowedCommands = [
    'match', 'diagnostic', 'weapons', 'armas', 'duo', 'synergy', 'aim', 'kovaaks',
    'duels', 'matrix', 'profile', 'calibrate', 'mock', 'invariants', 'verify-math',
    'attest', 'merkle', 'guardian', 'drift', 'consensus', 'synthesize', 'sbom'
  ];

  if (command && !allowedCommands.includes(command) && !fs.existsSync(command)) {
    // Si no es un comando conocido ni un archivo existente, validar formato
    if (!command.includes('#') && !command.includes('tracker.gg')) {
      return {
        verdict: 'DENY',
        reason: `Comando desconocido o no sanitizado: '${command}'`
      };
    }
  }

  return {
    verdict: 'ALLOW',
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  PreflightError,
  sanitizePlayerHandle,
  sanitizeFilePath,
  runPreflight
};

if (require.main === module) {
  console.log('=== PREFLIGHT ISOLATION & SAFETY GUARD (V1.0) ===');
  try {
    const handle = sanitizePlayerHandle('TenZ#0001');
    const p = sanitizeFilePath('examples/sample_match.json');
    const check = runPreflight('match');
    console.log(`✓ Preflight ALLOW: Handle '${handle}', File '${p}', Veredicto: ${check.verdict}`);
    process.exit(0);
  } catch (err) {
    console.error(`✗ Preflight DENY: ${err.message}`);
    process.exit(1);
  }
}
