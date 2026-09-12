#!/usr/bin/env node
'use strict';

/**
 * run_all_tests.js — Runner único de CI/local.
 *
 * Ejecuta:
 *   1. Comprobación de sintaxis de TODOS los .js (`check_syntax.js`).
 *   2. `test_suite.js` (harness determinista con gate de manifiesto).
 *   3. TODAS las suites modulares de `tests/*.js`, incluida la de
 *      propiedades/fuzz con TRES semillas fijas (mismo resultado siempre).
 * Falla (exit 1) si cualquier paso falla, de modo que ninguna suite queda
 * fuera de CI por olvido.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const modularDir = path.join(rootDir, 'tests');
const PROPERTY_SEEDS = [0xA11CE5, 0xBEEF01, 0xC0FFEE];

const steps = [{ label: 'check_syntax.js', args: ['check_syntax.js'], env: {} }, { label: 'test_suite.js', args: ['test_suite.js'], env: {} }];

if (fs.existsSync(modularDir)) {
  fs.readdirSync(modularDir)
    .filter(f => f.endsWith('.js'))
    .sort()
    .forEach(f => {
      const rel = path.join('tests', f);
      if (f === 'test_property_fuzz.js') {
        PROPERTY_SEEDS.forEach(seed => steps.push({ label: `${rel} [seed ${seed}]`, args: [rel], env: { PROP_SEED: String(seed) } }));
      } else {
        steps.push({ label: rel, args: [rel], env: {} });
      }
    });
}

console.log(`RUN_ALL_TESTS: ${steps.length} pasos (syntax + test_suite + suites modulares; fuzz con ${PROPERTY_SEEDS.length} semillas)`);
const failed = [];
for (const step of steps) {
  const start = Date.now();
  const res = spawnSync(process.execPath, step.args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: Object.assign({}, process.env, step.env)
  });
  const ms = Date.now() - start;
  if (res.status !== 0) {
    failed.push({ label: step.label, status: res.status, ms });
    console.error(`FAIL ${step.label} (exit ${res.status}, ${ms}ms)`);
  } else {
    console.log(`PASS ${step.label} (${ms}ms)`);
  }
}

if (failed.length > 0) {
  console.error(`RUN_ALL_TESTS: ${failed.length}/${steps.length} pasos fallaron: ${failed.map(f => `${f.label}(${f.status})`).join(', ')}`);
  process.exit(1);
}
console.log(`RUN_ALL_TESTS: TODOS LOS PASOS OK (${steps.length}/${steps.length})`);
