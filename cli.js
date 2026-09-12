#!/usr/bin/env node
'use strict';

/**
 * cli.js (raíz) — Launcher ejecutable de la CLI documentada.
 *
 * `node cli.js <comando>` funciona desde la raíz del repositorio sin conocer
 * rutas internas ni instalar el paquete. Como módulo, reexporta la API de la CLI.
 */

const cli = require('./scripts/cli.js');

if (require.main === module) {
  const { exitCode } = cli.runCli(process.argv.slice(2));
  // exitCode (no process.exit) para no truncar stdout grande en pipes.
  process.exitCode = exitCode;
}

module.exports = cli;
