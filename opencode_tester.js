#!/usr/bin/env node
/**
 * opencode_tester.js - Autonomous Audit & Diagnostic Harness for Open Code / DeepSeek
 * 
 * Specifically calibrated for LLM agents (DeepSeek-V3/R1, Claude, Antigravity, Open Code)
 * to run comprehensive static and runtime checks, detect platform frictions,
 * and provide machine-readable actionable directives.
 * 
 * Usage: node opencode_tester.js [--json] [--verbose]
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = __dirname;
const scriptsDir = path.join(rootDir, 'scripts');
const examplesDir = path.join(rootDir, 'examples');
const sampleFile = path.join(examplesDir, 'sample_match.json');

const auditResult = {
  timestamp: new Date().toISOString(),
  harness: 'Open Code / DeepSeek Telemetry Auditor (v2.5)',
  environment: {
    nodeVersion: process.version,
    platform: process.platform,
    cwd: rootDir
  },
  scores: {
    total: 0,
    max: 100
  },
  modulesChecked: [],
  staticAudits: [],
  runtimeAudits: [],
  aiAgentDirectives: []
};

// 1. Static Contract & Filesystem Checks
const requiredFiles = [
  'SKILL.md',
  'README.md',
  'LICENSE',
  'standalone_prompt.md',
  'test_suite.js',
  'examples/sample_match.json',
  'scripts/cli.js',
  'scripts/learning_profile.js',
  'scripts/duo_synergy.js',
  'scripts/duel_matrix.js',
  'scripts/economy_analyzer.js',
  'scripts/kovaaks_generator.js',
  'scripts/coaching_engine.js',
  'scripts/fetch_match.js',
  'scripts/fetch_profile.js',
  'scripts/http_fetch.js',
  'scripts/weapon_telemetry.js'
];

let staticScore = 0;
const staticMax = 30;

requiredFiles.forEach(relPath => {
  const fullPath = path.join(rootDir, relPath);
  const exists = fs.existsSync(fullPath);
  const size = exists ? fs.statSync(fullPath).size : 0;
  auditResult.staticAudits.push({
    file: relPath,
    exists,
    sizeBytes: size,
    status: exists ? 'PASS' : 'FAIL'
  });
  if (exists && size > 100) staticScore += (staticMax / requiredFiles.length);
});

// 2. Runtime Execution Checks with Strict Contract Assertions (Zero-Placebo)
const runtimeTests = [
  {
    module: 'learning_profile.js',
    description: '360° Autodiagnosis & ELO Leaks Extraction',
    cmd: `node ${path.join(scriptsDir, 'learning_profile.js')} "${sampleFile}" "TenZ#0001"`,
    weight: 10,
    validate: (out) => out.includes('DIAGNÓSTICO 360°') && out.includes('RADAR DE DOMINIO')
  },
  {
    module: 'duo_synergy.js',
    description: 'Premade Tactical Synergy & Carry Load Audit',
    cmd: `node ${path.join(scriptsDir, 'duo_synergy.js')} "${sampleFile}" "TenZ#0001" "Chronicle#0001"`,
    weight: 10,
    validate: (out) => (out.includes('AUDITORÍA DE SINERGIA') || out.includes('AUDITORÍA DE DÚO')) && (out.includes('Puntuación de Sinergia') || out.includes('carga'))
  },
  {
    module: 'duel_matrix.js',
    description: 'Head-to-Head 1v1 Encounter Matrix',
    cmd: `node ${path.join(scriptsDir, 'duel_matrix.js')} "${sampleFile}" "TenZ#0001"`,
    weight: 5,
    validate: (out) => out.includes('1v1 DUEL MATRIX') || out.includes('MATRIZ DE DUELOS')
  },
  {
    module: 'economy_analyzer.js',
    description: 'Buy-Tier & Loadout Conversion Analysis',
    cmd: `node ${path.join(scriptsDir, 'economy_analyzer.js')} "${sampleFile}" "TenZ#0001"`,
    weight: 5,
    validate: (out) => out.includes('ECONOMY') || out.includes('DESGLOSE DE ECONOMÍA') || out.includes('ECO')
  },
  {
    module: 'kovaaks_generator.js',
    description: 'Adaptive 15-Minute Aim Routine Synthesis',
    cmd: `node ${path.join(scriptsDir, 'kovaaks_generator.js')} "${sampleFile}" "TenZ#0001"`,
    weight: 5,
    validate: (out) => out.includes('KOVAAKS AIM ROUTINE') || out.includes('RUTINA KOVAAKS')
  },
  {
    module: 'weapon_telemetry.js',
    description: 'Deep Weapon & Distance Band Telemetry',
    cmd: `node ${path.join(scriptsDir, 'weapon_telemetry.js')} "${sampleFile}" "TenZ#0001"`,
    weight: 10,
    validate: (out) => out.includes('TELEMETRÍA DE ARMAS') && out.includes('SE/TP Ratio')
  },
  {
    module: 'cli.js (weapons)',
    description: 'Master CLI Distance Conversion Integration',
    cmd: `node ${path.join(scriptsDir, 'cli.js')} weapons "${sampleFile}" "TenZ#0001"`,
    weight: 5,
    validate: (out) => out.includes('DISTANCIA Y CONVERSIÓN')
  },
  {
    module: 'cli.js (calibrate)',
    description: 'Master CLI Zero-Cloud Offline Mode',
    cmd: `node ${path.join(scriptsDir, 'cli.js')} calibrate "Sovereign#001" "Immortal 3" "Duelist"`,
    weight: 5,
    validate: (out) => out.includes('CALIBRACIÓN INSTANTÁNEA ZERO-CLOUD')
  },
  {
    module: 'test_suite.js',
    description: 'Deterministic 18-Assertion Unit & Integration Suite',
    cmd: `node ${path.join(rootDir, 'test_suite.js')}`,
    weight: 15,
    validate: (out) => out.includes('18/18 tests passed') && out.includes('Exit Code: 0')
  }
];

let runtimeScore = 0;
runtimeTests.forEach(test => {
  const start = Date.now();
  let passed = false;
  let outputSnippet = '';
  let errorMsg = null;

  try {
    const out = execSync(test.cmd, { stdio: 'pipe', encoding: 'utf8', timeout: 15000 });
    passed = test.validate ? test.validate(out) : out.length > 50;
    outputSnippet = out.slice(0, 150).replace(/\s+/g, ' ');
    if (passed) runtimeScore += test.weight;
  } catch (err) {
    passed = false;
    errorMsg = err.message;
  }

  auditResult.runtimeAudits.push({
    module: test.module,
    description: test.description,
    durationMs: Date.now() - start,
    passed,
    outputSnippet,
    error: errorMsg
  });
});

// Calculate final score
auditResult.scores.total = Math.round(staticScore + runtimeScore);

// Generate Directives for DeepSeek / Open Code Agent
if (auditResult.scores.total === 100) {
  auditResult.aiAgentDirectives.push({
    priority: 'INFO',
    message: 'All 6 modules pass runtime execution with Exit Code 0. The skill contracts are fully intact.'
  });
  auditResult.aiAgentDirectives.push({
    priority: 'ENHANCEMENT',
    message: 'Ensure unified master CLI (cli.js) is wired so that users can query any player handle without specifying discrete sub-scripts.'
  });
  auditResult.aiAgentDirectives.push({
    priority: 'ZERO_SUB_GUIDANCE',
    message: 'README must clearly articulate the zero-subscription path (running locally via Node or pasting standalone_prompt.md into free DeepSeek-R1/ChatGPT).'
  });
} else {
  auditResult.aiAgentDirectives.push({
    priority: 'ACTION_REQUIRED',
    message: 'One or more modules failed runtime verification. Inspect runtimeAudits array for specific stack traces.'
  });
}

// Format Output
const isJson = process.argv.includes('--json');
if (isJson) {
  console.log(JSON.stringify(auditResult, null, 2));
} else {
  console.log(`\n========================================================================`);
  console.log(`🤖 OPEN CODE / DEEPSEEK TESTER & AUDIT HARNESS`);
  console.log(`Puntuación Global: ${auditResult.scores.total} / ${auditResult.scores.max} | Estado: ${auditResult.scores.total >= 95 ? '✅ EXCELENCIA VERIFICADA' : '⚠️ ATENCIÓN REQUERIDA'}`);
  console.log(`========================================================================\n`);

  console.log(`📁 1. AUDITORÍA ESTÁTICA DE ARCHIVOS (${Math.round(staticScore)} / ${staticMax} pts):`);
  auditResult.staticAudits.forEach(a => {
    console.log(`  ${a.exists ? '✓' : '✗'} [${a.status}] ${a.file.padEnd(30)} (${a.sizeBytes} bytes)`);
  });

  console.log(`\n⚡ 2. AUDITORÍA DE EJECUCIÓN EN TIEMPO REAL (${runtimeScore} / 70 pts):`);
  auditResult.runtimeAudits.forEach(r => {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.module.padEnd(25)}: ${r.passed ? 'PASS (Exit 0)' : 'FAIL'} (${r.durationMs}ms)`);
  });

  console.log(`\n🧠 3. DIRECTIVAS PARA EL AGENTE (DEEPSEEK / OPEN CODE):`);
  auditResult.aiAgentDirectives.forEach(d => {
    console.log(`  • [${d.priority}] ${d.message}`);
  });
  console.log(`\n========================================================================\n`);
}
