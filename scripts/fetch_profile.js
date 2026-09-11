#!/usr/bin/env node
'use strict';

/**
 * fetch_profile.js - Normalización LOCAL de Riot IDs (SIN red).
 *
 * La descarga remota está RETIRADA: Tracker.gg no es una fuente estable,
 * autorizada ni consentida. Se conserva `normalizeHandle` (puro) para enlaces
 * informativos y validación de formato.
 *
 * Para obtener un perfil, aporta un JSON/export del usuario, el texto del
 * marcador o una captura con confirmación. La vía autorizada es Riot RSO
 * (pendiente de credenciales).
 */

function normalizeHandle(handle) {
  const h = String(handle || '').trim();
  if (!h) throw new Error('Riot ID vacío: proporciona un handle en formato "Nombre#TAG".');
  // "TenZ 001#NA1" → "TenZ%20001%23NA1" ; tolera espacios alrededor de '#'
  return encodeURIComponent(h);
}

/**
 * Stubs fail-closed: la descarga remota fue retirada. No realizan peticiones
 * de red.
 */
function fetchProfile() {
  throw new Error('Descarga remota retirada: Tracker.gg no es una fuente estable, autorizada ni consentida. Aporta un JSON/export del perfil, texto del marcador o captura con confirmación; la vía autorizada es Riot RSO (pendiente de credenciales).');
}

function fetchHistory() {
  throw new Error('Descarga remota retirada: Tracker.gg no es una fuente estable, autorizada ni consentida. Aporta un JSON/export del perfil, texto del marcador o captura con confirmación; la vía autorizada es Riot RSO (pendiente de credenciales).');
}

if (require.main === module) {
  console.error('Este script ya no descarga perfiles (Tracker retirado). Rutas admitidas: JSON/export del usuario, texto del marcador, captura con confirmación o Riot RSO.');
  process.exit(1);
}

module.exports = {
  encodeHandle: normalizeHandle,
  normalizeHandle,
  fetchProfile,
  fetchHistory
};
