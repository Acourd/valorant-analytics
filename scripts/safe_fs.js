#!/usr/bin/env node
'use strict';

/**
 * safe_fs.js — Perímetro de archivos PRIVADO (extracto de la política ya
 * probada del keystore DSSE; misma lógica, sin modificarlo).
 *
 *   - Lectura SIN carrera TOCTOU: `lstat` → `open` con O_NOFOLLOW (donde la
 *     plataforma lo permite) → `fstat` → veredicto con el predicado PURO
 *     `substitutionDetected` (identidad dev/ino y, como señal ADICIONAL,
 *     tamaño/mtime/birthtime). Sustitución o enlace ⇒ fail-closed.
 *   - Windows no soporta O_NOFOLLOW y el file-id de NTFS puede reutilizarse al
 *     recrear un archivo: los metadatos actúan como segunda señal, pero la
 *     detección en Windows sigue siendo best-effort documentada (dos archivos
 *     con misma identidad Y mismos metadatos no son distinguibles).
 *   - Estadísticas inválidas (ausentes, no numéricas, NaN/Infinity) ⇒ detecta
 *     (fail-closed), nunca "sin sustitución" por defecto.
 *   - Política de directorio privado (pura y determinista): rechaza symlink,
 *     no-directorio, propietario ajeno (POSIX) y escritura de grupo/otros.
 *
 * Cero dependencias.
 */

const fs = require('fs');

const NOFOLLOW_FLAG = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
const DIRECTORY_FLAG = typeof fs.constants.O_DIRECTORY === 'number' ? fs.constants.O_DIRECTORY : 0;

function nofollowSupported() {
  return NOFOLLOW_FLAG !== 0;
}

/** lstat sin seguir enlaces; null si no existe. Lanza con error claro si no puede inspeccionar. */
function lstatRegularOrAbsent(p) {
  try {
    return fs.lstatSync(p);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw new Error(`No se pudo inspeccionar ${p}: ${e.message} (fail-closed).`);
  }
}

/**
 * Predicado PURO y total de sustitución entre dos inspecciones (el `lstat`
 * previo y el `fstat` del descriptor abierto). Determinista, sin fs ni entorno:
 *   - estadísticas inválidas (ausentes, no numéricas, NaN/Infinity) => detecta
 *     (fail-closed; nunca asumir "sin sustitución");
 *   - identidad `dev/ino` distinta => detecta;
 *   - identidad igual (o cero/no fiable, p. ej. Node/Windows) => detecta si
 *     cambian tamaño, mtime o birthtime. En NTFS el file-id puede reutilizarse
 *     al recrear el archivo: los metadatos son señal ADICIONAL y Windows sigue
 *     siendo best-effort documentado.
 * Devuelve `{ detected, reason }` con reason ∈ 'IDENTITY_CHANGED' |
 * 'METADATA_CHANGED' | 'INVALID_STAT' | null.
 */
function substitutionDetected(expectedStat, openedStat) {
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const valid = (st) => !!st && typeof st === 'object' && num(st.dev) && num(st.ino) && num(st.size) && num(st.mtimeMs);
  if (!valid(expectedStat) || !valid(openedStat)) return { detected: true, reason: 'INVALID_STAT' };
  if (expectedStat.dev !== openedStat.dev || expectedStat.ino !== openedStat.ino) {
    return { detected: true, reason: 'IDENTITY_CHANGED' };
  }
  const birthComparable = num(expectedStat.birthtimeMs) && num(openedStat.birthtimeMs);
  const metadataChanged = expectedStat.size !== openedStat.size ||
    expectedStat.mtimeMs !== openedStat.mtimeMs ||
    (birthComparable
      ? expectedStat.birthtimeMs !== openedStat.birthtimeMs
      : num(expectedStat.birthtimeMs) !== num(openedStat.birthtimeMs));
  if (metadataChanged) return { detected: true, reason: 'METADATA_CHANGED' };
  return { detected: false, reason: null };
}

/** Lectura resistente a TOCTOU. Devuelve Buffer, o null si el archivo no existe.
 * `expectedStat` es el lstat previo; el veredicto lo da `substitutionDetected`.
 */
function readFileNoFollow(p, what, expectedStat) {
  let fd = null;
  try {
    fd = fs.openSync(p, fs.constants.O_RDONLY | NOFOLLOW_FLAG);
  } catch (e) {
    if (e.code === 'ELOOP') {
      throw new Error(`El ${what} es un enlace simbólico (${p}): perímetro de archivos violado; jamás se sigue (fail-closed).`);
    }
    if (e.code === 'ENOENT') return null;
    throw new Error(`No se pudo abrir ${what} (${p}): ${e.message} (fail-closed).`);
  }
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile()) {
      throw new Error(`El ${what} (${p}) no es un archivo regular: fail-closed.`);
    }
    if (expectedStat) {
      const verdict = substitutionDetected(expectedStat, opened);
      if (verdict.detected) {
        const motivo = verdict.reason === 'IDENTITY_CHANGED' ? 'dev/ino cambiaron'
          : verdict.reason === 'METADATA_CHANGED' ? 'metadatos de identidad cambiaron'
            : 'estadísticas de archivo inválidas';
        throw new Error(`Sustitución detectada en ${what} (${p}) entre la inspección y la apertura: fail-closed (${motivo}).`);
      }
    }
    return fs.readFileSync(fd);
  } finally {
    try { fs.closeSync(fd); } catch (e) { /* cerrado */ }
  }
}

/**
 * Política de directorio privado (pura): null si es admisible, o el motivo.
 * Rechaza escritura de grupo/otros (0o022) y propietario ajeno en POSIX; en
 * Windows se delega a la ACL (`applyPlatformPolicy=false`).
 */
function storageDirPolicyViolation(mode, uid, currentUid, applyPlatformPolicy = true) {
  if (!applyPlatformPolicy) return null;
  if ((mode & 0o022) !== 0) return 'permite escritura al grupo o a otros';
  if (typeof uid === 'number' && typeof currentUid === 'number' && uid !== currentUid) {
    return `pertenece a otro usuario (uid ${uid} ≠ ${currentUid})`;
  }
  return null;
}

/**
 * Verifica el perímetro de un directorio existente (no lo crea). Devuelve la
 * ruta o lanza con `code` (por defecto RESOURCE/perímetro). El llamador decide
 * el código de dominio.
 */
function assertDirSafe(dirPath, { code = 'UNSAFE_PATH' } = {}) {
  const st = lstatRegularOrAbsent(dirPath);
  if (st === null) return null; // no existe: lo crea el llamador tras validar
  const err = (msg) => {
    const e = new Error(msg);
    e.code = code;
    return e;
  };
  if (st.isSymbolicLink()) throw err(`El directorio (${dirPath}) es un enlace simbólico: perímetro violado; jamás se sigue (fail-closed).`);
  if (!st.isDirectory()) throw err(`La ruta (${dirPath}) no es un directorio: fail-closed.`);
  if (process.platform !== 'win32') {
    const currentUid = typeof process.getuid === 'function' ? process.getuid() : null;
    const violation = storageDirPolicyViolation(st.mode & 0o7777, typeof st.uid === 'number' ? st.uid : null, currentUid, true);
    if (violation) {
      throw err(`El directorio (${dirPath}, modo ${(st.mode & 0o7777).toString(8)}) ${violation}: perímetro no privado (fail-closed; exige 0700 propiedad del usuario actual).`);
    }
  }
  return st;
}

/**
 * Política de PADRE INTERMEDIO (no raíz, no directorio final): no puede ser
 * escribible por grupo/otros ni pertenecer a otro usuario distinto del actual
 * (se tolera root como propietario de directorios de sistema, p. ej.
 * /var/folders en macOS). Los hijos directos de la raíz quedan exentos de
 * política (p. ej. /tmp, /var): son raíces de sistema, no padres controlables.
 */
function intermediateDirPolicyViolation(mode, uid, currentUid) {
  if ((mode & 0o022) !== 0) return 'permite escritura de grupo o de otros';
  if (typeof uid === 'number' && typeof currentUid === 'number' && uid !== currentUid && uid !== 0) {
    return `pertenece a otro usuario (uid ${uid} ≠ ${currentUid})`;
  }
  return null;
}

/**
 * Crea/valida un directorio privado recorriendo TODOS los componentes de la
 * ruta desde la raíz (o desde el root de la unidad en Windows):
 *   - cualquier componente que sea symlink/junction => fail-closed, salvo la
 *     excepción mínima de symlinks de sistema hijos directos de la raíz;
 *   - cualquier componente que no sea directorio => fail-closed;
 *   - la creación es ESCALONADA (nunca `recursive: true` a través de padres no
 *     validados): cada nivel nuevo se crea sin recursión y se re-inspecciona;
 *   - PADRES INTERMEDIOS: no escribibles por grupo/otros y no de otro usuario;
 *   - el directorio FINAL exige además propiedad del usuario actual y se ajusta
 *     a 0700.
 * Devuelve la ruta resuelta.
 */
function ensurePrivateDir(dirPath, { code = 'UNSAFE_PATH' } = {}) {
  const path = require('path');
  const err = (msg) => {
    const e = new Error(msg);
    e.code = code;
    return e;
  };
  const resolved = path.resolve(dirPath);
  const parsed = path.parse(resolved);
  const parts = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);
  if (parts.length === 0) throw err(`Ruta de directorio inválida: ${dirPath}`);
  let current = parsed.root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const isFinal = i === parts.length - 1;
    let st = lstatRegularOrAbsent(current);
    if (st !== null && st.isSymbolicLink()) {
      // Única excepción: symlinks de SISTEMA que cuelgan directamente de la
      // raíz (p. ej. /var -> /private/var, /tmp -> /private/tmp en macOS).
      // Cualquier symlink bajo un padre no-raíz (el vector de evasión
      // `/ruta/enlace/planes`) o en el componente final se rechaza.
      const parentIsRoot = path.dirname(current) === parsed.root;
      if (isFinal || !parentIsRoot) {
        throw err(`Un componente de la ruta es un enlace simbólico (${current}): perímetro violado; jamás se sigue, ni en padres ni en abuelos (fail-closed).`);
      }
      let real;
      try {
        real = fs.realpathSync(current);
      } catch (e) {
        throw err(`No se pudo resolver el symlink de sistema (${current}): ${e.message} (fail-closed).`);
      }
      const realStat = lstatRegularOrAbsent(real);
      if (realStat === null || realStat.isSymbolicLink() || !realStat.isDirectory()) {
        throw err(`El destino del symlink de sistema (${current} -> ${real}) no es un directorio regular: fail-closed.`);
      }
      current = real;
      st = realStat;
    }
    if (st === null) {
      try {
        fs.mkdirSync(current);
      } catch (e) {
        if (e.code !== 'EEXIST') throw err(`No se pudo crear el directorio (${current}): ${e.message} (fail-closed).`);
      }
      st = lstatRegularOrAbsent(current);
      if (st === null) throw err(`Directorio no creado (${current}): fail-closed.`);
      if (st.isSymbolicLink()) {
        throw err(`Carrera de creación: (${current}) apareció como enlace simbólico: fail-closed.`);
      }
    }
    if (!st.isDirectory()) {
      throw err(`Un componente de la ruta no es un directorio (${current}): fail-closed.`);
    }
    if (isFinal) {
      // Primero la política (rechaza 0770/0777 existentes); solo después el
      // ajuste a 0700 del directorio que ya pasó el perímetro.
      if (process.platform !== 'win32') {
        const currentUid = typeof process.getuid === 'function' ? process.getuid() : null;
        const violation = storageDirPolicyViolation(st.mode & 0o7777, typeof st.uid === 'number' ? st.uid : null, currentUid, true);
        if (violation) {
          throw err(`El directorio (${current}, modo ${(st.mode & 0o7777).toString(8)}) ${violation}: perímetro no privado (fail-closed; exige 0700 propiedad del usuario actual).`);
        }
      }
      try { fs.chmodSync(current, 0o700); } catch (e) { /* Windows: mejor esfuerzo */ }
    } else if (i > 0 && process.platform !== 'win32') {
      // Padre/abuelo intermedio: un ancestro controlable invalidaría el
      // perímetro final aunque `plans` acabe en 0700.
      const currentUid = typeof process.getuid === 'function' ? process.getuid() : null;
      const violation = intermediateDirPolicyViolation(st.mode & 0o7777, typeof st.uid === 'number' ? st.uid : null, currentUid);
      if (violation) {
        throw err(`El directorio padre (${current}, modo ${(st.mode & 0o7777).toString(8)}) ${violation}: un ancestro controlable invalidaría el perímetro (fail-closed).`);
      }
    }
  }
  return resolved;
}

module.exports = {
  nofollowSupported,
  lstatRegularOrAbsent,
  substitutionDetected,
  readFileNoFollow,
  storageDirPolicyViolation,
  intermediateDirPolicyViolation,
  assertDirSafe,
  ensurePrivateDir
};
