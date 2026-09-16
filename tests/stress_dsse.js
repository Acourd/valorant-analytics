#!/usr/bin/env node
'use strict';

/**
 * stress_dsse.js — Modalidad de ESTRÉS acotada (fuera de la matriz normal).
 *
 * Ejecuta rondas secuenciales de registro concurrente en el keystore DSSE y
 * exige el invariante completo en CADA ronda: todas las claves presentes y
 * `generation` suficiente. Sin reintentos: la primera pérdida falla el proceso
 * y se imprime el error original (nada se oculta).
 *
 * Uso:  node tests/stress_dsse.js        (VA_STRESS_ROUNDS=3 por defecto)
 * CI:   job `stress` (ubuntu, Node 20). La matriz normal omite este archivo.
 */

const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { assertWorkerBudget, getBudgets } = require(path.join(__dirname, '..', 'scripts', 'resource_budget.js'));

const ROUNDS = Number(process.env.VA_STRESS_ROUNDS || 3);
const WORKERS = Number(process.env.VA_STRESS_WORKERS || getBudgets().maxWorkers);
assertWorkerBudget(WORKERS);
assert.ok(Number.isInteger(ROUNDS) && ROUNDS >= 1 && ROUNDS <= 20, `VA_STRESS_ROUNDS inválido: ${ROUNDS}`);

const dssePath = path.join(__dirname, '..', 'scripts', 'dsse_attestation.js');
console.log(`STRESS_DSSE: ${ROUNDS} rondas × ${WORKERS} workers concurrentes`);

for (let round = 1; round <= ROUNDS; round++) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `dsse-stress-r${round}-`));
  try {
    const ksPath = path.join(tmp, 'ks.json');
    const workerScript = path.join(tmp, 'reg.js');
    fs.writeFileSync(workerScript, `
const dsse = require(${JSON.stringify(dssePath)});
const tid = require('worker_threads').threadId;
const k = dsse.generateAttestationKeyPair();
dsse.registerTrustedKey(${JSON.stringify(ksPath)}, k.publicKey.export({ type: 'spki', format: 'pem' }), 'stress-r' + ${round} + '-' + tid);
`);
    const coordScript = path.join(tmp, 'coord.js');
    fs.writeFileSync(coordScript, `
const { Worker } = require('worker_threads');
const dsse = require(${JSON.stringify(dssePath)});
(async () => {
  const workers = [];
  for (let i = 0; i < ${WORKERS}; i++) {
    workers.push(new Promise((resolve, reject) => {
      const w = new Worker(${JSON.stringify(workerScript)});
      w.on('error', (e) => reject(new Error('worker ' + i + ': ' + e.message)));
      w.on('exit', (code) => code === 0 ? resolve(i) : reject(new Error('worker ' + i + ' exit ' + code)));
    }));
  }
  await Promise.all(workers);
  const ks = dsse.loadOrCreateKeystore(${JSON.stringify(ksPath)});
  if (ks.keys.length !== ${WORKERS}) { console.error('KEYS=' + ks.keys.length); process.exit(1); }
  if (ks.generation < ${WORKERS}) { console.error('GEN=' + ks.generation); process.exit(1); }
  console.log('ROUND_OK ${WORKERS}/${WORKERS} gen ' + ks.generation);
})();
`);
    let out = '';
    try {
      out = execFileSync(process.execPath, [coordScript], { encoding: 'utf8', timeout: 180000 });
    } catch (e) {
      // Primer error visible y fallo inmediato: SIN reintentos silenciosos.
      console.error(`STRESS_DSSE ronda ${round} FALLÓ: ${String(e.stderr || e.message || '').slice(0, 800)}`);
      process.exit(1);
    }
    assert.ok(out.includes(`ROUND_OK ${WORKERS}/${WORKERS}`), `ronda ${round}: ${out.slice(0, 200)}`);
    console.log(`  ronda ${round}: OK (${WORKERS}/${WORKERS} claves)`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

console.log(`STRESS_DSSE OK: ${ROUNDS} rondas × ${WORKERS} workers, invariante completo en todas.`);
