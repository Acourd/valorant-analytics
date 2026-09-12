#!/usr/bin/env node
'use strict';

/**
 * autodiagnostic_engine.js - Señales heurísticas de rendimiento y patrón de MMR
 *
 * IMPORTANTE (HONESTIDAD DE DATOS):
 * Este motor NO mide el MMR interno de Riot, ni el talento real, ni el rango
 * merecido. Trabaja únicamente sobre agregados que el usuario aporta (partidas,
 * KD, ACS, DDΔ, HS y horas). Por tanto sus salidas son HIPÓTESIS HEURÍSTICAS
 * NO VERIFICADAS, marcadas como tales (`claimStatus`), y jamás deben
 * presentarse como veredictos. Confirmar cualquier hipótesis de anclaje o de
 * rango exigiría datos de RR por partida y validación empírica con telemetría
 * real (pendiente).
 *
 * 1. Patrón compatible con brecha entre rango visual y rendimiento observado.
 * 2. Señal compatible con posible "MMR Drag" (anclaje de certeza), no probada.
 * 3. Descripción (no veredicto) de patrones de impacto vs volumen de juego.
 * 4. Cero dependencias externas (Node.js core).
 */

function toFiniteNumber(v) {
  const n = typeof v === 'string' ? parseFloat(v) : (typeof v === 'number' ? v : NaN);
  return Number.isFinite(n) ? n : null;
}

function parseStrictNumber(v, allowPercent) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (allowPercent && s.endsWith('%')) s = s.slice(0, -1).trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const KNOWN_TIERS = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'ascendant', 'immortal', 'radiant', 'unranked'];
const RANK_GRAMMAR = /^(iron|bronze|silver|gold|platinum|diamond|ascendant|immortal)\s+([1-3])$|^radiant$|^unranked$/i;

function canonicalRank(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  const m = s.match(RANK_GRAMMAR);
  if (!m) return null;
  if (/^radiant$/i.test(s)) return 'Radiant';
  if (/^unranked$/i.test(s)) return 'Unranked';
  const tier = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  return `${tier} ${m[2]}`;
}

function rankTier(label) {
  if (typeof label !== 'string') return null;
  const m = label.trim().match(RANK_GRAMMAR);
  if (!m) return null;
  if (/^radiant$/i.test(label.trim())) return 'radiant';
  if (/^unranked$/i.test(label.trim())) return 'unranked';
  return m[1].toLowerCase();
}

function inDomain(v, min, max) {
  return v !== null && v >= min && v <= max ? v : null;
}

function stableEncode(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableEncode).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableEncode(value[k])}`).join(',')}}`;
}

// Sello de honestidad presente en TODA salida con carga interpretativa. La
// ausencia de estos campos en una respuesta debe considerarse un defecto.
const CLAIM_STATUS = 'hipotesis_no_verificada';
const EVIDENCE_DISCLAIMER = 'Hipótesis heurística basada en agregados (partidas, KD, ACS, DDΔ, HS y horas). NO mide el MMR interno de Riot, ni el talento real, ni el rango merecido; no está validada con telemetría real ni con datos de RR por partida.';
const LIMITATIONS = [
  'Sin datos de RR por partida ni evidencia del emparejamiento interno.',
  'Sin validación empírica con telemetría real ni con una muestra de jugadores.',
  'Los agregados pueden cambiar y no prueban causalidad.'
];

function evaluateMmrDrag(accountTelemetry) {
  if (!accountTelemetry || typeof accountTelemetry !== 'object') {
    throw new Error('evaluateMmrDrag requiere telemetría de cuenta (objeto con competitive/currentRank). Entrada recibida: ' + String(accountTelemetry));
  }
  const matchesRaw = accountTelemetry.competitive?.matches;
  const matches = (typeof matchesRaw === 'number' && Number.isInteger(matchesRaw) && matchesRaw >= 0) ? matchesRaw : 0;
  const kd = inDomain(parseStrictNumber(accountTelemetry.competitive?.kd), 0, 10);
  const acs = inDomain(parseStrictNumber(accountTelemetry.competitive?.acs), 0, 1000);
  const dd = inDomain(parseStrictNumber(accountTelemetry.competitive?.dd), -300, 300);
  const rank = canonicalRank(accountTelemetry.currentRank);
  const hasImpactMetrics = kd !== null && acs !== null && dd !== null;
  const strongSignals = [kd !== null && kd > 0.3, acs !== null && acs > 100, dd !== null && dd > -300].filter(Boolean).length;
  const hasMeaningfulImpact = strongSignals >= 2;
  if (matches === 0 || !hasImpactMetrics || rank === null || !hasMeaningfulImpact) {
    return {
      mmrDragDetected: false,
      severityScore: 0,
      matchesEvaluated: matches,
      sampleSize: matches,
      confidence: 'nula',
      claimStatus: CLAIM_STATUS,
      disclaimer: EVIDENCE_DISCLAIMER,
      limitations: LIMITATIONS,
      formula: 'MMR-drag requiere matches entero≥0, KD[0,10], ACS[0,1000], DD[-300,300] observados, rango canónico y ≥2 señales significativas (KD>0.3, ACS>100, DD>-300); detección con matches>=300 e impacto (KD≥1.15 o ACS≥230 o DD≥20) y rango contenido (Gold/Silver)',
      diagnosis: 'DATOS INSUFICIENTES: sin muestra válida (partidas, métricas de impacto y rango con dominio verificado) no se puede emitir ni siquiera una hipótesis de anclaje de MMR.'
    };
  }

  const isAgedAccount = matches >= 300;
  const hasHighCombatImpact = kd >= 1.15 || acs >= 230 || dd >= 20;
  const isRankConstrained = rankTier(rank) === 'gold' || rankTier(rank) === 'silver';

  const mmrDragDetected = isAgedAccount && hasHighCombatImpact && isRankConstrained;
  const severityScore = isAgedAccount ? Math.min(100, Math.round((matches / 600) * 80 + (dd !== null && dd > 25 ? 20 : 10))) : 20;
  // Señales decisivas CON MARGEN CONCLUYENTE (KD>0.75, ACS>250, DDΔ>15): un
  // epsilon sobre el umbral de validez no es evidencia conclusiva. Además,
  // una métrica en el extremo contrario de su dominio (DDΔ cerca del piso)
  // es evidencia contraria que impide confianza ALTA en "Varianza Normal".
  const decisiveSignals = [kd !== null && kd > 0.75, acs !== null && acs > 250, dd !== null && dd > 15].filter(Boolean).length;
  const hasContraryExtreme = dd !== null && dd <= -200;
  const calibratedConfidence = (matches >= 300 && decisiveSignals >= 2 && !hasContraryExtreme) ? 'alta' : ((matches >= 50 && decisiveSignals >= 1) ? 'media' : 'baja');
  if (decisiveSignals < 2) {
    return {
      mmrDragDetected: false,
      severityScore: 0,
      matchesEvaluated: matches,
      sampleSize: matches,
      confidence: 'baja',
      claimStatus: CLAIM_STATUS,
      disclaimer: EVIDENCE_DISCLAIMER,
      limitations: LIMITATIONS,
      formula: 'MMR-drag exige ≥2 señales decisivas CON MARGEN (KD>0.75, ACS>250, DDΔ>15); en frontera exacta, igual o apenas-sobre-umbral solo se describe lo observado',
      diagnosis: 'EVIDENCIA LÍMITE: métricas presentes pero sin fuerza decisiva; no se afirma ni descarta ninguna hipótesis de anclaje.'
    };
  }

  const mmrSignal = mmrDragDetected;
  const diagnosis = mmrDragDetected
    ? 'SEÑAL COMPATIBLE CON POSIBLE ANCLAJE DE MMR (hipótesis NO verificada): los indicadores individuales son fuertes para el rango observado. Esto NO demuestra que Riot aplique un anclaje; confirmarlo exigiría RR por partida y validación empírica.'
    : (hasContraryExtreme
      ? 'SIN CONCLUSIÓN (hipótesis NO verificada): las señales decisivas conviven con una métrica en el extremo contrario; no se afirma ni normalidad ni anclaje.'
      : 'SIN SEÑAL DE ANCLAJE (no concluyente): no se observa la combinación asociada al patrón, pero la ausencia de señal NO confirma que el sistema de emparejamiento funcione con normalidad.');

  return {
    mmrDragDetected: mmrSignal,
    severityScore,
    matchesEvaluated: matches,
    sampleSize: matches,
    confidence: calibratedConfidence,
    claimStatus: CLAIM_STATUS,
    disclaimer: EVIDENCE_DISCLAIMER,
    limitations: LIMITATIONS,
    formula: 'MMR-drag requiere matches>=300 con impacto (KD≥1.15 o ACS≥230 o DDΔ≥20) y rango contenido (Gold/Silver); salida heurística no verificada',
    diagnosis
  };
}

function evaluateTalentVsEffort(careerReport, options = {}) {
  if (!careerReport || !Array.isArray(careerReport.accounts)) {
    throw new Error('evaluateTalentVsEffort requiere careerReport con accounts[]. Entrada inválida recibida.');
  }
  if (!careerReport.summary || !careerReport.summary.totalGeneral) {
    throw new Error('evaluateTalentVsEffort requiere careerReport.summary.totalGeneral. Resumen ausente.');
  }
  // Atributo personal: solo si el usuario lo aporta explícitamente; sin él es
  // NO OBSERVADO (null), jamás un default de perfil.
  const zeroFpsBackground = typeof options.zeroFpsBackground === 'boolean' ? options.zeroFpsBackground : null;
  // Identidad estable por ID de cuenta (handle normalizado): trim + minúsculas
  // + NFC. Variantes Unicode canónicamente equivalentes son LA MISMA cuenta.
  // El primer snapshot de cada handle gana; los snapshots cambiantes jamás
  // inflan la muestra y los registros sin ID jamás participan en agregación
  // que soporte confianza.
  const seenHandles = new Map();
  let duplicatesSkipped = 0;
  let conflictingSnapshots = 0;
  let unidentifiedRecords = 0;
  let identityUncertain = false;
  const personal = careerReport.accounts.filter(a => {
    if (a.isExcluded) return false;
    const handleKey = String(a.handle || '').trim().toLowerCase().normalize('NFC');
    if (!handleKey) {
      // Sin ID de cuenta no hay identidad: excluido de toda agregación.
      identityUncertain = true;
      unidentifiedRecords++;
      return false;
    }
    const snapKey = `${stableEncode(a.competitive || null)}@${stableEncode(String(a.peakRank || ''))}`;
    const known = seenHandles.get(handleKey);
    if (known !== undefined) {
      if (known === snapKey) { duplicatesSkipped++; return false; }
      identityUncertain = true;
      conflictingSnapshots++;
      return false;
    }
    seenHandles.set(handleKey, snapKey);
    return true;
  });
  
  // Aggregate weighted stats
  let totalCompMatches = 0;
  let weightedKd = 0;
  let weightedAcs = 0;
  let weightedDd = 0;
  let weightedHs = 0;
  let kdMatches = 0;
  let acsMatches = 0;
  let ddMatches = 0;
  let hsMatches = 0;
  let jointMatches = 0;
  let jointKdSum = 0;
  let jointAcsSum = 0;
  let jointDdSum = 0;
  let jointHsSum = 0;

  personal.forEach(a => {
    const comp = a.competitive || {};
    const mRaw = comp.matches;
    const m = (typeof mRaw === 'number' && Number.isInteger(mRaw) && mRaw > 0) ? mRaw : 0;
    totalCompMatches += m;
    const kd = inDomain(parseStrictNumber(comp.kd), 0, 10);
    const acs = inDomain(parseStrictNumber(comp.acs), 0, 1000);
    const dd = inDomain(parseStrictNumber(comp.dd), -300, 300);
    const hs = inDomain(parseStrictNumber(comp.hs, true), 0, 100);
    const jointlyComplete = kd !== null && acs !== null && dd !== null && hs !== null;
    if (kd !== null) { weightedKd += kd * m; kdMatches += m; }
    if (acs !== null) { weightedAcs += acs * m; acsMatches += m; }
    if (dd !== null) { weightedDd += dd * m; ddMatches += m; }
    if (hs !== null) { weightedHs += hs * m; hsMatches += m; }
    // Promedios de clasificación SOLO sobre observaciones conjuntamente completas:
    // datos disjuntos (métricas de distintas muestras) jamás alteran los promedios.
    if (jointlyComplete) {
      jointMatches += m;
      jointKdSum += kd * m;
      jointAcsSum += acs * m;
      jointDdSum += dd * m;
      jointHsSum += hs * m;
    }
  });
  const avgKd = jointMatches > 0 ? Number((jointKdSum / jointMatches).toFixed(2)) : null;
  const avgAcs = jointMatches > 0 ? Number((jointAcsSum / jointMatches).toFixed(1)) : null;
  const avgDd = jointMatches > 0 ? Number((jointDdSum / jointMatches).toFixed(1)) : null;
  const avgHs = jointMatches > 0 ? Number((jointHsSum / jointMatches).toFixed(1)) : null;
  const metricsPresent = { kd: kdMatches > 0, acs: acsMatches > 0, dd: ddMatches > 0, hs: hsMatches > 0 };
  const missingMetrics = Object.keys(metricsPresent).filter(k => !metricsPresent[k]);

  const totalGenHours = careerReport.summary.totalGeneral.hours;
  const peakRank = careerReport.summary.highestPeakRank || 'Unranked';

  if (totalCompMatches === 0) {
    return {
      category: 'DATOS INSUFICIENTES',
      talentRatio: 'N/A',
      zeroFpsBackground,
      trueDeservedRank: 'Indeterminado (sin muestra)',
      sampleSize: 0,
      confidence: 'nula',
      claimStatus: CLAIM_STATUS,
      disclaimer: EVIDENCE_DISCLAIMER,
      limitations: LIMITATIONS,
      formula: 'Clasificación por ACS/KD/DDΔ ponderados por partidas y horas totales; requiere ≥1 partida registrada',
      duplicatesSkipped,
      identityUncertain,
      conflictingSnapshots,
      unidentifiedRecords,
      telemetrySummary: {
        averageKd: null,
        averageAcs: null,
        averageDd: null,
        averageHs: null,
        totalCompetitiveMatches: 0,
        totalGeneralHours: totalGenHours
      },
      rationale: 'Sin partidas registradas no se clasifica talento/esfuerzo ni se proyecta rango merecido.',
      bottleneckOptimization: null
    };
  }

  if (missingMetrics.length > 0) {
    return {
      category: 'DATOS INSUFICIENTES',
      talentRatio: 'N/A',
      zeroFpsBackground,
      trueDeservedRank: 'Indeterminado (métricas ausentes)',
      sampleSize: totalCompMatches,
      confidence: 'nula',
      claimStatus: CLAIM_STATUS,
      disclaimer: EVIDENCE_DISCLAIMER,
      limitations: LIMITATIONS,
      formula: 'Clasificación requiere kd[0,10], acs[0,1000], dd[-300,300] y hs[0,100] observados con parseo estricto; faltan: ' + missingMetrics.join(', '),
      metricsPresent,
      duplicatesSkipped,
      identityUncertain,
      conflictingSnapshots,
      unidentifiedRecords,
      telemetrySummary: {
        averageKd: avgKd,
        averageAcs: avgAcs,
        averageDd: avgDd,
        averageHs: avgHs === null ? null : `${avgHs}%`,
        totalCompetitiveMatches: totalCompMatches,
        totalGeneralHours: totalGenHours
      },
      rationale: `Con ${totalCompMatches} partidas pero sin ${missingMetrics.join(', ')} no se clasifica talento/esfuerzo ni se proyecta rango merecido.`,
      bottleneckOptimization: null
    };
  }

  // Umbrales CONCLUYENTES: una conclusión favorable exige evidencia claramente
  // por encima del piso de validez, no un epsilon sobre el umbral. KD>0.9,
  // ACS>225 y HS>15 con ≥2 señales; en frontera exacta, igual o apenas-sobre,
  // solo se describe lo observado (sin conclusión específica sin evidencia).
  const conclusiveSignals = [avgKd !== null && avgKd > 0.9, avgAcs !== null && avgAcs > 225, avgHs !== null && avgHs > 15].filter(Boolean).length;
  const hasMeaningfulImpact = jointMatches >= 5 && conclusiveSignals >= 2;
  if (!hasMeaningfulImpact) {
    const observed = [`KD ${avgKd === null ? 'n/d' : avgKd}`, `ACS ${avgAcs === null ? 'n/d' : avgAcs}`, `DDΔ ${avgDd === null ? 'n/d' : avgDd}`, `HS ${avgHs === null ? 'n/d' : avgHs + '%'}`].join(', ');
    return {
      category: 'EVIDENCIA DESCRIPTIVA',
      talentRatio: 'N/A',
      zeroFpsBackground,
      trueDeservedRank: 'Indeterminado (evidencia límite)',
      sampleSize: jointMatches,
      confidence: 'baja',
      claimStatus: CLAIM_STATUS,
      disclaimer: EVIDENCE_DISCLAIMER,
      limitations: LIMITATIONS,
      formula: 'Clasificación favorable exige evidencia CONCLUYENTE (≥2 de KD>0.9, ACS>225, HS>15) sobre ≥5 partidas CONJUNTAS; en pisos de validez (KD>0.3, ACS>100, DD>-300) o apenas-sobre-umbral solo se describe lo observado',
      metricsPresent,
      jointMatches,
      duplicatesSkipped,
      identityUncertain,
      conflictingSnapshots,
      unidentifiedRecords,
      telemetrySummary: {
        averageKd: avgKd,
        averageAcs: avgAcs,
        averageDd: avgDd,
        averageHs: avgHs === null ? null : `${avgHs}%`,
        totalCompetitiveMatches: totalCompMatches,
        totalGeneralHours: totalGenHours
      },
      rationale: `Observado en muestra conjunta (${jointMatches} partidas): ${observed}. Evidencia insuficiente para clasificar talento o proyectar rango.`,
      bottleneckOptimization: null
    };
  }

  // Patrón de breakout (heurístico): cuenta joven con pico alto.
  const freshAccount = personal.find(a => (a.competitive?.matches || 0) > 0 && (a.competitive?.matches || 0) <= 30 && rankTier(a.peakRank) === 'diamond');
  const hasSmurfBreakout = Boolean(freshAccount);

  let category = 'HIPÓTESIS DE TALENTO FORJADO CON ESFUERZO (no verificada)';
  let talentPct = 70;
  let effortPct = 30;
  let rationale = '';

  if (hasSmurfBreakout || (avgDd >= 25 && avgKd >= 1.20)) {
    category = 'HIPÓTESIS DE TALENTO TÁCTICO INDIVIDUAL (no verificada)';
    talentPct = 75;
    effortPct = 25;
    rationale = `Los indicadores observados son compatibles con un pico temprano (pico ${peakRank} con ${freshAccount?.competitive?.matches ?? '≤30'} partidas), pero esto es una hipótesis descriptiva: no demuestra talento nato ni descarta volumen de juego.`;
  } else if (totalGenHours > 1200 && avgKd <= 1.05) {
    category = 'HIPÓTESIS DE VOLUMEN DE JUEGO (no verificada)';
    talentPct = 25;
    effortPct = 75;
    rationale = 'El patrón es compatible con progresión sostenida por volumen de horas; no permite atribuir causalidad ni descartar aprendizaje acelerado.';
  } else {
    category = 'HIPÓTESIS DE TALENTO FORJADO CON ESFUERZO (no verificada)';
    talentPct = 60;
    effortPct = 40;
    rationale = 'Los agregados no separan talento de esfuerzo; esta mezcla es una etiqueta descriptiva, no un veredicto.';
  }

  // Estimación heurística de rango (NO verificada): cota orientativa, no real.
  let trueRank = 'Platino 2';
  if (rankTier(peakRank) === 'diamond' || (hasSmurfBreakout && avgDd >= 20)) {
    trueRank = 'Platino 3 – Diamante 1';
  } else if (avgAcs >= 240 && avgKd >= 1.25) {
    trueRank = 'Platino 2 – Platino 3';
  } else {
    trueRank = 'Oro 3 – Platino 1';
  }
  const rankEstimate = `${trueRank} (estimación heurística, NO verificada)`;

  return {
    category,
    talentRatio: `${talentPct}% indicadores de impacto / ${effortPct}% indicadores de volumen (heurístico, no verificado)`,
    zeroFpsBackground,
    trueDeservedRank: rankEstimate,
    sampleSize: jointMatches,
    confidence: identityUncertain ? (jointMatches >= 20 ? 'media' : 'baja') : (jointMatches >= 100 ? 'alta' : (jointMatches >= 20 ? 'media' : 'baja')),
    claimStatus: CLAIM_STATUS,
    disclaimer: EVIDENCE_DISCLAIMER,
    limitations: LIMITATIONS,
    formula: 'ACS/KD/DDΔ ponderados por partidas; patrón de breakout en ≤30 partidas a Diamante o DDΔ≥25 con KD≥1.20; confianza por cobertura conjunta. Salida heurística no verificada',
    metricsPresent,
    jointMatches,
    duplicatesSkipped,
    identityUncertain,
    conflictingSnapshots,
    unidentifiedRecords,
    telemetrySummary: {
      averageKd: avgKd,
      averageAcs: avgAcs,
      averageDd: avgDd,
      averageHs: `${avgHs}%`,
      totalCompetitiveMatches: totalCompMatches,
      totalGeneralHours: totalGenHours
    },
    rationale,
    bottleneckOptimization: {
      metric: 'Headshot Ratio (HS%)',
      currentValue: `${avgHs}%`,
      targetValue: '25% – 28%',
      tacticalAdvice: 'Trabaja la altura de mira (crosshair placement) para que el primer impacto castigue a la cabeza en vez de depender de 3 tiros al pecho. Es una sugerencia biomecánica genérica, no una prescripción derivada de una medición causal.'
    }
  };
}

module.exports = {
  evaluateMmrDrag,
  evaluateTalentVsEffort
};
