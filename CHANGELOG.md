# Changelog — valorant-analytics

## 4.7.0 — Bloque de madurez interna (sin terceros)

- **Bloque A — Propiedades y fuzzing determinista:** nueva suite `tests/test_property_fuzz.js` (semilla fija, minimización por líneas al fallar) para parser Unicode/BOM, resolución de objetivo, sellado de procedencia y contratos entre módulos. Script `npm run test:properties`; CI la ejecuta con **3 semillas fijas**.
- **Bloque B — Coaching y analítica honestas:** recomendaciones solo con métrica observada + umbral + procedencia + limitación; los recursos no recomendados **no se renderizan**; `duo`/`economía`/`armas` sin defaults (`n/d`); sin promesas de tradeo/refrag/tiempos sin timestamps; Guardian/Drift declaran insuficiencia; milestones sin tramo Diamante inventado; allowance casual etiquetado como no medido.
- **Bloque C — Contrato CLI:** códigos de salida documentados (`0` resultado válido, `1` entrada/objetivo/comando inválido, `2` evidencia insuficiente en guardian/drift); `--json` en los comandos analíticos; procedencia uniforme; **ningún** comando selecciona jugador en silencio; ayuda actualizada (incluye `calibrate` como SIMULACIÓN).
- **Bloque D — Paquete y CI:** `check_syntax.js` para todos los `.js`; `npm pack --dry-run` verificado en tests (excluye `tests/`, suites y artefactos de desarrollo); runner con 3 semillas de fuzz; versión `4.7.0`.
- **Límite vigente:** sin telemetría Riot real ni validación con jugadores; `calibrate` sigue siendo una simulación offline.
- **Regresiones del veredicto sobre `37a59fb`:** `duo` exige ambos Riot IDs exactos (sin elección automática de compañeros) y la prescripción ya no emite reglas de timing/tradeo/posicionamiento sin timestamps/posición/trade observados; solo rutina mecánica vinculada a HS% y umbral (138/138 checks).

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
