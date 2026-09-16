#!/usr/bin/env node
'use strict';

/**
 * safe_fs.js — Perímetro de archivos PRIVADO (extracto de la política ya
 * probada del keystore DSSE; misma lógica, sin modificarlo).
 *
 *   - Lectura SIN carrera TOCTOU: `lstat` → `open` con O_NOFOLLOW (donde la
 *     plataforma lo permite) → `fstat` → comparación dev/ino contra la
 *     inspección previa. Sustitución o enlace ⇒ fail-closed.
 *   - Windows no soporta O_NOFOLLOW: la sustitución se detecta con dev/ino del
 *     descriptor (NTFS expone file-id estable); se documenta como best-effort
 *     equivalente.
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
 * Lectura resistente a TOCTOU. Devuelve Buffer, o null si el archivo no existe.
 * `expectedStat` es el lstat previo; si dev/ino cambian, falla cerrado.
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
    if (expectedStat && (opened.dev !== expectedStat.dev || opened.ino !== expectedStat.ino)) {
      throw new Error(`Sustitución detectada en ${what} (${p}) entre la inspección y la apertura: fail-closed (dev/ino cambiaron).`);
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

module.exports = {
  nofollowSupported,
  lstatRegularOrAbsent,
  readFileNoFollow,
  storageDirPolicyViolation,
  assertDirSafe
};
