#!/usr/bin/env node
/**
 * learning_profile.js - 360° Autodiagnosis & Pedagogical Skill Profiler
 * Compiles a holistic 5-pillar skill radar, identifies the 3 biggest ELO leaks,
 * and prescribes an immediate actionable routine for player self-improvement.
 * 
 * Usage: node learning_profile.js <match_id_or_json_file> [target_player_handle]
 */

const fs = require('fs');
const { extractMatchId, fetchMatch } = require('./fetch_match');
const { parseDuels } = require('./duel_matrix');
const { analyzeEconomy } = require('./economy_analyzer');
const { resolveExactHandle, sourceProvenance, provenanceLabel, mayAssertCauses, observedNumber, detectTemporalContext } = require('./data_contract');
const { THRESHOLDS } = require('./routine_contract');

function evaluateLearningProfile(matchData, targetHandle) {
  if (!matchData || typeof matchData !== 'object') {
    throw new Error('evaluateLearningProfile requiere un objeto de telemetría válido.');
  }
  const meta = matchData.data?.metadata || {};
  const segments = matchData.data?.segments || [];
  const playerSummaries = segments.filter(s => s.type === 'player-summary');
  
  const playerMap = {};
  playerSummaries.forEach(p => {
    const handle = p.metadata?.platformUserHandle || p.attributes?.platformUserIdentifier;
    playerMap[handle] = {
      handle,
      team: p.metadata?.teamId,
      agent: p.metadata?.agentName,
      rank: p.stats?.rank?.displayValue || p.metadata?.tierName || 'Unranked',
      stats: p.stats || {}
    };
  });

  if (Object.keys(playerMap).length === 0) {
    throw new Error('No se encontraron jugadores válidos en la telemetría de la partida.');
  }
  const target = resolveExactHandle(Object.keys(playerMap), targetHandle);
  const p = playerMap[target];
  if (!p) {
    throw new Error(`Jugador "${targetHandle}" no encontrado en la partida. Sin telemetría del objetivo no se emite diagnóstico.`);
  }
  const st = p.stats;

  // Métricas OBSERVADAS (null cuando no existen; jamás defaults plausibles).
  const mechanical = {
    hsPct: observedNumber(st, ['hsAccuracy', 'headshotsPercentage']),
    kd: observedNumber(st, ['kdRatio']) !== null
      ? observedNumber(st, ['kdRatio'])
      : ((observedNumber(st, ['kills']) !== null && observedNumber(st, ['deaths']) !== null)
        ? Number((observedNumber(st, ['kills']) / Math.max(1, observedNumber(st, ['deaths']))).toFixed(2))
        : null),
    fk: observedNumber(st, ['firstKills']),
    fd: observedNumber(st, ['firstDeaths']),
    acs: observedNumber(st, ['scorePerRound']),
    adr: observedNumber(st, ['damagePerRound']),
    kast: observedNumber(st, ['kast']),
    clutches: observedNumber(st, ['clutches']),
    multikills3k: observedNumber(st, ['kills3K'])
  };
  const unknownNames = { hsPct: 'headshot%', kd: 'kd', acs: 'acs', adr: 'adr', kast: 'kast', fk: 'firstKills', fd: 'firstDeaths', clutches: 'clutches' };
  const unknowns = Object.keys(unknownNames).filter(k => mechanical[k] === null).map(k => unknownNames[k]);

  // 1. Radar dimensional (0-100): cada pilar se calcula SOLO con componentes
  // OBSERVADOS (renormalizando el peso disponible); sin componentes => null.
  const weightedScore = parts => {
    const usable = parts.filter(x => x.score !== null);
    if (usable.length === 0) return null;
    const weight = usable.reduce((acc, x) => acc + x.weight, 0);
    const raw = usable.reduce((acc, x) => acc + x.score * x.weight, 0) / weight;
    return Math.min(100, Math.round(raw));
  };
  const mechanicalScore = weightedScore([
    { score: mechanical.hsPct === null ? null : (mechanical.hsPct / 45) * 100, weight: 60 },
    { score: mechanical.kd === null ? null : (mechanical.kd / 1.8) * 100, weight: 40 }
  ]);
  const macroScore = weightedScore([
    { score: mechanical.kast === null ? null : (mechanical.kast / 85) * 100, weight: 50 },
    { score: mechanical.adr === null ? null : (mechanical.adr / 180) * 100, weight: 50 }
  ]);
  const openingScore = (mechanical.fk === null || mechanical.fd === null)
    ? null
    : Math.min(100, Math.round(((mechanical.fk / Math.max(1, mechanical.fd)) / 2.0) * 70 + (mechanical.fk / 5) * 30));

  let economyScore = null;
  let economyObserved = false;
  try {
    const econ = analyzeEconomy(matchData, target);
    const fullTier = econ.tiers.find(t => t.tier?.toLowerCase().includes('full'));
    if (fullTier) {
      const fullWinPct = parseFloat(fullTier.winPct);
      if (Number.isFinite(fullWinPct)) {
        economyScore = Math.min(100, Math.round(fullWinPct * 0.8 + 20));
        economyObserved = true;
      }
    }
  } catch(e) {}

  let composureScore = null;
  if (mechanical.clutches !== null) {
    let base = 50 + mechanical.clutches * 25;
    if (mechanical.multikills3k !== null) base += mechanical.multikills3k * 10;
    composureScore = Math.min(100, Math.round(base));
  }

  // 2. Leaks SOLO sobre métricas observadas (sin causas por defecto).
  const eloLeaks = [];
  if (mechanical.fd !== null && mechanical.fk !== null && mechanical.fd >= 3 && mechanical.fd > mechanical.fk) {
    eloLeaks.push({
      issue: 'Fuga de Primera Sangre (First Death Deficit)',
      detail: `Moriste primero en ${mechanical.fd} rondas (${mechanical.fk}/${mechanical.fd} FK/FD), dejando a tu equipo en desventaja 4v5 constante.`,
      solution: 'Espera el contacto visual de la utilidad de tus iniciadores antes de cruzar la línea de visión principal.'
    });
  }
  if (mechanical.hsPct !== null && mechanical.hsPct < 25) {
    eloLeaks.push({
      issue: 'Inconsistencia en Puntería de Primer Tiro',
      detail: `Tu tasa de headshot fue de ${mechanical.hsPct}%, forzando duelos por ráfagas al cuerpo que en rangos altos se castigan en <200ms.`,
      solution: 'Dedica 10 minutos a micro-flicks estáticos en Kovaaks (1w4ts / Pasu Small) antes de jugar.'
    });
  }
  if (mechanical.kast !== null && mechanical.kast < 68) {
    eloLeaks.push({
      issue: 'Baja Participación por Ronda (KAST < 68%)',
      detail: `En el ${Math.round(100 - mechanical.kast)}% de las rondas no conseguiste Kill, Asistencia, Supervivencia ni fuiste Tradeado.`,
      solution: 'Juega más cerca de un compañero de apoyo para garantizar que cuando mueras, ellos obtengan el re-frag inmediato.'
    });
  }

  const provenance = sourceProvenance(meta);
  const causesAllowed = mayAssertCauses(provenance);
  // Qué pilares tienen métrica OBSERVADA (consensus no usa los no observados).
  const pillarsObserved = {
    precision: mechanical.hsPct !== null || mechanical.kd !== null,
    macro: mechanical.kast !== null && mechanical.adr !== null,
    openings: mechanical.fk !== null && mechanical.fd !== null,
    economy: economyObserved,
    clutch: mechanical.clutches !== null
  };
  const dataQuality = unknowns.length === 0 ? 'completa' : (unknowns.length >= 5 ? 'insuficiente' : 'parcial');
  const finalLeaks = (causesAllowed && unknowns.length < 5) ? eloLeaks.slice(0, 3) : [];
  const dataWarning = unknowns.length >= 5
    ? 'ADVERTENCIA: telemetría del objetivo ausente. No se emiten fugas específicas: conecta datos reales de partida.'
    : (!causesAllowed
      ? `Procedencia: ${provenanceLabel(provenance)}. Se describen observaciones; NO se emiten causas/fugas (requieren fuente verificada).`
      : (unknowns.length > 0 ? `Métricas no disponibles y excluidas del diagnóstico: ${unknowns.join(', ')}.` : null));

  // 3. Prescripción mecánica CONDICIONADA por el umbral documentado, no solo
  // por la existencia de la métrica: correctiva si HS% < 25; con HS% ≥ 25 se
  // declara "sin debilidad mecánica cubierta por esta regla" y NO se recomienda
  // entrenamiento remedial. Las reglas de timing/tradeo siguen prohibidas sin
  // timestamps/posición/trade observados.
  const hsThreshold = THRESHOLDS.HS_LOW.value;
  const hsObserved = mechanical.hsPct !== null;
  const hsBelow = hsObserved && mechanical.hsPct < hsThreshold;
  const temporalContext = detectTemporalContext(matchData);
  const limitacion = temporalContext.sufficient
    ? `Contexto temporal parcial detectado (${Object.keys(temporalContext).filter(k => temporalContext[k]).join('/')}): este contrato todavía no deriva reglas de tradeo verificadas.`
    : 'Sin timestamps/posición/trade observados: se omite toda regla de timing/tradeo; solo rutina mecánica vinculada a HS% y su umbral.';
  const prescripcionInmediata = hsObserved ? {
    tipo: hsBelow ? 'correctiva' : 'sin_debilidad',
    estado: hsBelow ? 'debilidad_cubierta' : 'sin_debilidad',
    metrica: `HS% observado (${Number(mechanical.hsPct.toFixed(1))}%)`,
    umbral: `${hsThreshold}% (${THRESHOLDS.HS_LOW.description})`,
    reglaEvaluada: `HS% < ${hsThreshold}`,
    sesionKovaaks: hsBelow ? '5 min de Pasu Small Reload + 5 min de 1wall6targets extra small' : null,
    reglaMental: null,
    motivo: hsBelow
      ? `HS% ${Number(mechanical.hsPct.toFixed(1))} < umbral ${hsThreshold}%: debilidad mecánica cubierta por la regla.`
      : `HS% ${Number(mechanical.hsPct.toFixed(1))} ≥ umbral ${hsThreshold}%: sin debilidad mecánica cubierta por esta regla; no se recomienda entrenamiento remedial.`,
    limitacion
  } : null;

  return {
    player: target,
    agent: p.agent,
    rank: p.rank,
    map: meta.mapName || 'Unknown',
    result: meta.result || 'Finished',
    dataQuality,
    provenance,
    mechanical,
    pillarsObserved,
    unknowns,
    warning: dataWarning,
    radar: {
      precisionMecanica: mechanicalScore,
      macrogamePosicionamiento: macroScore,
      duelosDeApertura: openingScore,
      disciplinaEconomica: economyScore,
      composturaClutch: composureScore
    },
    eloLeaks: finalLeaks,
    prescripcionInmediata
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args[0]) {
    console.error('Usage: node learning_profile.js <match_id_or_json_file> [target_player_handle]');
    process.exit(1);
  }

  let matchData;
  if (fs.existsSync(args[0])) {
    matchData = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  } else {
    const matchId = extractMatchId(args[0]);
    matchData = fetchMatch(matchId);
  }

  const handle = args[1];
  const res = evaluateLearningProfile(matchData, handle);

  console.log(`\n========================================================================`);
  console.log(`🎯 PERFIL AUTODIAGNÓSTICO 360°: ${res.player} (${res.agent} - ${res.rank})`);
  console.log(`Mapa: ${res.map} | Resultado: ${res.result}`);
  console.log(`========================================================================`);
  
  const fmt = v => (v === null ? 'n/d (sin métrica observada)' : `${v} / 100`);
  console.log(`\n📊 RADAR DE DOMINIO COMPETITIVO (5 PILARES):`);
  console.log(`  • Precisión Mecánica (First-Bullet):       ${fmt(res.radar.precisionMecanica)}`);
  console.log(`  • Macrogame, Espacio y Posicionamiento:   ${fmt(res.radar.macrogamePosicionamiento)}`);
  console.log(`  • Duelos de Apertura e Impacto (FK):       ${fmt(res.radar.duelosDeApertura)}`);
  console.log(`  • Disciplina Económica y Conversión:       ${fmt(res.radar.disciplinaEconomica)}`);
  console.log(`  • Compostura en Clutch y Late-Round:       ${fmt(res.radar.composturaClutch)}`);

  if (res.eloLeaks.length === 0) {
    console.log(`\n🚨 FUGAS DE ELO: ninguna atribuible (se requieren métricas observadas + fuente verificada).`);
  } else {
    console.log(`\n🚨 FUGAS DE ELO IDENTIFICADAS (${res.eloLeaks.length}):`);
    res.eloLeaks.forEach((leak, idx) => {
      console.log(`\n  [Fuga ${idx + 1}] ⚠️ ${leak.issue}`);
      console.log(`    Detalle:   ${leak.detail}`);
      console.log(`    Solución:  ${leak.solution}`);
    });
  }

  if (res.prescripcionInmediata && res.prescripcionInmediata.sesionKovaaks) {
    console.log(`\n💡 PRESCRIPCIÓN CORRECTIVA (${res.prescripcionInmediata.metrica}; umbral ${res.prescripcionInmediata.umbral}):`);
    console.log(`  • Práctica Kovaaks: ${res.prescripcionInmediata.sesionKovaaks}`);
    console.log(`  • Regla de timing/tradeo: OMITIDA — ${res.prescripcionInmediata.limitacion}`);
  } else if (res.prescripcionInmediata) {
    console.log(`\n✓ Sin debilidad mecánica cubierta por esta regla — ${res.prescripcionInmediata.motivo}`);
    console.log(`  • Regla de timing/tradeo: OMITIDA — ${res.prescripcionInmediata.limitacion}`);
  } else {
    console.log(`\n💡 Prescripción omitida: sin HS% observado no se emite rutina.`);
  }
  console.log(`========================================================================\n`);
}

module.exports = { evaluateLearningProfile };
