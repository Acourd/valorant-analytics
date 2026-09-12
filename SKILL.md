---
name: valorant-analytics
description: Advanced Valorant competitive match telemetry, player performance profiling, heuristic MMR-signal analysis (unverified hypothesis, not internal MMR), tactical duel analysis, round economy breakdown, adaptive 15-minute Kovaaks aim routine generation, 360° autodiagnostic radar, and duo synergy auditing from user-provided JSON, scoreboard text or screenshots (no automated Tracker fetching).
---

# Valorant Analytics Skill (v2.0)

> Comprehensive competitive FPS telemetry extraction, match diagnosis, heuristic MMR-signal analysis (unverified hypothesis, never internal MMR), round economy conversion, mechanical profiling, 360° autodiagnostic radar, duo compatibility audit, and adaptive video/aim-routine coaching for Valorant.

> **Scope & limits:** outputs from the autodiagnostic engine are descriptive heuristics, not measurements of Riot's internal MMR, real talent or deserved rank. They are tagged `hipotesis_no_verificada` and are pending validation with real telemetry and a player sample.

---

## 🎯 When to Use This Skill

Activate this skill whenever the user asks to:
1. **Generate a 360° autodiagnostic learning profile** to detect personal ELO leaks and receive immediate training prescriptions.
2. **Audit duo or teammate synergy** (re-frag efficiency, carry load differential, role compatibility).
3. **Analyze a user-provided match JSON/export or pasted scoreboard text.**
4. **Evaluate a player profile from a JSON/export the user provides.**
5. **Compare duo/teammate performance, agent suitability, or role impact** (e.g. Iso vs. Clove vs. Reyna vs. Jett).
6. **Flag possible signs of internal MMR anchoring ("MMR Drag") from aggregate stats as an unverified heuristic** (never as a proven fact), alongside lobby matchmaking disparities.
7. **Break down round economy performance** (Pistol, Eco, Semi-Buy, Full Buy conversion rates).
8. **Generate adaptive 15-minute Kovaaks routines & provide visual YouTube/TikTok tutorials** tailored to the specific mechanical failures of the match.
9. **Deep weapon telemetry & distance-band efficiency** (Close 0-15m, Mid 15-30m, Long 30-50m, Head/Body/Leg distribution, and Spray vs. Tap SE/TP ratio).
10. **Zero-Cloud Instant Offline Coaching Mode** for private profiles, offline environments, or instantaneous skill benchmarking without external API calls.

---

## ⚡ Master Universal CLI (`cli.js`)

The recommended entry point for all operations is the master CLI dispatcher:

```powershell
# 1. 360° Autodiagnostic Radar & ELO Leaks:
node cli.js match <match_id_or_json> [player_handle]

# 2. Weapon Precision & Distance Band Telemetry:
node cli.js weapons <match_id_or_json> [player_handle]

# 3. Duo Synergy & Re-fragging Audit:
node cli.js duo <match_id_or_json> <player1> <player2>

# 4. Adaptive 15-Minute Kovaaks Routine:
node cli.js aim <match_id_or_json> [player_handle]

# 5. 1v1 Head-to-Head Duel Matrix:
node cli.js duels <match_id_or_json> [player_handle]

# 6. Multi-Platform Normalized Profile Mapping:
node cli.js profile "Handle#Tag"

# 7. SIMULACIÓN offline (no análisis real):
node cli.js calibrate [player_handle] [target_rank] [role]


# 8. Auditoría de Carrera y Horas Exactas en Partida:
node cli.js career <profile.json>

# 9. Heuristic MMR Signal & Impact-vs-Volume Pattern (UNVERIFIED, not internal MMR):
node cli.js diagnose <profile.json>
```

> **Contrato CLI:** códigos de salida documentados (`0` = resultado descriptivo válido, incluye `n/d`/`omitido`; `1` = entrada, objetivo o comando inválido; `2` = evidencia insuficiente en `guardian`/`drift`). Añade `--json` para salida estructurada en los comandos analíticos. Ningún comando selecciona un jugador en silencio: sin objetivo explícito solo se auto-resuelve un roster de un jugador.

---

## 🛠️ Telemetry Extraction & Coaching Scripts

This skill includes standalone Node.js automation scripts located in `.agents/skills/valorant-analytics/scripts/`:

### 1. 360° Autodiagnosis & Pedagogical Learning Radar
```powershell
node .agents/skills/valorant-analytics/scripts/learning_profile.js <match_id_or_json_file> [target_player_handle]
```
* Generates a 5-pillar skill radar (Precision, Macro, Opening Duels, Economy, Clutch).
* Pinpoints the 3 root-cause **ELO Leaks** of the match and prescribes an immediate 15-minute training rule.

### 2. Weapon & Distance-Band Telemetry Engine
```powershell
node .agents/skills/valorant-analytics/scripts/weapon_telemetry.js <match_id_or_json_file> [target_player_handle]
```
* Reconstructs damage zones (Head/Body/Leg %), categorizes engagements into distance tiers (Close 0-15m, Mid 15-30m, Long 30-50m), computes Spray vs. Tap SE/TP efficiency ratio, and outputs biomechanical Kovaaks adjustments.

### 3. Duo Compatibility & Team Synergy Auditor
```powershell
node .agents/skills/valorant-analytics/scripts/duo_synergy.js <match_id_or_json_file> <player1_handle> <player2_handle>
```
* Audits premade synergies, trade rates, and carry load differentials between two players.

### 4. Provided Match JSON/Scoreboard Parsing (offline, no network)
```powershell
node cli.js parse <archivo_o_texto> [jugador]
```
* Normaliza JSON/export o volcados de texto aportados por el usuario en telemetría `normalized_input`. **No hay descarga automática**: `fetch_match.js` y `fetch_profile.js` son analizadores/stubs fail-closed que nunca consultan red.

### 5. Player Profile Normalization (offline, no network)
```powershell
node cli.js profile "Nombre#TAG"
```
* Normaliza el Riot ID y muestra **enlaces informativos** a OP.GG/VLR/Tracker; no se consulta ninguna plataforma.

### 6. Head-to-Head Duel Matrix (1v1 Matchup Breakdown)
```powershell
node .agents/skills/valorant-analytics/scripts/duel_matrix.js <match_id_or_json_file> [target_player_handle]
```
* Analyzes individual 1v1 encounters between a focus player and every enemy agent.

### 7. Round Economy & Loadout Performance
```powershell
node .agents/skills/valorant-analytics/scripts/economy_analyzer.js <match_id_or_json_file> [target_player_handle]
```
* Classifies rounds into Pistol, Eco, Semi/Force-Buy, and Full-Buy tiers, measuring K/D, ADR, and win conversion rates.

### 8. Adaptive 15-Minute Kovaaks Aim Routine Generator
```powershell
node .agents/skills/valorant-analytics/scripts/kovaaks_generator.js <match_id_or_json_file> [target_player_handle]
```
* Generates tailored 15-minute Voltaic/Kovaaks playlists based on match headshot accuracy, map verticality, and sensitivity profile.

### 9. Introspective Coaching & Visual Learning Engine
```powershell
node .agents/skills/valorant-analytics/scripts/coaching_engine.js <match_id_or_json_file> [target_player_handle]
```
* Analyzes high-friction duels and rounds and links curated learning searches (Woohoojin, Zonda FPS, Valorant Domingo); los enlaces son informativos, no validación de las hipótesis.

---

## 📊 Core Metrics Framework

| Metric | Benchmark (Average) | Elite / Diamond+ Level | Interpretation |
| :--- | :---: | :---: | :--- |
| **ADR (Average Damage / Round)** | 130 – 150 | **180 – 250+** | True combat impact independent of kill-stealing or assists. |
| **ACS (Average Combat Score)** | 190 – 220 | **280 – 400+** | Overall round engagement, multi-kills, and first blood value. |
| **HS % (Headshot Accuracy)** | 18% – 24% | **35% – 50%+** | First-bullet mechanical precision and crosshair placement. |
| **FK / FD (First Kills vs Deaths)** | 1.0 Ratio | **2.0+ Ratio (e.g. 4/1)** | Opening duel success rate; defines effective entry fragging. |
| **KAST %** | 65% – 70% | **78% – 88%+** | Percentage of rounds with Kill, Assist, Survived, or Traded. |
| **Damage Delta / Round** | 0 to +15 | **+40 to +90+** | Net damage output vs damage received per round. |

---

## 🌐 Portability & Cross-Platform Installation

* **Zero-npm Runtime:** Relies purely on Node.js standard libraries and native OS `curl`.
* **Cross-OS Compatibility:** Windows 10/11 (PowerShell/CMD), macOS (zsh), and Linux (bash).
* **Multi-User / Any Player:** Works for any Riot ID, player tag, party, match ID, or region.
