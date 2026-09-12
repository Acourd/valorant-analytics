'use strict';

const assert = require('assert');
const WasmSandbox = require('../scripts/wasm_sandbox.js');

console.log('=== Test Suite: @valorant-analytics/wasm_sandbox WebAssembly Isolation Engine ===\n');

// 1. Instantiation and REAL quota (imported host memory)
const sandbox = new WasmSandbox({ initialPages: 1, maximumPages: 2 });
const stats = sandbox.getMemoryStats();
assert.strictEqual(stats.pageSizeBytes, 65536);
assert.strictEqual(stats.currentPages, 1);
assert.strictEqual(stats.maxPages, 2);
assert.strictEqual(stats.byteLength, 65536);
assert.strictEqual(stats.quotaMechanism, 'imported-host-memory');
console.log('✓ Cuota real: el módulo importa WebAssembly.Memory del host (1-2 páginas)');

// 2. Pure compute function execution
const result = sandbox.executeFunction('add', 25, 17);
assert.strictEqual(result, 42);
console.log('✓ Ejecución aislada de función pura WebAssembly add(25, 17) -> 42');

// 3. Linear memory read & write within bounds (same memory the module imports)
const payload = Buffer.from('VALORANT_TELEMETRY_WASM_SANDBOX');
const writeRes = sandbox.writeMemory(1024, payload);
assert.strictEqual(writeRes.success, true);
assert.strictEqual(writeRes.writtenBytes, payload.length);

const readBack = sandbox.readMemory(1024, payload.length);
assert.strictEqual(readBack.toString(), 'VALORANT_TELEMETRY_WASM_SANDBOX');
console.log('✓ Escritura y lectura determinista en la memoria importada del módulo');

// 4. Memory boundary enforcement (out-of-bounds rejection)
assert.throws(() => {
  sandbox.writeMemory(65530, Buffer.from('OVERFLOW_ATTACK_BEYOND_PAGE_LIMIT'));
}, RangeError);

assert.throws(() => {
  sandbox.readMemory(-1, 10);
}, RangeError);
assert.throws(() => {
  sandbox.writeMemory(1.5, Buffer.from('x'));
}, RangeError);
console.log('✓ Violación de frontera de memoria Wasm interceptada fail-closed (RangeError)');

// 5. Cuota verificable por el RUNTIME: crecer más allá del máximo es rechazado
assert.strictEqual(WasmSandbox.probeQuota(2), true, 'el runtime impone el máximo configurado');
assert.strictEqual(WasmSandbox.probeQuota(1), true, 'máximo mínimo también se impone');
assert.strictEqual(WasmSandbox.probeQuota(64), true, 'máximo superior también se impone');
const grown = sandbox.memory.grow(1);
assert.strictEqual(grown, 1, 'grow devuelve el tamaño previo (1 página) y crece a 2');
assert.strictEqual(sandbox.memory.buffer.byteLength, 2 * 65536, 'la memoria creció hasta el máximo');
assert.throws(() => sandbox.memory.grow(1), RangeError, 'crecer más allá del máximo debe fallar');
console.log('✓ El límite de páginas es aplicado por el runtime (no decorativo), verificado por sonda');

// 6. Fronteras de configuración: mínimo, máximo y valores inválidos
assert.doesNotThrow(() => new WasmSandbox({ initialPages: 1, maximumPages: 1 }));
assert.doesNotThrow(() => new WasmSandbox({ initialPages: 1, maximumPages: 64 }));
assert.doesNotThrow(() => new WasmSandbox({ initialPages: 64, maximumPages: 64 }));
for (const bad of [
  { initialPages: 0 }, { initialPages: -1 }, { initialPages: 1.5 }, { initialPages: 65 },
  { maximumPages: 0 }, { maximumPages: 1.5 }, { maximumPages: 65 },
  { initialPages: 4, maximumPages: 2 }
]) {
  assert.throws(() => new WasmSandbox(bad), RangeError, `configuración inválida aceptada: ${JSON.stringify(bad)}`);
}
console.log('✓ Fronteras de configuración: mín 1 / máx 64 / inválidos rechazados con RangeError');

// 7. Isolation audit attestation (solo límites impuestos por el runtime)
const audit = sandbox.auditIsolation();
assert.strictEqual(audit.memoryBounded, true);
assert.strictEqual(audit.quotaEnforced, true);
assert.strictEqual(audit.maxPagesEnforced, 2);
assert.strictEqual(audit.zeroSyscallGuaranteed, true);
assert.strictEqual(audit.linearMemoryStrict, true);
assert.strictEqual(audit.verdict, 'ISOLATION_VERIFIED');
console.log('✓ Auditoría de aislamiento acreditada por sonda de cuota (ISOLATION_VERIFIED)');

console.log('\nPASS @valorant-analytics/wasm_sandbox — Sandbox de aislamiento WebAssembly verificado (Exit Code 0).');
process.exit(0);
