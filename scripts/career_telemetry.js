#!/usr/bin/env node
'use strict';

/**
 * career_telemetry.js - Motor de Auditoría de Trayectoria y Telemetría de Carrera
 *
 * Resuelve definitivamente los errores de cálculo de horas de juego en Valorant:
 * 1. Distingue rigurosamente entre tiempo efectivo en partida (timePlayed de Tracker.gg)
 *    y puntos de cuenta teóricos (Account Points / AP).
 * 2. Desglosa horas Competitivas vs Horas Casuales (Unrated, Swiftplay, Nivel 1-20).
 * 3. Gestiona multi-cuenta con exclusión de cuentas prestadas/familiares (e.g. Ayco#Dark).
 * 4. Muestra escenarios ILUSTRATIVOS de hitos por rango (no una predicción ni
 *    una medición del MMR interno; sin validación empírica con telemetría real).
 * 5. Cero dependencias externas (Node.js core).
 */

const fs = require('fs');
const path = require('path');

function parsePlaytimeSeconds(stats) {
  if (!stats) return 0;
  if (stats.timePlayed && typeof stats.timePlayed.value === 'number') {
    return stats.timePlayed.value;
  }
  return 0;
}

function formatHours(seconds) {
  if (!seconds || seconds <= 0) return '0h';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

function extractAccountTelemetry(profileData, options = {}) {
  const isExcluded = Boolean(options.isExcluded);
  const note = options.note || (isExcluded ? 'Excluida (Familiar/Compartida)' : 'Cuenta Propia');
  
  const handle = options.handle || 
                 profileData.platformInfo?.platformUserHandle || 
                 profileData.platformInfo?.platformUserId || 
                 'Desconocido';

  const level = profileData.metadata?.accountLevel || options.level || null;
  const segments = Array.isArray(profileData.data) 
    ? profileData.data 
    : (profileData.segments || profileData.data?.segments || [profileData]);

  let competitiveSeconds = 0;
  let unratedSeconds = 0;
  let otherSeconds = 0;
  let compMatches = 0;
  let compWins = 0;
  let kd = 'N/A';
  let hs = 'N/A';
  let acs = 'N/A';
  let dd = 'N/A';
  let currentRank = 'Unranked';
  let peakRank = 'N/A';

  // Extract from playlist segments or season segments
  segments.forEach(seg => {
    const pl = seg.attributes?.playlist || seg.metadata?.playlistName || '';
    const st = seg.stats || {};

    if (seg.type === 'playlist') {
      const sec = parsePlaytimeSeconds(st);
      if (pl === 'competitive') {
        competitiveSeconds = Math.max(competitiveSeconds, sec);
        compMatches = st.matchesPlayed?.value || compMatches;
        compWins = st.matchesWon?.value || compWins;
        kd = st.kDRatio?.displayValue || kd;
        hs = st.headshotsPercentage?.displayValue || hs;
        acs = st.scorePerRound?.displayValue || acs;
        dd = st.damageDeltaPerRound?.displayValue || dd;
      } else if (pl === 'unrated') {
        unratedSeconds = Math.max(unratedSeconds, sec);
      } else {
        otherSeconds += sec;
      }
    } else if (seg.type === 'season' && pl === 'competitive') {
      if (competitiveSeconds === 0) {
        competitiveSeconds += parsePlaytimeSeconds(st);
        compMatches += st.matchesPlayed?.value || 0;
        compWins += st.matchesWon?.value || 0;
      }
    }

    if (st.rank?.metadata?.tierName) currentRank = st.rank.metadata.tierName;
    if (st.peakRank?.displayValue) peakRank = st.peakRank.displayValue;
  });

  // Base casual requirement (levels 1-20 need ~25h of casual to unlock competitive).
  // Solo se aplica con telemetría observada: con nivel pero cero segundos registrados
  // no se inventan horas (allowance documentada, no medida).
  const observedSeconds = competitiveSeconds + unratedSeconds + otherSeconds;
  let casualAllowanceSeconds = 0;
  if (level && level >= 20 && unratedSeconds === 0 && observedSeconds > 0) {
    casualAllowanceSeconds = 25 * 3600; // ~25 hours standard
  }

  const totalCasualSeconds = unratedSeconds + otherSeconds + casualAllowanceSeconds;
  const totalGeneralSeconds = competitiveSeconds + totalCasualSeconds;
  const insufficientData = observedSeconds === 0;

  return {
    handle,
    level,
    isExcluded,
    note,
    insufficientData,
    sampleSize: compMatches,
    competitive: {
      seconds: competitiveSeconds,
      hours: Number((competitiveSeconds / 3600).toFixed(1)),
      formatted: formatHours(competitiveSeconds),
      matches: compMatches,
      wins: compWins,
      kd,
      hs,
      acs,
      dd
    },
    casual: {
      seconds: totalCasualSeconds,
      hours: Number((totalCasualSeconds / 3600).toFixed(1)),
      formatted: formatHours(totalCasualSeconds)
    },
    general: {
      seconds: totalGeneralSeconds,
      hours: Number((totalGeneralSeconds / 3600).toFixed(1)),
      formatted: formatHours(totalGeneralSeconds)
    },
    currentRank,
    peakRank: peakRank !== 'N/A' ? peakRank : currentRank
  };
}

function aggregateCareerTelemetry(accountsList) {
  const processed = accountsList.map(item => {
    if (item.telemetry) return item.telemetry;
    return extractAccountTelemetry(item.data || item, item.options || {});
  });

  const personal = processed.filter(a => !a.isExcluded);
  const excluded = processed.filter(a => a.isExcluded);

  const totalCompSeconds = personal.reduce((acc, a) => acc + a.competitive.seconds, 0);
  const totalCasualSeconds = personal.reduce((acc, a) => acc + a.casual.seconds, 0);
  const totalGeneralSeconds = personal.reduce((acc, a) => acc + a.general.seconds, 0);
  const totalMatches = personal.reduce((acc, a) => acc + a.competitive.matches, 0);

  // Highest peak rank among personal accounts
  const rankWeights = {
    'Iron': 1, 'Bronze': 2, 'Silver': 3, 'Gold': 4,
    'Platinum': 5, 'Diamond': 6, 'Ascendant': 7, 'Immortal': 8, 'Radiant': 9
  };

  let maxRank = 'Iron 1';
  let maxWeight = 0;
  personal.forEach(a => {
    for (const [tier, w] of Object.entries(rankWeights)) {
      if ((a.peakRank || '').includes(tier) && w > maxWeight) {
        maxWeight = w;
        maxRank = a.peakRank;
      }
    }
  });

  return {
    accounts: processed,
    dataQuality: processed.length === 0 || processed.every(a => a.insufficientData)
      ? 'insuficiente'
      : (processed.some(a => a.insufficientData) ? 'parcial' : 'completa'),
    summary: {
      totalAccounts: processed.length,
      personalAccounts: personal.length,
      excludedAccounts: excluded.length,
      totalCompetitive: {
        seconds: totalCompSeconds,
        hours: Number((totalCompSeconds / 3600).toFixed(1)),
        formatted: formatHours(totalCompSeconds),
        matches: totalMatches
      },
      totalCasual: {
        seconds: totalCasualSeconds,
        hours: Number((totalCasualSeconds / 3600).toFixed(1)),
        formatted: formatHours(totalCasualSeconds)
      },
      totalGeneral: {
        seconds: totalGeneralSeconds,
        hours: Number((totalGeneralSeconds / 3600).toFixed(1)),
        formatted: formatHours(totalGeneralSeconds)
      },
      highestPeakRank: maxRank
    }
  };
}

function generateMilestonesTimeline(careerReport, options = {}) {
  // Escenarios ILUSTRATIVOS de referencia (tipo: 'ilustrativo'): sirven como
  // vara de comparación pedagógica, NO como predicción del rango futuro ni
  // como medición del MMR. Sin validación empírica con telemetría real.
  const totalComp = careerReport.summary.totalCompetitive.hours;
  if (!totalComp || totalComp <= 0) {
    return [{
      tipo: 'ilustrativo',
      rango: 'Sin datos',
      tramoHoras: 0,
      acumuladoHoras: 0,
      contexto: 'Datos insuficientes: conecta telemetría real de partidas para comparar con escenarios de referencia. No se inventa historial.'
    }];
  }
  const diamondAcc = careerReport.accounts.find(a => (a.peakRank || '').includes('Diamond'));
  const speedrunHours = (diamondAcc && typeof diamondAcc.competitive?.hours === 'number')
    ? diamondAcc.competitive.hours
    : (typeof options.speedrunHours === 'number' ? options.speedrunHours : 10.2);
  const mainAgent = options.mainAgent || 'Iso';
  const speedrunHandle = diamondAcc ? diamondAcc.handle : (options.speedrunHandle || 'Speedrun');

  return [
    {
      tipo: 'ilustrativo',
      rango: 'Hierro 3 (Inicio)',
      tramoHoras: 8,
      acumuladoHoras: 8,
      contexto: 'Escenario ilustrativo (no predicción): calibración inicial y primer contacto con shooters tácticos.'
    },
    {
      tipo: 'ilustrativo',
      rango: 'Bronce 1 - Bronce 3',
      tramoHoras: 22,
      acumuladoHoras: 30,
      contexto: 'Escenario ilustrativo (no predicción): superación de mecánicas elementales de movimiento y mapa.'
    },
    {
      tipo: 'ilustrativo',
      rango: 'Plata 1 - Plata 3',
      tramoHoras: 65,
      acumuladoHoras: 95,
      contexto: 'Escenario ilustrativo (no predicción): desarrollo de crosshair placement básico y control de dispersión.'
    },
    {
      tipo: 'ilustrativo',
      rango: 'Oro 1 - Oro 3',
      tramoHoras: 165,
      acumuladoHoras: 260,
      contexto: `Escenario ilustrativo (no predicción): consolidación competitiva y especialización en ${mainAgent}.`
    },
    {
      tipo: 'ilustrativo',
      rango: 'Platino 1',
      tramoHoras: 80,
      acumuladoHoras: 340,
      contexto: 'Escenario ilustrativo (no predicción): aislamiento de micro-duelos 1v1 y duelos de apertura.'
    },
    {
      tipo: 'ilustrativo',
      rango: 'Diamante 1',
      tramoHoras: speedrunHours,
      acumuladoHoras: Math.round(340 + speedrunHours),
      contexto: `Escenario ilustrativo (no predicción) en cuenta limpia (${speedrunHandle}); no implica anclaje de MMR verificado.`
    }
  ];
}

module.exports = {
  formatHours,
  extractAccountTelemetry,
  aggregateCareerTelemetry,
  generateMilestonesTimeline
};
