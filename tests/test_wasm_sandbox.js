'use strict';

const assert = require('assert');
const path = require('path');
const WasmSandbox = require('../scripts/wasm_sandbox.js');

console.log('=== Test Suite: @valorant-analytics/wasm_sandbox WebAssembly Isolation Engine ===\n');

// 1. Instantiation and memory limits
const sandbox = new WasmSandbox({ initialPages: 1, maximumPages: 2 });
const stats = sandbox.getMemoryStats();
assert.strictEqual(stats.pageSizeBytes, 65536);
assert.strictEqual(stats.currentPages, 1);
assert.strictEqual(stats.maxPages, 2);
assert.strictEqual(stats.byteLength, 65536);
assert.strictEqual(stats.hostIsolation, 'STRICT_ZERO_SYSCALL');
console.log('✓ Inicialización de sandbox Wasm con cuota estricta de páginas (1-2)');

// 2. Pure compute function execution
const result = sandbox.executeFunction('add', 25, 17);
assert.strictEqual(result, 42);
console.log('✓ Ejecución aislada de función pura WebAssembly add(25, 17) -> 42');

// 3. Linear memory read & write within bounds
const payload = Buffer.from('VALORANT_TELEMETRY_WASM_SANDBOX');
const writeRes = sandbox.writeMemory(1024, payload);
assert.strictEqual(writeRes.success, true);
assert.strictEqual(writeRes.writtenBytes, payload.length);

const readBack = sandbox.readMemory(1024, payload.length);
assert.strictEqual(readBack.toString(), 'VALORANT_TELEMETRY_WASM_SANDBOX');
console.log('✓ Escritura y lectura determinista en memoria lineal aislada de 64KB');

// 4. Memory boundary enforcement (out-of-bounds rejection)
assert.throws(() => {
  sandbox.writeMemory(65530, Buffer.from('OVERFLOW_ATTACK_BEYOND_PAGE_LIMIT'));
}, RangeError);

assert.throws(() => {
  sandbox.readMemory(-1, 10);
}, RangeError);
console.log('✓ Violación de frontera de memoria Wasm interceptada fail-closed (RangeError)');

// 5. Isolation audit attestation
const audit = sandbox.auditIsolation();
assert.strictEqual(audit.memoryBounded, true);
assert.strictEqual(audit.zeroSyscallGuaranteed, true);
assert.strictEqual(audit.linearMemoryStrict, true);
assert.strictEqual(audit.verdict, 'ISOLATION_VERIFIED');
console.log('✓ Auditoría formal de aislamiento micro-VM atestiguada (ISOLATION_VERIFIED)');

console.log('\nPASS @valorant-analytics/wasm_sandbox — Sandbox de aislamiento WebAssembly verificado (Exit Code 0).');
process.exit(0);
