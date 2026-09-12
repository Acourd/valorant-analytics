#!/usr/bin/env node
'use strict';

/**
 * check_syntax.js — Comprobación de sintaxis para TODOS los scripts Node.
 *
 * Ejecuta `node --check` sobre cada .js del repositorio (scripts, tests, raíz
 * y herramientas), excluyendo artefactos locales (.git/.cache/.pipeline), y
 * falla con exit 1 si algún archivo no compila. Sin dependencias.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const EXCLUDE_DIRS = new Set(['.git', '.cache', '.pipeline', 'node_modules']);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(path.join(dir, entry.name));
    }
  }
}

walk(rootDir);
files.sort();

const failures = [];
for (const file of files) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 30000 });
  if (res.status !== 0) {
    failures.push({ file: path.relative(rootDir, file), error: String(res.stderr || res.error || '').split('\n')[0] });
  }
}

if (failures.length > 0) {
  console.error(`CHECK_SYNTAX: ${failures.length}/${files.length} archivos con errores de sintaxis:`);
  for (const f of failures) console.error(`  - ${f.file}: ${f.error}`);
  process.exit(1);
}
console.log(`CHECK_SYNTAX: ${files.length}/${files.length} archivos .js compilan (Exit 0)`);
