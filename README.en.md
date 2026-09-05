# Valorant Analytics

[![Version](https://img.shields.io/badge/version-4.0-black.svg?style=flat-square)](https://github.com/Acourd/valorant-analytics)
[![Runtime](https://img.shields.io/badge/runtime-Node.js_native-black.svg?style=flat-square)](https://nodejs.org/)
[![Dependencies](https://img.shields.io/badge/dependencies-0_npm-black.svg?style=flat-square)](package.json)
[![License](https://img.shields.io/badge/license-MIT-black.svg?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-46%2F46_passed-black.svg?style=flat-square)](test_suite.js)

Tactical performance analysis and match diagnostics for competitive Valorant players. Built to pinpoint round leaks, correct mechanical habits, and track genuine progression beyond surface-level statistics.

Also available in: [Español (README.es.md)](README.es.md) | [Technical Docs (SKILL.md)](SKILL.md)

---

## The Problem with Traditional Trackers

Most stat platforms display disconnected numbers: kills, deaths, headshot percentages, and win rates. While these describe the outcome, they leave the underlying causes unexplained.

- They do not clarify whether your frags impacted round outcomes or occurred after the spike site was already lost.
- They do not identify whether lost duels stem from spray over-commitment or crosshair placement errors.
- They fail to distinguish between a temporary slump and an account whose internal match rating (MMR) has stalled from high match counts.

Valorant Analytics evaluates round-by-round events to provide straightforward insights and practical drills you can apply in your next match.

---

## What the Tool Delivers

### 360° Match Diagnostics
A concise breakdown across five core dimensions: initial accuracy, map control, opening duels, team economy, and composure under disadvantage. Pinpoints the exact three rounds where key advantages slipped away.

### Tailored 15-Minute Aim Routines
Rather than generic drills, the engine designs a targeted training routine for KovaaK's, Aim Lab, or The Range based on flaws detected in your latest session. Long-range duel misses trigger static micro-adjustment drills; excessive spraying triggers tap-and-strafe scenarios.

### Duo Synergy and Trade Auditing
For premade pairs, the system measures re-frag trade windows, damage distribution, and role balance to ensure agent selections actively complement each other.

### Career Playtime and True Rank Assessment
Separates verified in-match competitive hours from casual modes and filters out artificial account-level inflation. Evaluates actual lobby difficulty to reflect your deserved rank and detect hidden MMR drag.

### Browser Cache Ingestion
Reads match payloads directly from your local browser cache (Chrome, Brave, Edge, Opera, or Vivaldi). This eliminates network rate limits and Cloudflare Turnstile blocks encountered on third-party sites.

---

## Three Ways to Get Started

Select the mode that best fits your workflow:

| Mode | Target User | Prerequisites | Workflow |
| :--- | :--- | :---: | :--- |
| **Text Mode (No Console)** | Players wanting quick feedback | None | Copy `standalone_prompt.md` and paste it with your match data into any web assistant. |
| **Command Line (Local)** | Players preferring local execution | Node.js installed | Clone the repository and run `node cli.js match <file> "<Player#Tag>"`. |
| **AI Assistant / Agent** | Developers and advanced users | Supported environment | Mount the folder into Claude Code, Google Antigravity, or OpenCode via `SKILL.md`. |

---

## Sample Diagnostic Report

A typical report generated from competitive match telemetry:

```text
========================================================================
VALORANT ANALYTICS — PERFORMANCE REPORT
Match: Lotus | Player: Iso | Lobby Tier: Platinum 2 / Diamond 1
========================================================================

OVERALL RATING: 88 / 100
  • First-Bullet Precision:      86 / 100  (28.5% headshot rate)
  • Round Contribution (KAST):   82 / 100  (74.0% round participation)
  • Opening Duel Winrate:        89 / 100  (54.0% first blood conversion)
  • Economic Efficiency:         90 / 100  (Optimal full-buy round returns)
  • Disadvantage Composure:      80 / 100  (1 conversion out of 3 in 1v2s)

TOP ROUND LEAKS IDENTIFIED:
  1. Over-peeking on post-plant (Rounds 7 and 14):
     Chasing unneeded frags with a 5v3 man advantage after spike plant.
     Fix: Hold crossfires and force attackers to spend round clock.

  2. Extended spraying beyond 30 meters:
     Over-committing to spray patterns against distant cover.
     Fix: Transition to 2-bullet burst firing paired with short counter-strafes.

RECOMMENDED AIM ROUTINE (15 MINUTES):
  • Microshot / Click-timing: 5 min (first-bullet precision calibration).
  • Dynamic Horizontal Click: 5 min (angle checking and corner clearing).
  • Smooth Tracking:          5 min (tracking accelerated movement).
========================================================================
```

---

## Essential CLI Commands

For terminal users, the unified dispatcher bundles all key operations:

```bash
# Full match diagnostics and round leak detection
node cli.js match examples/sample_match.json "PlayerName#TAG"

# Generate tailored 15-minute aim routine
node cli.js aim examples/sample_match.json "PlayerName#TAG"

# Weapon telemetry and distance band breakdown
node cli.js weapons examples/sample_match.json "PlayerName#TAG"

# Audit coordination with your premade duo
node cli.js duo examples/sample_match.json "Player1#TAG" "Player2#TAG"

# Extract match data from local browser cache
node cli.js harvest

# Audit career hours and true in-match playtime
node cli.js career

# Assess true deserved rank and MMR drag
node cli.js diagnose
```

---

## Privacy and Lightweight Architecture

- **Strictly Local Processing:** Match records and career histories are computed directly on your system. No personal data leaves your machine.
- **Zero External Dependencies:** Built entirely with Node.js built-in standard modules. No heavy third-party npm packages to install.
- **Cross-Platform:** Verified across Windows 11, macOS, and standard Linux distributions.

---

## License

Released under the MIT License. See `LICENSE` for complete details.
