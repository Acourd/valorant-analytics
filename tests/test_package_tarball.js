#!/usr/bin/env node
'use strict';

/**
 * test_package_tarball.js — Verifica que el paquete es instalable de verdad:
 *  1. `npm pack` produce un tarball.
 *  2. Instalado en un directorio limpio, `require('valorant-analytics')` expone
 *     el motor SIN ejecutar la CLI (biblioteca sin efectos).
 *  3. El `bin` declarado ejecuta la CLI con `--help` (Exit 0).
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const useShell = process.platform === 'win32';

console.log('[TEST] Empaquetado e instalación desde tarball...');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'va-pack-'));
try {
  const pack = spawnSync(npmCmd, ['pack', '--silent', '--pack-destination', tmp], {
    cwd: rootDir, encoding: 'utf8', shell: useShell, timeout: 180000
  });
  assert.strictEqual(pack.status, 0, `npm pack falló: ${pack.stderr || pack.error}`);
  const tgz = fs.readdirSync(tmp).find(f => f.endsWith('.tgz'));
  assert.ok(tgz, 'npm pack no generó tarball');

  const app = path.join(tmp, 'app');
  fs.mkdirSync(app);
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'va-tarball-check', version: '1.0.0', private: true }));

  const inst = spawnSync(npmCmd, ['install', '--silent', '--no-audit', '--no-fund', '--ignore-scripts', path.join(tmp, tgz)], {
    cwd: app, encoding: 'utf8', shell: useShell, timeout: 240000
  });
  assert.strictEqual(inst.status, 0, `npm install falló: ${inst.stderr || inst.error}`);

  const installedDir = path.join(app, 'node_modules', 'valorant-analytics');
  assert.ok(fs.existsSync(installedDir), 'el paquete no quedó instalado');

  const lib = spawnSync(process.execPath, ['-e', "const m=require('valorant-analytics');console.log('LIB',typeof m.evaluateLearningProfile,typeof m.runCli);"], {
    cwd: app, encoding: 'utf8', timeout: 60000
  });
  assert.strictEqual(lib.status, 0, `require del paquete falló: ${lib.stderr}`);
  assert.ok(/LIB function function/.test(lib.stdout), 'la biblioteca instalada no expone el motor');
  assert.ok(!/UNIVERSAL SOVEREIGN|USO INTUITIVO/.test(lib.stdout), 'importar el paquete no debe ejecutar la CLI');

  const pkg = JSON.parse(fs.readFileSync(path.join(installedDir, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.main, 'scripts/index.js', 'main no apunta a la biblioteca');
  assert.strictEqual(pkg.bin['valorant-analytics'], 'scripts/cli.js', 'bin no apunta a la CLI');

  const bin = spawnSync(process.execPath, [path.join(installedDir, 'scripts', 'cli.js'), '--help'], {
    cwd: app, encoding: 'utf8', timeout: 60000
  });
  assert.strictEqual(bin.status, 0, `el bin --help falló: ${bin.stderr}`);
  assert.ok(/USO INTUITIVO/.test(bin.stdout), 'el bin no muestra la ayuda de la CLI');

  console.log('✓ Paquete instalable desde tarball verificado: biblioteca sin efectos + bin CLI + metadatos. Exit Code 0');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
