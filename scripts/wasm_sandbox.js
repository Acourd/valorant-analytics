'use strict';

/**
 * wasm_sandbox.js — WebAssembly Execution Sandbox (memoria importada).
 *
 * Aislamiento REAL y verificable:
 *   1. El módulo ejecutado IMPORTA la memoria del host (`env.memory`), por lo
 *      que la cuota configurada (`maximum`) es la que el runtime aplica de
 *      verdad: crecer más allá del máximo lanza RangeError.
 *   2. Cero capacidades de host además de la memoria importada (sin syscalls,
 *      sin filesystem, sin red).
 *   3. Operaciones de buffer con comprobación estricta de límites.
 *
 * El reporte (`auditIsolation`) declara EXCLUSIVAMENTE límites que el runtime
 * impone: la cuota se acredita con una sonda de crecimiento (`probeQuota`),
 * no con el valor configurado.
 *
 * Zero external dependencies. Node.js native CommonJS.
 */

// Módulo mínimo que IMPORTA "env"."memory" y exporta add(i32, i32) -> i32.
const IMPORTED_MEMORY_WASM_BYTECODE = Buffer.from([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // Magic & Version
  0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f, // Type: (i32, i32) -> i32
  0x02, 0x0f, 0x01, 0x03, 0x65, 0x6e, 0x76, 0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, 0x02, 0x00, 0x01, // Import env.memory (min 1)
  0x03, 0x02, 0x01, 0x00,                         // Function: func 0
  0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00, // Export: add
  0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b // Code: i32.add
]);

const PAGE_SIZE_BYTES = 65536;
const MIN_PAGES = 1;
const MAX_PAGES = 64; // política local documentada (4 MiB); el runtime admite más

function validPages(value, fallback) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < MIN_PAGES || n > MAX_PAGES) return null;
  return n;
}

class WasmSandbox {
  constructor(options = {}) {
    const initial = validPages(options.initialPages, 1);
    if (initial === null) {
      throw new RangeError(`initialPages inválido: entero en [${MIN_PAGES}, ${MAX_PAGES}] requerido (recibido: ${options.initialPages}).`);
    }
    const maximum = validPages(options.maximumPages, 2);
    if (maximum === null) {
      throw new RangeError(`maximumPages inválido: entero en [${MIN_PAGES}, ${MAX_PAGES}] requerido (recibido: ${options.maximumPages}).`);
    }
    if (maximum < initial) {
      throw new RangeError(`maximumPages (${maximum}) no puede ser menor que initialPages (${initial}).`);
    }
    this.initialPages = initial;
    this.maximumPages = maximum;
    this.memory = null;
    this.instance = null;
    this.module = null;
    this.hostCapabilitiesAllowed = false;
    this.init();
  }

  init() {
    // La memoria del host se crea con la cuota y SE IMPORTA al módulo: la
    // misma memoria que el módulo usa es la que el host limita.
    this.memory = new WebAssembly.Memory({
      initial: this.initialPages,
      maximum: this.maximumPages
    });

    this.module = new WebAssembly.Module(IMPORTED_MEMORY_WASM_BYTECODE);
    this.instance = new WebAssembly.Instance(this.module, { env: { memory: this.memory } });

    if (this.instance.exports.memory !== undefined) {
      throw new Error('El módulo sandbox no debe exportar su propia memoria: la cuota quedaría sin efecto.');
    }
  }

  getMemoryStats() {
    const currentBuffer = this.memory.buffer;
    return {
      pageSizeBytes: PAGE_SIZE_BYTES,
      currentPages: currentBuffer.byteLength / PAGE_SIZE_BYTES,
      maxPages: this.maximumPages,
      byteLength: currentBuffer.byteLength,
      quotaMechanism: 'imported-host-memory',
      hostIsolation: 'ZERO_SYSCALL_IMPORTED_MEMORY'
    };
  }

  writeMemory(offset, data) {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const memBuffer = this.memory.buffer;
    const target = new Uint8Array(memBuffer);

    if (!Number.isInteger(offset) || offset < 0 || offset + buffer.length > memBuffer.byteLength) {
      throw new RangeError(`Violación de límites de memoria Wasm: offset ${offset} + longitud ${buffer.length} excede ${memBuffer.byteLength} bytes.`);
    }

    target.set(buffer, offset);
    return { success: true, writtenBytes: buffer.length, offset };
  }

  readMemory(offset, length) {
    const memBuffer = this.memory.buffer;
    if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0 || offset + length > memBuffer.byteLength) {
      throw new RangeError(`Violación de lectura de memoria Wasm: offset ${offset} + longitud ${length} excede ${memBuffer.byteLength} bytes.`);
    }

    const view = new Uint8Array(memBuffer, offset, length);
    return Buffer.from(view);
  }

  executeFunction(name, ...args) {
    const fn = this.instance.exports[name];
    if (typeof fn !== 'function') {
      throw new TypeError(`Función exportada '${name}' no encontrada en el módulo Wasm.`);
    }
    return fn(...args);
  }

  /**
   * Sonda de cuota: crea una memoria con el mismo máximo y comprueba que el
   * runtime RECHAZA crecer más allá. Devuelve true solo si el runtime impone
   * el límite (evidencia, no configuración).
   */
  static probeQuota(maximumPages) {
    try {
      const memory = new WebAssembly.Memory({ initial: MIN_PAGES, maximum: maximumPages });
      memory.grow(maximumPages - MIN_PAGES + 1); // una página más allá del máximo
      return false;
    } catch (e) {
      return true;
    }
  }

  auditIsolation() {
    const stats = this.getMemoryStats();
    const quotaProof = WasmSandbox.probeQuota(this.maximumPages);
    const imports = this.module ? WebAssembly.Module.imports(this.module) : [];
    const importsHostMemory = imports.length === 1 && imports[0].module === 'env' && imports[0].name === 'memory' && imports[0].kind === 'memory';
    return {
      memoryBounded: stats.currentPages <= this.maximumPages,
      quotaEnforced: quotaProof,
      quotaMechanism: 'imported-host-memory (maximum verificado por sonda de crecimiento)',
      maxPagesEnforced: quotaProof ? this.maximumPages : null,
      moduleImportsHostMemory: importsHostMemory,
      zeroSyscallGuaranteed: !this.hostCapabilitiesAllowed,
      linearMemoryStrict: true,
      verdict: quotaProof && importsHostMemory ? 'ISOLATION_VERIFIED' : 'QUOTA_NOT_ENFORCED'
    };
  }
}

module.exports = WasmSandbox;
module.exports.MIN_PAGES = MIN_PAGES;
module.exports.MAX_PAGES = MAX_PAGES;
module.exports.PAGE_SIZE_BYTES = PAGE_SIZE_BYTES;
