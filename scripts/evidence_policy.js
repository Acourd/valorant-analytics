#!/usr/bin/env node
'use strict';

/**
 * evidence_policy.js - Política de evidencia COMPARTIDA por el motor, el CLI y
 * el prompt standalone (Gem / Custom GPT).
 *
 * Determina, de forma pura y determinista, QUÉ secciones de salida permite la
 * evidencia disponible y qué datos faltan. Evita forzar fugas, causas tácticas
 * o rutinas biomecánicas cuando no existe base para sostenerlas.
 *
 * Niveles:
 *   - insufficient: sin métricas agregadas → solo nivel de evidencia,
 *     observaciones, límites y datos faltantes.
 *   - aggregate   : hay KD/ACS/HS/FK-FD pero NO evidencia por ronda → radar
 *     agregado y señal MMR (hipótesis). PROHIBIDO: fugas de ronda, causas
 *     tácticas, rutina y matriz 1v1.
 *   - complete    : hay evidencia por ronda → habilita fugas (0 a 3, cada una
 *     citando evidencia); matriz 1v1 solo si hay datos de duelos; rutina solo
 *     si hay evidencia mecánica (zonas de daño / telemetría de arma).
 */

const BASE_SECTIONS = ['evidence_level', 'observations', 'limits', 'missing'];
const AGGREGATE_SECTIONS = ['aggregate_radar', 'mmr_signal'];
const ROUND_SECTIONS = ['round_leaks'];
const DUEL_SECTIONS = ['duel_matrix'];
const MECHANICAL_SECTIONS = ['weapon_telemetry', 'aim_routine'];

function isNonEmptyArray(v) {
  return Array.isArray(v) && v.length > 0;
}

function classifyEvidence(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const observed = (src.observed && typeof src.observed === 'object') ? src.observed : {};
  const has = k => observed[k] !== undefined && observed[k] !== null && observed[k] !== '';
  const hasAggregate = ['kd', 'acs', 'hs', 'fk', 'fd'].some(has);
  const hasRounds = isNonEmptyArray(src.rounds);
  const hasDuels = isNonEmptyArray(src.duels);
  const hasWeapon = Boolean(src.weaponZones || src.weapon || src.damageZones);

  let level = 'insufficient';
  if (hasRounds) level = 'complete';
  else if (hasAggregate) level = 'aggregate';

  const allowedSections = BASE_SECTIONS.slice();
  if (level === 'aggregate' || level === 'complete') allowedSections.push(...AGGREGATE_SECTIONS);
  if (level === 'complete') {
    allowedSections.push(...ROUND_SECTIONS);
    if (hasDuels) allowedSections.push(...DUEL_SECTIONS);
    if (hasWeapon) allowedSections.push(...MECHANICAL_SECTIONS);
  }

  const allSections = [
    ...BASE_SECTIONS, ...AGGREGATE_SECTIONS, ...ROUND_SECTIONS,
    ...DUEL_SECTIONS, ...MECHANICAL_SECTIONS
  ];
  const forbiddenSections = allSections.filter(s => !allowedSections.includes(s));

  const missing = [];
  if (!hasAggregate) missing.push('metricas_agregadas (KD/ACS/HS)');
  if (!has('hs')) missing.push('hs');
  if (!has('fk') || !has('fd')) missing.push('first_kills/first_deaths');
  if (!hasRounds) missing.push('eventos_por_ronda');
  if (!hasDuels) missing.push('eventos_de_duelo');
  if (!hasWeapon) missing.push('zonas_de_dano/telemetria_de_arma');

  const maxLeaks = hasRounds ? Math.min(3, src.rounds.length) : 0;

  return {
    level,
    allowedSections,
    forbiddenSections,
    maxLeaks,
    missing,
    claimStatus: 'hipotesis_no_verificada',
    notes: 'Secciones permitidas por la evidencia disponible; el resto debe omitirse o declararse como dato faltante. Ninguna inferencia táctica sin evidencia citada.'
  };
}

module.exports = {
  classifyEvidence,
  BASE_SECTIONS,
  AGGREGATE_SECTIONS,
  ROUND_SECTIONS,
  DUEL_SECTIONS,
  MECHANICAL_SECTIONS
};
