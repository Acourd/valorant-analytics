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
 *   - POLÍTICA DE DEMO: en `synthetic_demo` el plan es una SIMULACIÓN explícita;
 *     NO habilita acción, rutina ni medición, y ninguna etiqueta puede decir
 *     "observado"/"normalized_input". Sus métricas son inventadas por el demo.
 *   - Máximo 3 observaciones, una acción, una rutina. Cero puntajes decorativos.
 *
 * Zero external dependencies.
 */

const { resolveExactHandle, sourceProvenance, provenanceLabel, observedNumber, detectTemporalContext } = require('./data_contract');
const { evaluateLearningProfile } = require('./learning_profile');
const { analyzeWeaponTelemetry } = require('./weapon_telemetry');
const { buildEvidence, canGenerateRoutine, KOVAAKS_SCENARIOS, THRESHOLDS } = require('./routine_contract');
const budgets = require('./resource_budget');
const schemaContract = require('./schema_contract');

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

function observationSource(provenance) {
  if (provenance === 'synthetic_demo') return 'SINTÉTICA --demo (NO observada)';
  if (provenance === 'verified_source') return 'fuente verificada (origen autenticado)';
  return 'marcador (normalized_input)';
}

function buildObservations(profile) {
  const m = profile.mechanical || {};
  const fuente = observationSource(profile.provenance);
  const esSintetica = profile.provenance === 'synthetic_demo';
  const obs = [];
  const push = (metrica, valor) => obs.push({ metrica, valor, fuente, tipo: esSintetica ? 'sintetica' : 'observada' });
  if (m.hsPct !== null && m.hsPct !== undefined) push('HS%', `${Number(m.hsPct.toFixed(1))}%`);
  if (m.kast !== null && m.kast !== undefined) push('KAST%', `${m.kast}%`);
  if (m.fk !== null && m.fd !== null && m.fk !== undefined && m.fd !== undefined) push('FK/FD', `${m.fk}/${m.fd}`);
  if (m.adr !== null && m.adr !== undefined) push('ADR', String(m.adr));
  if (m.acs !== null && m.acs !== undefined) push('ACS', String(m.acs));
  if (m.clutches !== null && m.clutches !== undefined) push('Clutches', String(m.clutches));
  return obs.slice(0, 4);
}

/**
 * ¿Hay métricas suficientes para EVALUAR las reglas documentadas? Si no hay
 * ninguna de las que alimentan reglas correctivas (HS%, KAST% o FK/FD), el
 * resultado honesto es DATOS_INSUFICIENTES, no "recolección" genérica.
 */
function hasEvaluableMetrics(profile) {
  const m = profile.mechanical || {};
  const fkfd = m.fk !== null && m.fk !== undefined && m.fd !== null && m.fd !== undefined;
  return m.hsPct !== null && m.hsPct !== undefined
    ? true
    : (m.kast !== null && m.kast !== undefined) || fkfd;
}

/** Una sola recomendación práctica para el jugador (sin jerga ni IDs). */
function playerNextStep(plan, meta, temporal, suficiente) {
  if (plan.esSimulacion) {
    return 'Prueba con una partida real (JSON/export o texto de marcador): el demo no habilita acción, rutina ni seguimiento.';
  }
  if (meta.sourceFormat === 'tracker_text_export') {
    return 'Este archivo es el texto de una página de Tracker y no contiene eventos por ronda (ni posiciones, trades o timestamps), así que no se puede leer más de él. Alternativas realistas: analizar 3–5 partidas del mismo tipo para observar consistencia, o aportar un export con eventos por ronda si algún día dispones de él.';
  }
  if (plan.accion) {
    return `Aplica la acción en tu próxima partida y vuelve a medir ${plan.accion.metrica} con otra entrada (el seguimiento es local y descriptivo).`;
  }
  if (suficiente) {
    return 'Repite el análisis con 3–5 partidas del mismo tipo para observar consistencia: una sola partida no demuestra nada.';
  }
  return `Para evaluar las reglas documentadas falta una métrica base (HS%, KAST% o FK/FD). Aporta una entrada que la incluya.`;
}

function nextDataFor(profile, gate, hasRoundEvents, temporal) {
  const m = profile.mechanical || {};
  const como = 'node cli.js plan <archivo.json o export> "Nombre#TAG"';
  // Prioridad: si la única lectura bloqueada es la de aperturas/tradeo, el dato
  // que habilita el siguiente informe son eventos con contexto observado.
  if (gate.areasBlockedByTemporal && gate.areasBlockedByTemporal.length > 0) {
    return { dato: 'eventos de ronda con marcas de trade, posición o timestamp', porQue: 'es el requisito para leer aperturas/tradeo con evidencia observada.', como };
  }
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
  // Presupuestos/contrato de esquema: fail-closed antes de cualquier análisis.
  budgets.checkJsonDepth(matchData);
  const timeBudget = new budgets.TimeBudget();
  const schemaValidation = schemaContract.validateNormalizedMatch(matchData);
  budgets.checkEvents(segments.length);
  const handles = [];
  for (let i = 0; i < segments.length; i++) {
    timeBudget.sample(i + 1, 'mapeo de segmentos del plan');
    const s = segments[i];
    if (s && s.type === 'player-summary') {
      const h = s.metadata?.platformUserHandle || s.attributes?.platformUserIdentifier;
      if (h) handles.push(h);
    }
  }
  budgets.checkPlayers(handles.length);
  if (!handles.length) {
    const err = new Error('Telemetría sin jugadores válidos: no hay plan que construir.');
    err.code = 'ROSTER_EMPTY';
    throw err;
  }
  if (Number.isFinite(matchData.data.metadata && matchData.data.metadata.rounds)) {
    budgets.checkRounds(matchData.data.metadata.rounds);
  }
  const handle = resolveExactHandle(handles, targetHandle);
  const profile = evaluateLearningProfile(matchData, handle);

  const temporal = detectTemporalContext(matchData);
  let weapon = null;
  try { weapon = analyzeWeaponTelemetry(matchData, handle); } catch (e) { weapon = null; }

  const evidence = buildEvidence({
    profile: { player: handle, provenance: profile.provenance, mechanical: profile.mechanical },
    weapon,
    matchProvenance: profile.provenance,
    player: handle,
    temporalContext: temporal
  });
  const gate = canGenerateRoutine(evidence);
  const hasRoundEvents = segments.some(s => s.type === 'player-round' || s.type === 'player-round-damage' || s.type === 'player-round-kills');
  const esSimulacion = profile.provenance === 'synthetic_demo';

  const observado = buildObservations(profile);
  const limites = [
    `Procedencia: ${provenanceLabel(profile.provenance)}. No habilita causas ni fugas atribuibles.`,
    'Sin validación con jugadores ni telemetría Riot real: el plan es descriptivo, no una promesa de mejora.'
  ];
  if (esSimulacion) {
    limites.push('Modo demo: las métricas son inventadas por el generador sintético; no son observaciones ni permiten recomendaciones.');
  }
  if (!temporal.sufficient) {
    limites.push('Sin timestamps, posición ni marcas de trade observadas: no se emiten reglas de timing, tradeo o posicionamiento.');
  }
  const faltantes = [...new Set([...(gate.missingMetrics || []), ...(gate.requiredData || [])])];

  // Política de demo: sin recomendaciones. Solo datos reales habilitan acción.
  const weakness = esSimulacion ? null : (gate.weaknesses[0] || null);
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
  const suficiente = hasEvaluableMetrics(profile);
  const estado = esSimulacion
    ? 'SIMULACION_DEMO'
    : (accion ? 'ACCION_DISPONIBLE' : (suficiente ? 'SIN_ACCION_CORRECTIVA' : 'DATOS_INSUFICIENTES'));
  const titular = {
    ACCION_DISPONIBLE: 'ACCIÓN DISPONIBLE',
    SIN_ACCION_CORRECTIVA: 'SIN ACCIÓN CORRECTIVA',
    DATOS_INSUFICIENTES: 'DATOS INSUFICIENTES PARA UNA ACCIÓN',
    SIMULACION_DEMO: 'SIMULACIÓN DEMO'
  }[estado];
  const siguienteDato = esSimulacion
    ? {
      dato: 'datos reales (JSON/export, texto del marcador o captura con confirmación)',
      porQue: 'el modo demo es ilustrativo: no habilita recomendaciones ni mediciones; aporta una partida real para un plan accionable.',
      como: 'node cli.js plan <archivo.json o export> "Nombre#TAG"'
    }
    : (accion
      ? { dato: `nueva medición de ${accion.metrica} en otra partida`, porQue: 'permite comprobar si el plan movió la métrica observada.', como: 'node cli.js plan <archivo.json> "Nombre#TAG"' }
      : nextDataFor(profile, gate, hasRoundEvents, temporal));

  const presentation = {
    titular,
    resumen: {
      resultado: profile.result && profile.result !== 'Finished' ? profile.result : null,
      mapa: profile.map && profile.map !== 'Unknown' ? profile.map : null,
      modo: (matchData.data && matchData.data.metadata && matchData.data.metadata.modeName) || null,
      agente: profile.agent || null,
      metricas: observado.map(o => `${o.metrica} ${o.valor}`)
    },
    siguiente: playerNextStep({ esSimulacion, accion, observado }, { sourceFormat: (matchData.data && matchData.data.metadata && matchData.data.metadata.sourceFormat) || null }, temporal, suficiente),
    alcance: 'Datos locales no verificados; describe esta partida, no demuestra mejora.'
  };

  timeBudget.checkpoint('construcción de plan');
  return {
    command: 'plan',
    player: handle,
    agent: profile.agent || null,
    map: profile.map || null,
    result: profile.result || null,
    provenance: profile.provenance,
    provenanceLabel: provenanceLabel(profile.provenance),
    schema: schemaValidation.diagnostics,
    es_simulacion: esSimulacion,
    advertencia: esSimulacion
      ? 'SINTÉTICA --demo: métricas inventadas por el demo; no son observaciones reales ni habilitan recomendaciones.'
      : null,
    estado,
    presentation,
    observado,
    // Métricas comparables entre partidas (solo las realmente observadas).
    comparables: {
      hsPct: profile.mechanical.hsPct,
      kast: profile.mechanical.kast,
      adr: profile.mechanical.adr,
      acs: profile.mechanical.acs,
      clutches: profile.mechanical.clutches,
      kd: profile.mechanical.kd
    },
    // Guía estable de entrada mínima: qué se obtiene con cada nivel de datos.
    entrada_minima: {
      texto_marcador: 'Funciones y K/D/A, ACS, ADR y HS% si tu marcador los muestra (habilita observación y, con umbral, una acción mecánica).',
      eventos_por_ronda: 'Segmentos player-round / player-round-damage (habilita zonas head/body/leg y ratio spray/tap); el tradeo exige además marcas de trade, posición o timestamp.',
      fuente_verificada: 'Riot RSO con atestación (pendiente de credenciales): única vía que podría habilitar causas/fugas atribuibles.'
    },
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
