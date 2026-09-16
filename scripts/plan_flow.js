#!/usr/bin/env node
'use strict';

/**
 * plan_flow.js — Ciclo local de planes: crear → registrar intento → comparar.
 *
 * Honestidad del seguimiento:
 *   - Solo se comparan métricas realmente OBSERVADAS y con procedencia
 *     COMPATIBLE (normalized↔normalized, verified↔verified).
 *   - Estados: MEDICION_COMPARABLE · DATOS_INSUFICIENTES · NO_COMPARABLE ·
 *     SIMULACION_DEMO.
 *   - La salida es un DELTA descriptivo con limitación explícita; nunca
 *     "mejoraste", MMR, talento, rango merecido ni causalidad.
 *   - Los datos sintéticos no se persisten ni se comparan.
 *
 * Cero dependencias.
 */

const { buildPlan } = require('./plan');
const store = require('./plan_store');
const { stableRef } = require('./evidence_policy');

const COMPARISON_LIMITATION = 'Diferencia descriptiva entre dos registros locales: NO demuestra efecto de la rutina, mejora, MMR, rango, talento ni causalidad. Una variación en una partida puede ser ruido.';

const COMPARABLE_METRICS = [
  { label: 'HS%', key: 'hsPct' },
  { label: 'KAST%', key: 'kast' },
  { label: 'ADR', key: 'adr' },
  { label: 'ACS', key: 'acs' },
  { label: 'Clutches', key: 'clutches' },
  { label: 'KD', key: 'kd' }
];

function pickComparableMetric(plan) {
  const comp = plan.comparables || {};
  for (const m of COMPARABLE_METRICS) {
    if (plan.observado.some(o => o.metrica === m.label) && comp[m.key] !== null && comp[m.key] !== undefined) {
      return { label: m.label, key: m.key, value: comp[m.key] };
    }
  }
  return null;
}

/**
 * Construye el plan y lo persiste (si procede). El fallo de persistencia NO
 * rompe el comportamiento actual de `plan`: se informa en `tracking`.
 */
function createPlanWithTracking(matchData, player, options = {}) {
  const plan = buildPlan(matchData, player);
  if (plan.provenance === 'synthetic_demo') {
    return { plan, tracking: { ok: false, code: 'PLAN_DEMO_NOT_TRACKABLE', message: 'Los datos sintéticos no habilitan seguimiento: no se persiste.' } };
  }
  const metric = pickComparableMetric(plan);
  try {
    const record = store.savePlan({
      player: plan.player,
      sourceRef: stableRef(matchData, options.originPath),
      provenance: plan.provenance,
      metric: metric ? metric.key : null,
      value: metric ? metric.value : null,
      threshold: plan.accion && metric && plan.accion.metrica === metric.key ? plan.accion.umbral : null,
      limitation: plan.accion ? plan.accion.limitacion : (plan.no_se_puede_saber.limites[0] || null),
      action: plan.accion ? { area: plan.accion.area, que: plan.accion.que, metrica: plan.accion.metrica, umbral: plan.accion.umbral, limitacion: plan.accion.limitacion } : null,
      routine: plan.rutina ? { escenario: plan.rutina.escenario, duracion: plan.rutina.duracion } : null,
      nextData: plan.siguiente_dato ? plan.siguiente_dato.dato : null
    });
    return { plan, tracking: { ok: true, planId: record.planId } };
  } catch (e) {
    return { plan, tracking: { ok: false, code: e.code || 'PLAN_STORE_ERROR', message: e.message } };
  }
}

const base = (estado, extra = {}) => Object.assign({
  command: 'plan-compare',
  estado,
  limitacion: COMPARISON_LIMITATION
}, extra);

/**
 * Compara un plan explícito con una entrada nueva. Nunca devuelve un resultado
 * positivo si falta compatibilidad; en ese caso explica el dato exacto.
 */
function comparePlanWithEntry(planRef, matchData, options = {}) {
  const record = store.readPlan(planRef, options); // PLAN_NOT_FOUND/AMBIGUOUS/CORRUPT => falla cerrado
  if (record.provenance === 'synthetic_demo') {
    return base('SIMULACION_DEMO', { planId: record.planId, player: record.player, metrica: record.metric, anterior: null, actual: null, delta: null, faltante: 'El plan registrado es sintético: no habilita comparación.' });
  }
  let plan;
  try {
    plan = buildPlan(matchData, record.player);
  } catch (e) {
    const codes = ['TARGET_NOT_FOUND', 'TARGET_REQUIRED', 'ROSTER_EMPTY'];
    if (codes.includes(e.code)) {
      return base('NO_COMPARABLE', { planId: record.planId, player: record.player, metrica: record.metric, anterior: record.value, actual: null, delta: null, faltante: `El jugador exacto "${record.player}" no está en la nueva entrada (${e.code}).` });
    }
    throw e;
  }
  if (plan.provenance === 'synthetic_demo') {
    return base('SIMULACION_DEMO', { planId: record.planId, player: record.player, metrica: record.metric, anterior: record.value, actual: null, delta: null, faltante: 'La nueva entrada es un demo sintético: no habilita comparación.' });
  }
  if (plan.provenance !== record.provenance) {
    return base('NO_COMPARABLE', { planId: record.planId, player: record.player, metrica: record.metric, anterior: record.value, actual: null, delta: null, faltante: `Procedencia incompatible: plan=${record.provenance} vs entrada=${plan.provenance}.` });
  }
  if (!record.metric) {
    return base('DATOS_INSUFICIENTES', { planId: record.planId, player: record.player, metrica: null, anterior: null, actual: null, delta: null, faltante: 'El plan no registró una métrica comparable (solo agregados no comparables). Aporta HS%/KAST%/ADR/ACS/Clutches observados.' });
  }
  const actual = (plan.comparables || {})[record.metric];
  if (actual === null || actual === undefined) {
    return base('DATOS_INSUFICIENTES', { planId: record.planId, player: record.player, metrica: record.metric, anterior: record.value, actual: null, delta: null, faltante: `La métrica "${record.metric}" no está observada en la nueva entrada.` });
  }
  const delta = Number((Number(actual) - Number(record.value)).toFixed(2));
  const comparison = base('MEDICION_COMPARABLE', { planId: record.planId, player: record.player, metrica: record.metric, anterior: record.value, actual, delta });
  try {
    store.recordComparison(record.planId, comparison, options);
    comparison.tracking = { ok: true, planId: record.planId };
  } catch (e) {
    comparison.tracking = { ok: false, code: e.code || 'PLAN_STORE_ERROR', message: e.message };
  }
  return comparison;
}

module.exports = {
  COMPARISON_LIMITATION,
  COMPARABLE_METRICS,
  pickComparableMetric,
  createPlanWithTracking,
  comparePlanWithEntry
};
