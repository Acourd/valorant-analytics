#!/usr/bin/env node
'use strict';

/**
 * plan.js — Flujo guiado para la siguiente partida.
 *
 * Un único camino comprensible: aportar datos → entender límites → UNA acción
 * priorizada (solo si una métrica observada cruza un umbral documentado) → UNA
 * rutina asociada → qué dato aportar después para mejorar el siguiente informe.
 *
 * Reglas duras:
 *   - Datos locales = normalized_input; jamás verified_source, causas ni fugas.
 *   - Sin métrica que cruce un umbral: NO hay acción remedial; se devuelve un
 *     plan de recolección con observaciones disponibles, límites y dato
 *     requerido (exit 2).
 *   - Sin eventos de ronda con timestamps/posición/trade: no se aconseja
 *     tradeo, timing ni posicionamiento.
 *   - Máximo 3 observaciones, una acción, una rutina. Cero puntajes decorativos.
 *
 * Zero external dependencies.
 */

const { resolveExactHandle, sourceProvenance, provenanceLabel, observedNumber } = require('./data_contract');
const { evaluateLearningProfile } = require('./learning_profile');
const { analyzeWeaponTelemetry } = require('./weapon_telemetry');
const { buildEvidence, canGenerateRoutine, KOVAAKS_SCENARIOS, THRESHOLDS } = require('./routine_contract');

const ACCIONES = Object.freeze({
  MICRO_ADJUSTMENT: {
    que: 'Trabajar la precisión del primer disparo con micro-correcciones cortas.',
    limitacion: 'La recomendación nace de HS% observado bajo umbral; sin timestamps no indica cuándo ocurre.'
  },
  CROSSHAIR_PLACEMENT: {
    que: 'Revisar la altura de mira para reducir impactos en pierna.',
    limitacion: 'Solo se apoya en la distribución head/body/leg observada; no mide posición ni ángulos.'
  },
  ANGLE_ISOLATION: {
    que: 'Aislar aperturas para no entrar solo a los duelos.',
    limitacion: 'Sin eventos de trade ni timestamps, no se afirma cuándo ni con quién se debía entrar.'
  },
  PISTOL_PRECISION: {
    que: 'Forzar ráfagas cortas y disciplina de gatillo.',
    limitacion: 'El ratio spray/tap observado no distingue distancia ni tipo de arma.'
  }
});

function firstRoutine(area) {
  const list = KOVAAKS_SCENARIOS[area] || [];
  if (list.length === 0) return null;
  const r = list[0];
  return {
    escenario: r.scenario,
    duracion: r.duration,
    categoria: r.category,
    instruccion: r.instruction
  };
}

function buildObservations(profile) {
  const m = profile.mechanical || {};
  const obs = [];
  if (m.hsPct !== null && m.hsPct !== undefined) obs.push({ metrica: 'HS%', valor: `${Number(m.hsPct.toFixed(1))}%`, fuente: 'marcador (normalized_input)' });
  if (m.kast !== null && m.kast !== undefined) obs.push({ metrica: 'KAST%', valor: `${m.kast}%`, fuente: 'marcador (normalized_input)' });
  if (m.fk !== null && m.fd !== null && m.fk !== undefined && m.fd !== undefined) obs.push({ metrica: 'FK/FD', valor: `${m.fk}/${m.fd}`, fuente: 'marcador (normalized_input)' });
  if (m.adr !== null && m.adr !== undefined) obs.push({ metrica: 'ADR', valor: String(m.adr), fuente: 'marcador (normalized_input)' });
  if (m.acs !== null && m.acs !== undefined) obs.push({ metrica: 'ACS', valor: String(m.acs), fuente: 'marcador (normalized_input)' });
  if (m.clutches !== null && m.clutches !== undefined) obs.push({ metrica: 'Clutches', valor: String(m.clutches), fuente: 'marcador (normalized_input)' });
  return obs.slice(0, 3);
}

function detectTemporalContext(matchData) {
  const segments = (matchData && matchData.data && matchData.data.segments) || [];
  let timing = false;
  let position = false;
  let trade = false;
  for (const s of segments) {
    const a = s.attributes || {};
    const m = s.metadata || {};
    if (Number.isFinite(Number(a.roundTime)) || Number.isFinite(Number(m.roundTimeMs)) || /T\d{2}:\d{2}/.test(String(m.timestamp || ''))) timing = true;
    if (m.position || a.position || (Number.isFinite(Number(m.x)) && Number.isFinite(Number(m.y)))) position = true;
    if (m.traded === true || a.traded === true || Number.isFinite(Number(m.tradeTimeMs))) trade = true;
  }
  return { timing, position, trade, sufficient: timing || position || trade };
}

function nextDataFor(profile, gate, hasRoundEvents, temporal) {
  const m = profile.mechanical || {};
  const como = 'node cli.js plan <archivo.json o export> "Nombre#TAG"';
  if (m.hsPct === null && gate.weaknesses.length === 0 && gate.missingMetrics.includes('hsPct')) {
    return { dato: 'HS% del marcador', porQue: 'habilita la acción de precisión y su umbral documentado (25%).', como };
  }
  if (gate.missingMetrics.includes('legPct')) {
    return { dato: 'eventos de daño por ronda (head/body/leg)', porQue: 'permite leer altura de mira con datos observados.', como };
  }
  if (gate.missingMetrics.includes('fk/fd')) {
    return { dato: 'first kills / first deaths del marcador', porQue: 'habilita la lectura de aperturas.', como };
  }
  if (gate.missingMetrics.includes('sprayTapRatio')) {
    return { dato: 'eventos de daño por ronda', porQue: 'permite calcular el ratio spray/tap.', como };
  }
  if (!hasRoundEvents) {
    return { dato: 'eventos por ronda (player-round / player-round-damage)', porQue: 'habilita observaciones por ronda sin inventar causas.', como };
  }
  if (!temporal.sufficient) {
    return { dato: 'eventos con timestamp, posición o marca de trade', porQue: 'son el requisito para cualquier lectura de timing o tradeo.', como };
  }
  return { dato: 'una segunda partida con el mismo formato', porQue: 'permite comparar tendencia sin validación externa.', como };
}

/**
 * Construye el plan guiado. Devuelve un objeto determinista; el CLI decide el
 * código de salida: 0 si hay acción habilitada, 2 si toca recolectar.
 */
function buildPlan(matchData, targetHandle) {
  if (!matchData || typeof matchData !== 'object') {
    throw new Error('buildPlan requiere un objeto de telemetría válido.');
  }
  const segments = (matchData.data && matchData.data.segments) || [];
  const handles = segments
    .filter(s => s.type === 'player-summary')
    .map(s => s.metadata?.platformUserHandle || s.attributes?.platformUserIdentifier)
    .filter(Boolean);
  if (handles.length === 0) {
    const err = new Error('Telemetría sin jugadores válidos: no hay plan que construir.');
    err.code = 'ROSTER_EMPTY';
    throw err;
  }
  const handle = resolveExactHandle(handles, targetHandle);
  const profile = evaluateLearningProfile(matchData, handle);

  let weapon = null;
  try { weapon = analyzeWeaponTelemetry(matchData, handle); } catch (e) { weapon = null; }

  const evidence = buildEvidence({
    profile: { player: handle, provenance: profile.provenance, mechanical: profile.mechanical },
    weapon,
    matchProvenance: profile.provenance,
    player: handle
  });
  const gate = canGenerateRoutine(evidence);
  const temporal = detectTemporalContext(matchData);
  const hasRoundEvents = segments.some(s => s.type === 'player-round' || s.type === 'player-round-damage' || s.type === 'player-round-kills');

  const observado = buildObservations(profile);
  const limites = [
    `Procedencia: ${provenanceLabel(profile.provenance)}. No habilita causas ni fugas atribuibles.`,
    'Sin validación con jugadores ni telemetría Riot real: el plan es descriptivo, no una promesa de mejora.'
  ];
  if (!temporal.sufficient) {
    limites.push('Sin timestamps, posición ni marcas de trade observadas: no se emiten reglas de timing, tradeo o posicionamiento.');
  }
  const faltantes = [...new Set([...(gate.missingMetrics || []), ...(gate.requiredData || [])])];

  const weakness = gate.weaknesses[0] || null;
  const accion = weakness ? {
    orden: 1,
    area: weakness.area,
    que: ACCIONES[weakness.area] ? ACCIONES[weakness.area].que : 'Trabajar el área con debilidad observada.',
    metrica: weakness.enablingMetric,
    umbral: weakness.threshold,
    motivo: weakness.reason,
    procedencia: profile.provenance,
    limitacion: ACCIONES[weakness.area] ? ACCIONES[weakness.area].limitacion : 'Sin contexto temporal no se afirma cuándo ocurre.'
  } : null;

  const routine = weakness ? firstRoutine(weakness.area) : null;
  const siguienteDato = accion
    ? { dato: `nueva medición de ${accion.metrica} en otra partida`, porQue: 'permite comprobar si el plan movió la métrica observada.', como: 'node cli.js plan <archivo.json> "Nombre#TAG"' }
    : nextDataFor(profile, gate, hasRoundEvents, temporal);

  return {
    command: 'plan',
    player: handle,
    provenance: profile.provenance,
    provenanceLabel: provenanceLabel(profile.provenance),
    estado: accion ? 'ACCION_DISPONIBLE' : 'RECOLECCION_REQUERIDA',
    observado,
    no_se_puede_saber: { limites, faltantes },
    accion,
    rutina: routine ? Object.assign({}, routine, {
      metrica: accion.metrica,
      umbral: accion.umbral,
      procedencia: profile.provenance,
      limitacion: 'Ejercicio asociado a la debilidad observada; no garantiza mejora.'
    }) : null,
    siguiente_dato: siguienteDato
  };
}

module.exports = { buildPlan, THRESHOLDS };
