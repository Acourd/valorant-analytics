#!/usr/bin/env node
/**
 * kovaaks_generator.js - Adaptive 15-Minute Kovaaks Aim Routine Generator
 *
 * Genera la rutina SOLO si existe evidencia mecánica observada para una
 * debilidad con umbral documentado y ejercicio disponible (contrato único
 * `routine_contract`). Sin HS% por defecto, sin sensibilidad inventada y sin
 * mapa por defecto: si falta evidencia devuelve RUTINA OMITIDA con faltantes.
 *
 * Usage: node kovaaks_generator.js <match_id_or_json_file> [target_player_handle]
 */

const fs = require('fs');
const { extractMatchId, fetchMatch } = require('./fetch_match');
const { parseDuels } = require('./duel_matrix');
const { resolveExactHandle, sourceProvenance, provenanceLabel, observedNumber } = require('./data_contract');
const { buildEvidence, canGenerateRoutine, KOVAAKS_SCENARIOS } = require('./routine_contract');
const { analyzeWeaponTelemetry } = require('./weapon_telemetry');

function generateKovaaksRoutine(matchData, targetHandle) {
  if (!matchData || !matchData.data) {
    throw new Error('Datos de partida inválidos: estructura matchData.data ausente.');
  }
  const meta = matchData.data.metadata || {};
  const segments = matchData.data.segments || [];

  // Resolución canónica exacta: objetivo inexistente/ambiguo => fail-closed.
  const { playerMap, target } = parseDuels(matchData, targetHandle);
  const handle = target || resolveExactHandle(Object.keys(playerMap), targetHandle);

  const summary = segments.find(s => s.type === 'player-summary' &&
    (s.metadata?.platformUserHandle === handle || s.attributes?.platformUserIdentifier === handle));
  const stats = (summary && summary.stats) || {};

  const mechanical = {
    hsPct: observedNumber(stats, ['hsAccuracy', 'headshotsPercentage']),
    fk: observedNumber(stats, ['firstKills']),
    fd: observedNumber(stats, ['firstDeaths']),
    acs: observedNumber(stats, ['scorePerRound'])
  };

  let weapon = null;
  try {
    weapon = analyzeWeaponTelemetry(matchData, handle);
  } catch (e) {
    weapon = null;
  }

  const provenance = sourceProvenance(meta);
  const evidence = buildEvidence({ profile: { player: handle, provenance, mechanical }, weapon, matchProvenance: provenance, player: handle });
  const gate = canGenerateRoutine(evidence);

  const base = {
    player: handle,
    map: meta.mapName || null,
    provenance,
    provenanceLabel: provenanceLabel(provenance),
    thresholds: gate.thresholds
  };

  if (!gate.canGenerate) {
    return {
      ...base,
      omitted: true,
      reason: 'RUTINA OMITIDA',
      omittedReason: gate.omittedReason,
      missingMetrics: gate.missingMetrics,
      requiredData: gate.requiredData,
      weaknesses: [],
      routine: [],
      sensitivityRecommendation: null,
      sensitivityNote: 'Sin datos de sensibilidad observados: no se emite recomendación.'
    };
  }

  const routine = [];
  for (const w of gate.weaknesses) {
    for (const sc of (KOVAAKS_SCENARIOS[w.area] || [])) {
      routine.push({ ...sc, focus: w.area, reason: w.reason, enablingMetric: w.enablingMetric, threshold: w.threshold });
    }
  }

  return {
    ...base,
    omitted: false,
    weaknesses: gate.weaknesses,
    hsPct: mechanical.hsPct === null ? null : `${mechanical.hsPct}%`,
    routine,
    sensitivityRecommendation: null,
    sensitivityNote: 'Sin datos de sensibilidad observados: no se emite recomendación.'
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args[0]) {
    console.error('Usage: node kovaaks_generator.js <match_id_or_json_file> [target_player_handle]');
    process.exit(1);
  }

  let matchData;
  if (fs.existsSync(args[0])) {
    matchData = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  } else {
    const matchId = extractMatchId(args[0]);
    matchData = fetchMatch(matchId);
  }

  const res = generateKovaaksRoutine(matchData, args[1]);

  if (res.omitted) {
    console.log(`\n=== ${res.reason}: ${res.player || 'objetivo'} ===`);
    console.log(`Procedencia: ${res.provenanceLabel}`);
    console.log(`Motivo: ${res.omittedReason}`);
    console.log(`Métricas faltantes: ${res.missingMetrics.join(', ') || 'ninguna'}`);
    console.log(`Datos requeridos: ${res.requiredData.join('; ') || 'ninguna'}`);
  } else {
    console.log(`\n=== ADAPTIVE 15-MIN KOVAAKS AIM ROUTINE (AIM LAB): ${res.player} ===`);
    console.log(`Procedencia: ${res.provenanceLabel} | Mapa: ${res.map || 'n/d'} | HS%: ${res.hsPct || 'n/d'}`);
    console.log(`Sensibilidad: ${res.sensitivityNote}`);
    res.routine.forEach((r, idx) => {
      console.log(`\n[Bloque ${idx + 1}] ${r.scenario} | ${r.aimLab} (${r.duration})`);
      console.log(`  Enfoque: ${r.category}`);
      console.log(`  Motivo: ${r.reason}`);
      console.log(`  Técnica: ${r.instruction}`);
    });
  }
}

module.exports = { generateKovaaksRoutine };
