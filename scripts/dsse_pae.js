'use strict';

/**
 * dsse_pae.js — Pre-Authentication Encoding (PAE) byte-correcta de DSSE.
 *
 * PAE(type, body) = "DSSEv1" SP len(type) SP type SP len(body) SP body
 * donde len() es la longitud en BYTES y la concatenación es binaria exacta.
 * Implementación ÚNICA compartida por el firmante DSSE y el firmante MPC
 * (interoperabilidad real: ambos producen el mismo pre-auth encoding).
 *
 * Zero dependencias.
 */

function pae(payloadType, payloadBytes) {
  if (typeof payloadType !== 'string' || payloadType.length === 0) {
    throw new Error('pae requiere payloadType no vacío.');
  }
  const type = Buffer.from(payloadType, 'utf8');
  const body = Buffer.isBuffer(payloadBytes)
    ? payloadBytes
    : Buffer.from(payloadBytes === undefined || payloadBytes === null ? '' : payloadBytes);
  return Buffer.concat([
    Buffer.from(`DSSEv1 ${type.length} `, 'utf8'),
    type,
    Buffer.from(` ${body.length} `, 'utf8'),
    body
  ]);
}

module.exports = { pae };
