<div align="center">

# ⚡ VALORANT ANALYTICS

### Local Competitive Telemetry · 360° Descriptive Diagnostics · Adaptive Aim Engine

[![Version](https://img.shields.io/badge/version-4.11.2_Sovereign-FF4655.svg?style=for-the-badge&logo=valorant&logoColor=white)](https://playvalorant.com/)
[![Runtime](https://img.shields.io/badge/runtime-Node.js_18%2B_Native-339933.svg?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Dependencies](https://img.shields.io/badge/dependencies-0_npm_(Core)-38BDF8.svg?style=for-the-badge&logo=codeforces&logoColor=white)](package.json)
[![Tests](https://img.shields.io/badge/tests-197%2F197_PASS-10B981.svg?style=for-the-badge&logo=checkmarx&logoColor=white)](test_suite.js)
[![Audit](https://img.shields.io/badge/audit-15%2F15_properties_PASS-8B5CF6.svg?style=for-the-badge&logo=codereview&logoColor=white)](opencode_tester.js)
[![License](https://img.shields.io/badge/license-MIT-6B7280.svg?style=for-the-badge)](LICENSE)

<p align="center">
  <b>Transform round micro-events into deterministic tactical decisions.</b><br>
  Built to describe performance patterns and likely round leaks, flag possible signs of MMR anchoring (heuristic hypothesis, unverified), and suggest 15-minute biomechanical routines in KovaaK's and Aim Lab.
</p>

[Three Ways to Start](#-three-ways-to-start) • [Telemetry Matrix](#-the-problem-with-conventional-trackers) • [Architecture](#-analysis-flow-architecture) • [Diagnostics in Action](#-diagnostics-in-action) • [CLI Commands](#-master-cli-command-guide) • [Gemini Gems & GPTs](#-gemini-gems--custom-gpts-support) • [Español](README.es.md)

</div>

---

## ◈ The Problem with Conventional Trackers

Most public web trackers only sum cumulative end-of-match stats: total kills, deaths, and a generic headshot percentage. **They describe the scoreboard, but they are blind to why the match was lost.**

| Analytical Dimension | Public Trackers | Valorant Analytics Engine | Direct Impact on your Rank |
| :--- | :---: | :---: | :--- |
| **Real Impact Kills** | 🔴 Flat K/D without context | 🟢 **Effective ADR + $FK/FD$ Ratio** | Separates opening frags from meaningless exit kills in already lost 1v4 rounds. |
| **Gunfight Mechanics** | 🔴 Global headshot % | 🟢 **$SE/TP$ Ratio (observed zones)** | Measures over-spray from observed zones; distance is n/d without positions (never inferred). |
| **Duo Synergy** | 🔴 Non-existent | 🟢 **Duo Audit (aggregates)** | Describes kill/carry balance; it does NOT measure trade windows without temporal-context events. |
| **Round Economy** | 🔴 Total money spent | 🟢 **Conversion across Buy Tiers (Eco/Semi/Full)** | Identifies whether you are throwing post-pistol conversions or full-buy rounds. |
| **Account Health** | 🔴 Visual rank only | 🟡 **Heuristic MMR signal & rank estimate** | Raises an UNVERIFIED hypothesis of possible anchoring plus an indicative rank estimate. It does not measure Riot's internal MMR or real talent. |
| **Data Input** | 🔴 Cache harvesting / Tracker | 🟢 **JSON/export or text you provide** | No cache harvesting, no automatic downloads: you provide the input explicitly; the authorized route (Riot RSO) is pending credentials. |

---

## ◈ Analysis Flow Architecture

The pipeline extracts micro-data from each round and submits it to formal invariant verification and tactical inference:

```mermaid
flowchart TD
    subgraph INGESTION["1. RESILIENT MULTI-SOURCE INGESTION"]
        A1["User JSON / Export"] --> B["universal_ingestor.js"]
        A2["Scoreboard Dump
(Plain Text / OCR)"] --> B
        A3["JSON Telemetry / API
(Anti-WAF Turnstile)"] --> B
    end

    subgraph ENGINE["2. DEEP TELEMETRY ENGINES"]
        B --> C1["learning_profile.js
(360° Radar & ELO Leaks)"]
        B --> C2["weapon_telemetry.js
(Bands 0-15m / 15-30m / 30-50m)"]
        B --> C3["economy_analyzer.js
(Pistol / Eco / Full-Buy Conversion)"]
        B --> C4["duo_synergy.js
(Trades & Carry Load Balance)"]
        B --> C5["autodiagnostic_engine.js
(heuristic MMR signal & rank estimate)"]
    end

    subgraph OUTPUT["3. PRESCRIPTION & IMMEDIATE ACTION"]
        C1 --> D1["KovaaK's / Aim Lab Routine
(15-min adaptive)"]
        C2 --> D1
        C3 --> D2["Economy & Pacing Adjustments"]
        C4 --> D3["Duo Tactical Directives"]
        C5 --> D4["Career Projections & Milestones"]
    end
```

---

## ◈ Three Ways to Start

Engineered to fit any workflow with zero friction:

### 🔹 Option 1: Direct Mode without Terminal (Via Web AI or Gem)
> **Ideal if you want an immediate conversational analysis from a JSON/export or pasted scoreboard text (screenshot OCR: not implemented).**

1. Open the ready-to-use specification: 👉 [**`standalone_prompt.md`**](standalone_prompt.md)
2. Copy its entire content and paste it into your preferred AI assistant (**ChatGPT, Claude, Gemini, or DeepSeek-R1**), or configure it as a **Google Gemini Gem** or **OpenAI Custom GPT**.
3. Paste your scoreboard text or provide a JSON/export (screenshot OCR is NOT implemented; Tracker is not supported).

### ⚡ Option 2: Local Terminal Mode (Master Dispatcher `cli.js`)
> **Ideal for competitive players seeking speed (<100ms) and fully local analysis. There is no automatic Tracker download or cache harvesting: you provide a JSON/export, scoreboard text or a confirmed screenshot.**

```bash
# 1. Clone the repository
git clone https://github.com/Acourd/valorant-analytics.git
cd valorant-analytics

# 2. PLAN for your next match (recommended flow: provide → understand → one action → re-measure)
node cli.js plan examples/sample_match.json "TenZ#0001"

# 3. Ingest your own scoreboard (JSON/export or text; no network)
node cli.js parse my_scoreboard.txt "TenZ#0001"

# 4. Broader reading and routine (only when the plan enables them)
node cli.js match examples/sample_match.json "TenZ#0001"
node cli.js aim examples/sample_match.json "TenZ#0001"

# 5. Technical integrity tools (not coaching): DSSE, Merkle, MPC, Wasm, invariants
node cli.js --advanced --help
```

### 🤖 Option 3: Autonomous Agent Mode (Antigravity / Claude Code / OpenCode)
> **For developers and advanced power users integrating agentic skills.**

- Mount the directory as an active skill via [`SKILL.md`](SKILL.md).
- Access over 16 commands featuring formal invariant validation and Ed25519 DSSE v1 in-toto cryptographic attestations.

---

## ◈ Diagnostics in Action

Illustrative example (local fixture; not real telemetry and not an empirically validated output):

```text
========================================================================
⚡ VALORANT ANALYTICS: UNIVERSAL SOVEREIGN ENGINE (V4.5)
========================================================================
🎯 DIAGNÓSTICO 360°: TenZ#0001 (Iso - Platinum 1) | Mapa: Lotus
------------------------------------------------------------------------
📊 RADAR DE RENDIMIENTO COMPETITIVO (5 PILARES):
  • Precisión Mecánica (HS%)  : [█████████░]  86 / 100  (29.9% Headshots | Benchmark: 25-35%)
  • Participación Útil (KAST) : [████████░░]  82 / 100  (74.0% de rondas útiles)
  • Apertura de Duelos (FK/FD): [█████████░]  94 / 100  (54.0% de First Bloods | 4 FK / 1 FD)
  • Disciplina Económica      : [█████████░]  90 / 100  (68.0% win en compra completa)
  • Compostura en Clutch      : [████████░░]  80 / 100  (33.3% conversión en situaciones 1v2)

🚨 TOP FUGAS DE ELO IDENTIFICADAS (DÓNDE REGALASTE RONDAS):
  [#1] Sobre-asomo en post-plant (Rondas 7 y 14)
       Situación: Ventaja numérica de 5v3 con la spike plantada.
       Causa:     Búsqueda agresiva de la baja final en lugar de cruzar fuego.
       Ajuste:    Jugar esquinas cerradas y consumir el reloj del defensor.

  [#2] Prolonged sprays in observed rounds (illustrative example; distance is n/d without positions)
       Situación: Duelos largos contra Vandal rival en A Principal.
       Causa:     Ratio de spray elevado (SE/TP > 1.8) con dispersión excesiva.
       Ajuste:    Ráfagas cortas de 2 balas con desplazamiento lateral (counter-strafe).

🎯 RUTINA BIOMECÁNICA PRESCRITA (15 MINUTOS EXACTOS):
  ┌───────────────────────────┬──────────┬──────────────────────┬─────────────────────────────────────┐
  │ Bloque de Entrenamiento   │ Duración │ Escenario KovaaK's   │ Objetivo Biomecánico                │
  ├───────────────────────────┼──────────┼──────────────────────┼─────────────────────────────────────┤
  │ 1. Calibración Primer Tiro│ 5 min    │ Pasu Small Reload    │ Calibración de parada en la cabeza  │
  │ 2. Limpieza de Ángulos    │ 5 min    │ 1wall6targets small  │ Confirmación de 1-tap en movimiento │
  │ 3. Control Horizontal     │ 5 min    │ Thin Aiming Long     │ Suavidad sin temblor en tracking    │
  └───────────────────────────┴──────────┴──────────────────────┴─────────────────────────────────────┘
========================================================================
```

---

## ◈ Master CLI Command Guide

The master dispatcher `cli.js` provides unified access to all platform engines:

| Command | Syntax | Description |
| :--- | :--- | :--- |
| **360° Diagnostics** | `node cli.js match [match.json] <player>` | Evaluates 5 skill pillars and extracts the top 3 critical ELO leaks. |
| **Aim Routine** | `node cli.js aim [match.json] <player>` | Synthesizes an adaptive 15-minute playlist in KovaaK's / Aim Lab. |
| **Weapon Telemetry** | `node cli.js weapons [match.json] <player>` | Calculates observed hit zones (Head/Body/Leg) and SE/TP ratio; distance is n/d: never inferred without positions. |
| **Economy & Buy Tiers**| `node cli.js economy [match.json] <player>` | Breaks down win rate, K/D, and ADR across Pistol, Eco, Semi-Buy, and Full-Buy rounds. |
| **Introspective Coaching**| `node cli.js coaching [match.json] <player>` | Pinpoints high-friction duels and pairs errors with curated tactical YouTube drills. |
| **Duo Synergy Audit** | `node cli.js duo [match.json] [p1] [p2]` | Describes kill/carry balance (no timing windows; boost heuristic is unvalidated). |
| **1v1 Duel Matrix** | `node cli.js duels [match.json] [player]` | Analyzes direct head-to-head encounters against every opponent agent. |
| **Offline Simulation** | `node cli.js calibrate [player] [rank] [role]` | SIMULATION with illustrative values (no player data, no real telemetry). |
| **Career Audit** | `node cli.js career <profile.json>` | Breaks down competitive vs casual hours and generates rank milestones chronology. |
| **Heuristic MMR Signal** | `node cli.js diagnose <profile.json>` | Flags a pattern compatible with possible anchoring (UNVERIFIED hypothesis) and an indicative rank estimate. It does not measure internal MMR. |
| **Resilient Ingestion** | `node cli.js parse <file_or_text> [player]` | Parses JSON/export, text dumps or any existing file (extension optional). No network. |
| **Formal Invariants** | `node cli.js invariants [match.json] [player]` | Verifies mathematical bounds [0, 100] and hit-zone sum convergence (100%). |
| **Crypto Attestation**| `node cli.js attest [match.json] [player]` | Signs and verifies an Ed25519 in-toto DSSE attestation envelope. |
| **Merkle Tree** | `node cli.js merkle [match.json]` | Constructs discrete round Merkle trees and issues inclusion proofs. |
| **Session Guardian** | `node cli.js guardian [match.json] [player]` | Monitors cumulative neuromuscular fatigue and calculates cognitive tilt index. |
| **Tactical Drift** | `node cli.js drift [match.json] [player]` | Computes side divergence and Shannon entropy across round performance quarters. |
| **Multi-Lens Consensus**| `node cli.js consensus [match.json] [player]` | Deterministic arbitration across 3 local lenses (not real BFT) to deliver unified performance verdicts. |
| **CycloneDX SBOM** | `node cli.js sbom` | Exports an official CycloneDX v1.5 SBOM manifest with 0 external dependencies. |

---

## 🗂️ Local plan tracking (privacy and retention)

The full loop is local: **create plan → mark intent → provide another match → compare → next step**.

```bash
node cli.js plan my_scoreboard.txt "TenZ#0001"        # creates and registers the plan (deterministic planId)
node cli.js plan list                                  # active plans
node cli.js plan show <planId>                         # details: metric, threshold, action, routine, log
node cli.js plan intent <planId> "short note"          # marks the action as attempted (≤200 chars)
node cli.js plan compare <planId> another_match.txt    # honest comparison (comparable metrics only)
node cli.js plan close <planId> | cancel <planId>      # close or cancel
node cli.js plan export --pseudonymized                # explicit stdout export (pseudonymized player)
```

**Privacy and retention:** history lives in `VALORANT_PLANS_DIR` (default `<cache>/plans`), one JSON file per plan, 0600 permissions on POSIX and atomic writes. The **directory perimeter** is verified on every operation, **component by component** (from the filesystem root): symlinks at any level — **parents and grandparents included**, e.g. `/path/link/plans` —, non-directory paths, foreign ownership (POSIX) and group/other write (0770/0777 are not admissible) are rejected. Creation is **stepwise** (never `recursive: true` through unvalidated parents) and the permission policy applies to the final directory, not to system parents. Each record is opened by descriptor with `O_NOFOLLOW` where available and `dev/ino` is compared against the prior inspection (substitution ⇒ fail-closed); Windows lacks `O_NOFOLLOW`, so substitution detection relies on the NTFS file-id (documented best-effort). Only plan fields are stored: player, input reference+digest, provenance, date, metric/value/threshold/limitation, action, routine, next datum, status and a short log. **No** credentials, tokens or third-party data. Retention is local and indefinite until close/cancel (you may delete files manually); 500-plan limit. `synthetic_demo` data is **not persisted** and cannot be compared.

**Honest comparison:** requires the exact same player, an observed metric and compatible provenance. States: `MEDICION_COMPARABLE`, `DATOS_INSUFICIENTES`, `NO_COMPARABLE`, `SIMULACION_DEMO`; with `--json`, a single object. The result is a **descriptive delta** with an explicit limitation: a variation across two matches does not prove routine effect, improvement, MMR, rank or talent.

**Output profiles (same evidence, different presentation):** `--profile player` (brief), `--profile coach` (evidence, limits and suggested questions) and `--profile analyst` (structured JSON). They do not change the evidence policy.


## 🧱 Resource budgets and schema contract

Untrusted inputs are processed with **explicit limits**. `VA_BUDGET_*` (e.g. `VA_BUDGET_MAX_PLAYERS=32`) **can only REDUCE** a limit: invalid values (text, NaN, Infinity, non-integers, ≤0) or attempts to raise it above the compiled safe maximum **fail closed** with `RESOURCE_BUDGET_EXCEEDED`. There is no environment escape hatch to raise limits. Exceeding a limit fails closed with a stable code and **no partial analysis**:

| Budget | Default | Rationale |
|---|---|---|
| File size | 5 MiB | a normal export is <1 MiB; wide margin without OOM |
| Text length | 200,000 chars | a huge pasted scoreboard is tens of KB |
| JSON depth | 64 levels | `JSON.parse` does not limit depth |
| Players | 64 | a match has 10-20 |
| Rounds | 200 | a long competitive match is ~40 |
| Events | 100,000 | per-round aggregates of long matches |
| Items per array | 20,000 | real damage/kill lists |
| Processing time | 30 s | **cooperative cut** at instrumented phases and loops (`sample()`); the JS runtime cannot preempt synchronous code, so it is not a guaranteed hard cutoff |
| Concurrent workers | 16 | internal stress without saturating runners |

Codes: `INPUT_TOO_LARGE` (file/text), `SCHEMA_LIMIT_EXCEEDED` (depth, players, rounds, events, arrays), `RESOURCE_BUDGET_EXCEEDED` (time, workers). With `--json`, stdout is **one object**: `{ ok:false, exitCode, error:{ code, message, details } }`.

**Versioned schema:** `schemaVersion: 1` is the current contract. Canonical locations: `data.metadata.schemaVersion` (normalized) and `matchInfo.schemaVersion` (Riot). In Riot, a root `payload.schemaVersion` is accepted **only** if it matches the canonical one; if the canonical one is missing, a root-only version is **rejected** (`SCHEMA_UNSUPPORTED`), never admitted as `supported`. Absent ⇒ **legacy limited** (observable data is processed and the limitation declared); incompatible in any admitted location or **mismatch** ⇒ `SCHEMA_UNSUPPORTED`. Unknown fields are ignored safely and **declared in diagnostics**, never elevating provenance.

**Stress modality (outside the normal matrix):** `node tests/stress_dsse.js` runs bounded rounds of concurrent DSSE keystore registrations with the full invariant each round and no silent retries (the first error is logged). CI runs it in a separate job (`VA_STRESS_ROUNDS=3`).


## 📥 Minimum useful input (what you can provide)

You don't need impossible telemetry. The `plan` flow works by levels:

| Level | What you provide | What it enables |
|---|---|---|
| 1. Text/scoreboard | Pasted scoreboard text or a JSON/export with K/D/A, ACS, ADR and HS% | Descriptive observations and, if a metric crosses its documented threshold, **one** mechanical action with its routine |
| 2. Round events | `player-round` / `player-round-damage` segments | Observed head/body/leg zones and spray/tap ratio. Openings/trade reads additionally require trade, position or timestamp marks |
| 3. Verified source | Riot RSO with attestation (credentials pending) | The only path that could enable attributable causes/leaks; not available yet |

If your input is not enough, `plan` doesn't fail generically: it states the **smallest concrete next datum** (e.g. "HS% from the scoreboard" or "round events with trade marks").


## ◈ Gemini Gems & Custom GPTs Support

If you use **Google Gemini (Gems)** or **OpenAI (Custom GPTs)**, [`standalone_prompt.md`](standalone_prompt.md) is fully optimized with:

- **System Instructions** structured with clean XML tags (`<system_role>`, `<vision_and_input_protocol>`, `<output_specification>`, etc.) ensuring mathematical rigor and anti-hallucination guardrails.
- **Multi-Format Ingestion Protocol:** Built for JSON/export you provide, pasted plain text, or existing files; screenshot OCR is NOT implemented.
- **Ready-to-Use Conversation Starters:** 4 pre-configured buttons for match diagnostics, duo synergy, KovaaK's aim routines, and the heuristic MMR signal.
- **Deterministic Visual Output:** Clean ASCII progress bars (`[████████░░]`), clean tables, and interactive follow-up coaching decision forks.

👉 **Read the full setup guide in [standalone_prompt.md](standalone_prompt.md)**.

---

## ◈ Privacy & Engineering Specifications

- **100% Local & Confidential:** all analysis runs on your machine; nothing leaves it. No network calls unless you later enable Riot RSO with your own credentials.
- **No network by default:** analysis is local. No browser cache harvesting and no Tracker.gg queries. Input is a JSON/export, text or screenshot you explicitly provide.
- **Zero NPM Dependencies:** Built strictly on native Node.js core libraries (`fs`, `path`, `zlib`, `crypto`, `child_process`). Zero external downloads.
- **Cross-Platform Compatibility:** Tested and verified on Windows 11 (PowerShell/CMD), macOS (zsh), and Linux (bash).
- **Deterministic Reliability:** 197 automated tests plus modular suites passing with Exit Code 0 (`node run_all_tests.js`) and a semantic fail-closed property audit, with no promotional score (`node opencode_tester.js`).
- **CLI Contract:** human and `--json` output; documented exit codes `0`/`1`/`2` (valid result / invalid input / insufficient evidence); no command silently picks a player.

---

## ◈ Scope & Limits (Data Honesty)

This project **describes** what local telemetry allows you to observe; it does not certify facts about Riot's internal matchmaking or about the player.

- **MMR / "MMR Drag":** the output is an **unverified heuristic hypothesis** derived from aggregates (matches, KD, ACS, DDΔ, HS, hours). The project does **not** access internal MMR or per-match RR gains/losses, so it cannot determine or prove algorithmic anchoring. Every such conclusion is tagged `hipotesis_no_verificada`.
- **Talent vs effort:** a **descriptive label** for impact/volume patterns, not a measurement of talent. Aggregates do not separate talent from effort and prove no causality.
- **Deserved rank:** the "rank estimate" is an **indicative bound** derived from heuristic thresholds, not a real rank.
- **Validation pending:** the engine has not yet been validated against real telemetry or a player sample. Until then, no output should be presented as a conclusive diagnosis.
- **`verified_source` (front #1):** the only authorized source for VALORANT is the **official Riot API (production key + Riot Sign-On)**; personal/developer keys have no access. The adapter (`scripts/riot_source.js`) requires a Riot token, an allowlisted host, a verifiable `matchId`, and an Ed25519 attestation **checked against the operator trust store** (`RIOT_ATTESTATION_TRUST`), which is **never accepted as an argument**; the signature comes from the **authorized ingestor's** private key (`RIOT_ATTESTATION_KEY`, 0600 outside the repo), never a caller key. A local signature attests **ingestor provenance**, not that Riot cryptographically emitted the content. Without approved credentials, `verified_source` is unreachable and everything stays `normalized_input`. Riot credentials: **pending request**.
- **ELO leaks (360° learning):** signals derived from the analyzed match's micro-events (fixture or data you provide), not a forensic audit of the account.

---

## ◈ License

Distributed under the [MIT License](LICENSE). Free and open source for personal, competitive, and pedagogical use.
