# Changelog — valorant-analytics

## 4.8.1 — Procedencia honesta en `plan` (regresión del modo demo)

- **Corregido (HIGH):** `plan --demo` etiquetaba las métricas como `normalized_input` y generaba acción/rutina correctiva con datos inventados.
- **Política de demo (documentada):** en `synthetic_demo` el plan es **SIMULACIÓN explícita**: `estado: "SIMULACION_DEMO"`, `es_simulacion: true`, advertencia, **sin acción, sin rutina y sin medición**; las observaciones se rotulan `SINTÉTICA --demo (NO observada)` y `tipo: "sintetica"`.
- La etiqueta de cada observación ahora **deriva de la procedencia real** (normalized/verified/synthetic); ninguna ruta fija `normalized_input`.
- Regresión `tests #165` + propiedad `plan demo:*` (165/165 checks). Versión 4.8.1.

## 4.8.0 — Flujo guiado para el jugador (`plan`) y modo avanzado

- **`plan <entrada> "Nombre#TAG"`** (nuevo comando principal): un único camino `aportar datos → entender límites → UNA acción priorizada → UNA rutina → qué aportar después`. Máximo 3 observaciones con métrica presente; acción solo si una métrica observada cruza un umbral documentado (métrica, umbral, procedencia y limitación explícitos); sin evidencia suficiente devuelve **plan de recolección** con límites y dato requerido (exit 2). Sin puntajes decorativos ni causas/fugas.
- **`--advanced`:** la ayuda por defecto prioriza `plan`, `parse`, `match` y `aim`; `--advanced --help` expone DSSE, Merkle, MPC, Wasm, invariantes y diagnóstico especializado, con la advertencia de que son herramientas de integridad/criptografía y **no** coaching para jugadores.
- Contrato `--json` y códigos `0/1/2` sin cambios; ningún comando selecciona archivo, jugador o fixture en silencio (`plan` exige entrada explícita).
- Regresiones: `tests #159`–`#164` + propiedad de plan determinista (164/164 checks). Versión 4.8.0.

## 4.7.3 — Bloque final de madurez técnica

- **Wasm con cuota REAL:** el módulo del sandbox importa la memoria del host (`env.memory`), por lo que `maximum` es aplicado por el runtime (verificado con sonda de crecimiento); configuración validada (entero 1–64, máximo ≥ inicial) y auditoría que solo declara límites impuestos (`quotaEnforced`, `maxPagesEnforced`, `moduleImportsHostMemory`). Sin afirmaciones de cuota decorativa.
- **CLI con parser determinista:** flags `--json`/`--demo`/`--trust-new-key` independientes del orden, nunca interpretados como archivo o jugador; flag desconocido → error controlado; un archivo existente sin extensión se admite sin sondear match IDs ni URLs; entradas inexistentes fallan cerradas.
- **Contrato uniforme de errores JSON:** con `--json`, `stdout` contiene **exactamente un JSON parseable** (incluso en error) y los avisos humanos van a `stderr`; errores con forma estable `{ ok:false, exitCode, error:{ code, message, details } }`; códigos `0/1/2` preservados.
- Regresiones: `tests #153`–`#158` + propiedades de permutación de flags (158/158 checks). Versión 4.7.3.

## 4.7.2 — Correcciones del veredicto 84

- **HIGH — umbral MPC:** `verifyThreshold` exige entero `1 ≤ threshold ≤ keyholders confiables`; sobres vacíos o sin firmas se rechazan (`INVALID_THRESHOLD_FAIL_CLOSED` / `MALFORMED_ENVELOPE_FAIL_CLOSED`). El umbral 0 ya no admite nada.
- **HIGH — objetivo verificado:** `observeVerifiedMatch` exige el `puuid` exacto; ausente → `TARGET_NOT_FOUND` (con candidatos), vacío → `TARGET_REQUIRED`, duplicado → `TARGET_AMBIGUOUS`. Nunca analiza al primer jugador.
- **HIGH — launcher raíz:** `cli.js` ejecuta la CLI documentada (`node cli.js --help`) y reexporta la API como módulo.
- **MED — interoperabilidad DSSE↔MPC:** PAE byte-correcta compartida en `dsse_pae.js`; el firmante MPC codifica PAE sobre el payload crudo, verificable por el verificador DSSE (vector de interop en tests).
- **MED — Merkle determinista:** sin timestamp se usa la centinela documentada `UNSPECIFIED_TIMESTAMP`; la misma entrada produce la misma raíz.
- **MED — `runCli` programática:** retorna `{ exitCode, result }` y **nunca** llama `process.exit`; el wrapper ejecutable decide el código de salida.
- Regresiones añadidas: `tests #147`–`#152` (152/152 checks). Versión 4.7.2.

## 4.7.1 — Correcciones del veredicto 88

- **HIGH — duo sin equipos observados:** no se asume mismo equipo por `undefined === undefined`; sin `teamId` en ambos → `INSUFFICIENT_DATA`, score nulo, sin consejo ni `carryAnalysis`.
- **HIGH — `--json` en modo demo:** el aviso de demo se emite por `stderr`; `stdout` queda reservado a JSON válido.
- **MED — demo sin objetivo:** error de entrada controlado (`TARGET_REQUIRED`) en lugar de `TypeError` interno.
- **MED — career:** la asignación teórica de 25 h se expone aparte (`general.estimatedSeconds`) y **nunca** se suma a los totales observados.
- **MED — autodiagnóstico:** `zeroFpsBackground` es `null` (no observado) salvo aporte explícito del usuario.
- **MED — Riot:** se rechazan atestaciones con `fetchedAt` futuro más allá de la tolerancia de reloj documentada (5 min).
- **LOW — CI:** `actions/checkout` y `actions/setup-node` fijadas por commit SHA.
- Regresiones añadidas: `tests #140`–`#146` (146/146 checks).

## 4.7.0 — Bloque de madurez interna (sin terceros)

- **Bloque A — Propiedades y fuzzing determinista:** nueva suite `tests/test_property_fuzz.js` (semilla fija, minimización por líneas al fallar) para parser Unicode/BOM, resolución de objetivo, sellado de procedencia y contratos entre módulos. Script `npm run test:properties`; CI la ejecuta con **3 semillas fijas**.
- **Bloque B — Coaching y analítica honestas:** recomendaciones solo con métrica observada + umbral + procedencia + limitación; los recursos no recomendados **no se renderizan**; `duo`/`economía`/`armas` sin defaults (`n/d`); sin promesas de tradeo/refrag/tiempos sin timestamps; Guardian/Drift declaran insuficiencia; milestones sin tramo Diamante inventado; allowance casual etiquetado como no medido.
- **Bloque C — Contrato CLI:** códigos de salida documentados (`0` resultado válido, `1` entrada/objetivo/comando inválido, `2` evidencia insuficiente en guardian/drift); `--json` en los comandos analíticos; procedencia uniforme; **ningún** comando selecciona jugador en silencio; ayuda actualizada (incluye `calibrate` como SIMULACIÓN).
- **Bloque D — Paquete y CI:** `check_syntax.js` para todos los `.js`; `npm pack --dry-run` verificado en tests (excluye `tests/`, suites y artefactos de desarrollo); runner con 3 semillas de fuzz; versión `4.7.0`.
- **Límite vigente:** sin telemetría Riot real ni validación con jugadores; `calibrate` sigue siendo una simulación offline.
- **Regresiones del veredicto sobre `37a59fb`:** `duo` exige ambos Riot IDs exactos (sin elección automática de compañeros) y la prescripción ya no emite reglas de timing/tradeo/posicionamiento sin timestamps/posición/trade observados; solo rutina mecánica vinculada a HS% y umbral (138/138 checks).
- **Regresión del veredicto sobre `7c83619`:** el umbral HS% ahora **condiciona** la rutina: correctiva solo con HS% < 25; con HS% ≥ 25 se declara “sin debilidad mecánica cubierta” y no se recomienda entrenamiento remedial (pruebas de frontera 24.9/25.0/35+; 139/139 checks).

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
