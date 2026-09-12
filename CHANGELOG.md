# Changelog — valorant-analytics

## 4.6.0 — Confiabilidad y trazabilidad

Contenido integrado en `main` mediante la **PR #10** (`fix: cierra procedencia, evidencia insuficiente, empaquetado y CI`), commit de rama `845794b`:

- **Procedencia sellada:** la metadata de un archivo (`attestation`, `provenance`, `verified`) no autoriza causas; solo el adaptador Riot sellado acuña `verified_source`.
- **Perfil sin defaults:** `learning_profile` deja en `null` los pilares sin métrica observada y solo prescribe con HS% observado.
- **Guardian fail-closed:** `INSUFFICIENT_DATA` sin consejo de cola ni salud cuando falta tilt medible o `continuousMinutes` explícito (CLI exit 2).
- **Drift fail-closed:** `NO_DATA` con estabilidad y entropía nulas en lugar de “100% estable” con `undefined` (CLI exit 2).
- **Parser robusto:** Unicode/BOM sin perder jugadores ni absorber numeración de fila; objetivo explícito obligatorio salvo roster de un jugador.
- **Paquete instalable:** biblioteca `scripts/index.js` sin efectos al importar, `bin`/`exports`/`files` declarados y prueba de instalación desde tarball.
- **CI completa:** `run_all_tests.js` ejecuta `test_suite.js` + todas las suites de `tests/`; 130/130 checks y 13/13 propiedades fail-closed.
- **Autoauditoría y docs:** `opencode_tester.js` verifica propiedades semánticas sin puntuación promocional; `SKILL.md` sin referencias a bypass de Cloudflare ni API de Tracker.

### Nota de trazabilidad

El merge **`a9838de`** en `main` corresponde al contenido de la **PR #10**, aunque su mensaje diga erróneamente *“Merge pull request #9 from Acourd/fix/trust-closure”*. La historia de `main` **no se reescribe**: la relación correcta es **PR #10 → `845794b` → `a9838de`**.
