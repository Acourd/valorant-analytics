#!/usr/bin/env node
'use strict';

/**
 * opencode_tester.js — Autoauditoría SEMÁNTICA de propiedades negativas.
 *
 * No puntúa "excelencia": verifica que el motor NO pueda fabricar, auto-verificar
 * procedencia, analizar sin objetivo explícito, aprobar cola sin datos, reportar
 * estabilidad sin rondas, perder jugadores Unicode ni ejecutar la CLI al
 * importarse. Cada propiedad es un fail-closed verificable; si alguna falla,
 * el harness sale con código != 0.
 *
 * Usage: node opencode_tester.js [--json] [--verbose]
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = __dirname;
const scriptsDir = path.join(rootDir, 'scripts');
const sampleFile = path.join(rootDir, 'examples', 'sample_match.json');

function runNode(args, opts = {}) {
  const res = spawnSync(process.execPath, args, { cwd: opts.cwd || rootDir, encoding: 'utf8', timeout: opts.timeout || 90000 });
  return { code: res.status, out: String(res.stdout || '') + String(res.stderr || '') };
}
function runProbe(code) {
  return runNode(['-e', code]);
}

const properties = [];
function property(id, description, fn) {
  const start = Date.now();
  let result = { pass: false, details: 'sin resultado' };
  try {
    const r = fn();
    if (r === true || r === undefined) result = { pass: true, details: 'ok' };
    else if (r && typeof r === 'object' && typeof r.pass === 'boolean') result = { pass: r.pass, details: r.details || (r.pass ? 'ok' : 'falló') };
  } catch (e) {
    result = { pass: false, details: e.message };
  }
  properties.push({ id, description, pass: result.pass, details: result.details, durationMs: Date.now() - start });
}

// P01 — Contratos de archivo presentes y no vacíos.
property('P01', 'los módulos contractuales existen y no están vacíos', () => {
  const required = [
    'SKILL.md', 'README.md', 'LICENSE', 'standalone_prompt.md', 'package.json',
    'test_suite.js', 'run_all_tests.js', 'scripts/index.js', 'scripts/cli.js',
    'scripts/learning_profile.js', 'scripts/data_contract.js', 'scripts/evidence_policy.js',
    'scripts/invariant_validator.js', 'scripts/session_guardian.js', 'scripts/drift_detector.js',
    'scripts/universal_ingestor.js', '.github/workflows/ci.yml'
  ];
  const missing = required.filter(f => !fs.existsSync(path.join(rootDir, f)) || fs.statSync(path.join(rootDir, f)).size === 0);
  return { pass: missing.length === 0, details: missing.length ? `faltan: ${missing.join(', ')}` : 'todos presentes' };
});

// P02 — Sin objetivo explícito no se analiza a un jugador arbitrario.
property('P02', 'objetivo ausente con roster múltiple => fail-closed con candidatos', () => {
  const r = runNode([path.join(scriptsDir, 'cli.js'), 'match', sampleFile]);
  const failedClosed = r.code !== 0 && /TARGET_REQUIRED|Objetivo no especificado/i.test(r.out) && /Candidatos/i.test(r.out);
  const noFabricated = !/RADAR DE DOMINIO|DIAGNÓSTICO 360°/.test(r.out);
  return { pass: failedClosed && noFabricated, details: failedClosed ? (noFabricated ? 'fail-closed con candidatos' : 'emitió análisis pese al fallo') : `exit=${r.code}` };
});

// P03 — La procedencia no puede autodeclararse desde un archivo.
property('P03', 'metadata de archivo (attestation/provenance/verified) jamás autoriza causas', () => {
  const r = runProbe("const {sourceProvenance,mayAssertCauses}=require('./scripts/data_contract.js');const p=sourceProvenance({attestation:{x:1},provenance:'verified_source',verified:true});console.log('P='+p,'C='+mayAssertCauses(p));");
  return { pass: r.code === 0 && /P=normalized_input/.test(r.out) && /C=false/.test(r.out), details: r.out.trim().slice(0, 120) };
});

// P04 — Sin métricas observadas no hay radar, prescripción ni defaults.
property('P04', 'sin HS/KAST/economía/clutch observados no se inventan dimensiones ni rutina', () => {
  const r = runProbe("const {parseTextScoreboard}=require('./scripts/universal_ingestor.js');const {evaluateLearningProfile}=require('./scripts/learning_profile.js');const m=parseTextScoreboard('Focus#NA1 10 8 2 150 120');const p=evaluateLearningProfile(m,'Focus#NA1');const ok=p.mechanical.hsPct===null&&p.mechanical.kast===null&&p.mechanical.clutches===null&&p.prescripcionInmediata===null&&p.radar.disciplinaEconomica===null&&p.radar.composturaClutch===null&&p.radar.duelosDeApertura===null;console.log('NO_DEFAULTS='+ok);");
  return { pass: r.code === 0 && /NO_DEFAULTS=true/.test(r.out), details: r.out.trim().slice(0, 120) };
});

// P05 — Guardian sin datos no aprueba cola ni da consejos de salud.
property('P05', 'guardian sin sesión => INSUFFICIENT_DATA sin prescripciones', () => {
  const r = runProbe("const {SessionGuardian}=require('./scripts/session_guardian.js');const a=new SessionGuardian().auditSession({},'X#NA1');console.log('V='+a.verdict,'P='+a.prescriptions.length,'S='+a.safeToContinue);");
  return { pass: r.code === 0 && /V=INSUFFICIENT_DATA/.test(r.out) && /P=0/.test(r.out) && /S=null/.test(r.out), details: r.out.trim().slice(0, 120) };
});

// P06 — Drift sin rondas no reporta estabilidad.
property('P06', 'drift sin rondas => NO_DATA con estabilidad nula', () => {
  const r = runProbe("const {DriftDetector}=require('./scripts/drift_detector.js');const d=new DriftDetector().auditMatchDrift({},'X#NA1');console.log('V='+d.verdict,'S='+d.overallStability,'ND='+d.noData);");
  return { pass: r.code === 0 && /V=NO_DATA/.test(r.out) && /S=null/.test(r.out) && /ND=true/.test(r.out), details: r.out.trim().slice(0, 120) };
});

// P07 — Parser Unicode-safe y sin absorber numeración de fila.
property('P07', 'parser conserva Riot IDs Unicode y descarta numeración de fila', () => {
  const r = runProbe("const {parseTextScoreboard}=require('./scripts/universal_ingestor.js');const m=parseTextScoreboard('\\uFEFFMatches#NA1 -- 日本語プレイヤー#JP1 10 8 2 150 120\\n12 Nombre#EU1 5 5 1 100 90');const h=m.data.segments.map(s=>s.metadata.platformUserHandle);console.log('H='+JSON.stringify(h));");
  return {
    pass: r.code === 0 && /日本語プレイヤー#JP1/.test(r.out) && /"Nombre#EU1"/.test(r.out) && !/12 Nombre/.test(r.out),
    details: r.out.trim().slice(0, 160)
  };
});

// P08 — Importar el paquete no ejecuta la CLI ni imprime.
property('P08', 'require de la biblioteca/CLI no ejecuta comandos ni imprime banners', () => {
  const r = runProbe("const m=require('./scripts/index.js');const c=require('./scripts/cli.js');console.log('LIB_OK',typeof m.evaluateLearningProfile,typeof c.runCli);");
  const clean = r.code === 0 && /LIB_OK function function/.test(r.out) && !/UNIVERSAL SOVEREIGN|USO INTUITIVO/.test(r.out);
  return { pass: clean, details: clean ? 'import limpio' : `exit=${r.code} salida=${r.out.slice(0, 80)}` };
});

// P09 — Metadatos de paquete instalable y separación lib/CLI.
property('P09', 'package.json: bin, exports y files declaran biblioteca y CLI', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const ok = pkg.main === 'scripts/index.js'
    && pkg.bin && pkg.bin['valorant-analytics'] === 'scripts/cli.js'
    && pkg.exports && pkg.exports['.'] === './scripts/index.js'
    && Array.isArray(pkg.files) && pkg.files.includes('scripts/');
  return { pass: Boolean(ok), details: ok ? 'metadatos instalables' : JSON.stringify({ main: pkg.main, bin: pkg.bin, exports: pkg.exports, files: pkg.files }) };
});

// P10 — Ninguna ruta ejecutable contacta Tracker; solo el adaptador Riot sellado toca la red.
property('P10', 'ninguna ruta ejecutable contacta Tracker.gg; la red queda confinada al adaptador Riot', () => {
  const offenders = [];
  const netFiles = new Set(['riot_source.js', 'http_fetch.js']); // capa de red autorizada (Riot RSO/VAL-MATCH)
  for (const f of fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(scriptsDir, f), 'utf8');
    // tracker.gg solo puede aparecer como enlace informativo impreso en cli.js (sin capa de red).
    if (/https?:\/\/(api\.)?tracker\.gg/i.test(src) && f !== 'cli.js') offenders.push(`${f}:tracker`);
    if (f === 'cli.js' && /https?:\/\/(api\.)?tracker\.gg/i.test(src) && (/require\(['"](https?|node:https?)['"]\)/.test(src) || /require\(['"]\.\/http_fetch['"]\)/.test(src))) offenders.push(`${f}:tracker+red`);
    if (/require\(['"]\.\/http_fetch['"]\)/.test(src) && f !== 'riot_source.js') offenders.push(`${f}:http_fetch`);
    if (/require\(['"](https?|node:https?)['"]\)/.test(src) && !netFiles.has(f)) offenders.push(`${f}:https`);
  }
  return { pass: offenders.length === 0, details: offenders.length ? offenders.join(', ') : 'cero rutas ejecutables hacia Tracker; red solo en el adaptador Riot' };
});

// P11 — CI ejecuta todas las suites.
property('P11', 'CI ejecuta el runner único que incluye todas las suites modulares', () => {
  const ci = fs.readFileSync(path.join(rootDir, '.github', 'workflows', 'ci.yml'), 'utf8');
  const runner = fs.readFileSync(path.join(rootDir, 'run_all_tests.js'), 'utf8');
  const ok = /run_all_tests\.js/.test(ci) && /tests/.test(runner) && /readdirSync/.test(runner);
  return { pass: ok, details: ok ? 'CI completa vía run_all_tests' : 'CI no usa el runner único' };
});

// P12 — Documentación sin referencias contradictorias a Tracker/Cloudflare.
property('P12', 'SKILL.md no promete bypass de Cloudflare ni API de Tracker', () => {
  const skill = fs.readFileSync(path.join(rootDir, 'SKILL.md'), 'utf8');
  const bad = /Cloudflare/i.test(skill) || /Tracker API/i.test(skill);
  return { pass: !bad, details: bad ? 'referencias contradictorias presentes' : 'documentación coherente' };
});

// P13 — El harness determinista completo sigue verde.
property('P13', 'test_suite.js completa (con gate de manifiesto) sale con Exit 0', () => {
  const r = runNode([path.join(rootDir, 'test_suite.js')]);
  const ok = r.code === 0 && /All valorant-analytics deterministic tests passed/.test(r.out);
  const fails = String(r.out).split('\n').filter(l => /FAIL:/.test(l)).slice(0, 5).join(' | ');
  if (!ok) {
    // Diagnóstico visible en el log de CI (el output hijo está capturado).
    console.error(`P13 DIAG exit=${r.code}\n${String(r.out).slice(-2500)}`);
  }
  return { pass: ok, details: ok ? 'exit=0' : `exit=${r.code}${fails ? ` :: ${fails}` : ` :: ${String(r.out).slice(-300)}`}` };
});

// P14 — --json produce salida estructurada pura (sin render humano).
property('P14', '--json en parse devuelve un único JSON parseable con procedencia', () => {
  const tmp = path.join(require('os').tmpdir(), `tester-json-${process.pid}.txt`);
  fs.writeFileSync(tmp, 'Focus#NA1\t10\t8\t2\t150\t120\n', 'utf8');
  let r;
  try {
    r = runNode([path.join(scriptsDir, 'cli.js'), 'parse', tmp, 'Focus#NA1', '--json']);
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) { /* limpio */ }
  }
  let payload = null;
  try { payload = JSON.parse(r.out); } catch (e) { payload = null; }
  return {
    pass: r.code === 0 && payload !== null && payload.provenance === 'normalized_input' && !/=====|📋/.test(r.out),
    details: payload === null ? `salida no JSON (exit=${r.code})` : 'JSON puro con procedencia'
  };
});

// P15 — El paquete publicado no arrastra artefactos de desarrollo.
property('P15', 'package.json no distribuye tests/suites/herramientas de desarrollo', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const junk = ['tests/', 'test_suite.js', 'opencode_tester.js', 'run_all_tests.js', 'check_syntax.js'];
  const leaked = junk.filter(j => pkg.files.includes(j));
  const hasRuntime = pkg.files.includes('scripts/') && pkg.files.includes('CHANGELOG.md');
  return { pass: leaked.length === 0 && hasRuntime, details: leaked.length ? `filtrados: ${leaked.join(', ')}` : 'paquete runtime + docs' };
});

const failed = properties.filter(p => !p.pass);
const report = {
  timestamp: new Date().toISOString(),
  harness: 'auditoría semántica de propiedades negativas',
  environment: { nodeVersion: process.version, platform: process.platform, cwd: rootDir },
  summary: { total: properties.length, passed: properties.length - failed.length, failed: failed.length },
  properties,
  directives: failed.length === 0
    ? [{ priority: 'INFO', message: 'Todas las propiedades fail-closed se sostienen; ninguna ruta fabrica ni sobreinterpreta.' }]
    : failed.map(p => ({ priority: 'ACTION_REQUIRED', message: `${p.id}: ${p.description} => ${p.details}` }))
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\n========================================================================`);
  console.log(`AUDITORÍA SEMÁNTICA (propiedades negativas, sin puntuación promocional)`);
  console.log(`========================================================================`);
  for (const p of properties) {
    console.log(`  ${p.pass ? 'PASS' : 'FAIL'} [${p.id}] ${p.description} (${p.durationMs}ms)`);
    if (!p.pass || process.argv.includes('--verbose')) console.log(`       ${p.details}`);
  }
  console.log(`------------------------------------------------------------------------`);
  console.log(`RESUMEN: ${report.summary.passed}/${report.summary.total} propiedades PASS | FAIL=${report.summary.failed}`);
  console.log(`========================================================================\n`);
}

process.exit(failed.length === 0 ? 0 : 1);
