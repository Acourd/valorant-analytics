#!/usr/bin/env node
'use strict';

/**
 * run_all_tests.js — Runner único de CI/local.
 *
 * Ejecuta `test_suite.js` (harness determinista con gate de manifiesto) y
 * TODAS las suites modulares de `tests/*.js`. Falla (exit 1) si cualquier
 * suite falla, de modo que ninguna queda fuera de CI por olvido.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const modularDir = path.join(rootDir, 'tests');
const suites = ['test_suite.js'];
if (fs.existsSync(modularDir)) {
  fs.readdirSync(modularDir)
    .filter(f => f.endsWith('.js'))
    .sort()
    .forEach(f => suites.push(path.join('tests', f)));
}

console.log(`RUN_ALL_TESTS: ${suites.length} suites (test_suite + ${suites.length - 1} modulares)`);
const failed = [];
for (const suite of suites) {
  const start = Date.now();
  const res = spawnSync(process.execPath, [suite], { cwd: rootDir, stdio: 'inherit' });
  const ms = Date.now() - start;
  if (res.status !== 0) {
    failed.push({ suite, status: res.status, ms });
    console.error(`FAIL ${suite} (exit ${res.status}, ${ms}ms)`);
  } else {
    console.log(`PASS ${suite} (${ms}ms)`);
  }
}

if (failed.length > 0) {
  console.error(`RUN_ALL_TESTS: ${failed.length}/${suites.length} suites fallaron: ${failed.map(f => `${f.suite}(${f.status})`).join(', ')}`);
  process.exit(1);
}
console.log(`RUN_ALL_TESTS: TODAS LAS SUITES OK (${suites.length}/${suites.length})`);
