# Changelog — valorant-analytics

## 4.13.0 — UX del comando plan para jugadores

- **Vista jugador compacta (`--profile player`, por defecto):** orden fijo 1) RESUMEN DE ESTA PARTIDA (resultado/mapa/modo, agente, hasta 4 métricas observadas), 2) RESULTADO DE ESTA MEDICIÓN con una de cuatro etiquetas —`ACCIÓN DISPONIBLE`, `SIN ACCIÓN CORRECTIVA`, `DATOS INSUFICIENTES PARA UNA ACCIÓN`, `SIMULACIÓN DEMO`—, 3) SIGUIENTE PASO (una sola recomendación) y una línea de alcance. `RECOLECCION_REQUERIDA` deja de ser titular cuando la partida sí tiene observaciones útiles.
- **Siguiente paso honesto por formato:** con `tracker_text_export` se explica que el archivo no contiene eventos por ronda (ni posiciones, trades o timestamps) y se ofrecen alternativas realistas (3–5 partidas del mismo tipo; export con eventos si algún día se dispone de él), en vez de ordenar un dato que el formato no puede aportar.
- **Detalles bajo demanda:** límites, procedencia, faltantes, digest y `planId` siguen en `--verbose`, `--profile coach` y `--profile analyst`; la vista jugador no muestra IDs técnicos ni comandos de seguimiento automáticos.
- **Persistencia explícita:** una acción válida se registra; `SIN_ACCION_CORRECTIVA` y `DATOS_INSUFICIENTES` solo con `--track`; el demo nunca persiste ni habilita seguimiento. Nuevos flags `--verbose` y `--track` (independientes del orden).
- **Tipografía:** verificado que no existe `RUINA ASOCIADA` en código ni salidas (la sección es `RUTINA ASOCIADA`); regresión nueva lo protege. `--json` conserva el contrato y añade el bloque `presentation`.
- Regresiones `#212`–`#220`: 220/220 checks. Versión 4.13.0.
## 4.12.0 — Importador local de texto de Tracker (manual, sin scraping)

- **Nuevo (`scripts/tracker_text_ingestor.js`):** detecta y parsea un archivo `.txt` guardado manualmente desde una página de partida de Tracker ("Save page as text"): bloque `Scoreboard`, cabeceras `Match Rank/TRS/ACS/K/D/A/+/-/K/D/DDΔ/ADR/HS%/KAST/FK/FD/MK`, equipos, metadatos (modo, mapa, marcador, resultado, fecha, duración, rango medio) y filas con nombres con espacios/Unicode. Ignora navegación, enlaces, perfiles y pie. Los campos ausentes permanecen `null` y se declaran; no se inventan rondas, posiciones, economía, trades, duelos ni eventos.
- **Detección explícita y fallo cerrado:** solo se activa con marcadores Tracker + `Scoreboard` + cluster de cabeceras; si el bloque está incompleto o cambió el formato ⇒ `TRACKER_TEXT_FORMAT_UNSUPPORTED` (jamás cae en silencio al parser genérico). Sin red, caché, cookies, scraping ni OCR; procedencia `normalized_input` con digest SHA-256 local.
- **CLI:** `parse`, `plan` y `match` aceptan el `.txt` y exponen `sourceFormat: tracker_text_export`, digest, campos extraídos/ausentes y límites declarados (no es fuente verificada, no atribuye causas, no mide MMR/talento/rango merecido ni demuestra mejora).
- **Fixtures y pruebas:** `examples/tracker_text_{victory,defeat,partial,truncated}.txt` (anonimizados, handles inventados) + 11 checks (`#201`–`#211`). 211/211 checks. Versión 4.12.0.
- **Fechas sin precisión fabricada:** `dateText` conserva siempre el texto original; `timestamp` (ISO) solo se genera cuando el formato es inequívoco (ISO, mes textual o numérico con un campo >12 que desambigua D/M vs M/D). Una fecha numérica ambigua (`6/9/26`) deja `timestamp: null`, `dateAmbiguity: 'fecha_ambigua_por_locale'` y lo declara en faltantes y límites.
- **Fail-closed de duplicados:** `learning_profile` conserva la lista de handles CON duplicados, de modo que un Riot ID repetido en la entrada devuelve `TARGET_AMBIGUOUS` en vez de colapsarse silenciosamente a un único jugador.

### Nota de trazabilidad

El merge **`b97e50e`** en `main` corresponde al contenido de la **PR #23**, aunque su mensaje diga erróneamente *“Merge pull request #22 from Acourd/feat/tracker-text-import”*. La historia de `main` **no se reescribe**: la relación correcta es **PR #23 → `8b20062` → `b97e50e`**. Lección operativa: el título del merge se deriva del API de la PR (sin número fijo en el script) para que `#N` coincida siempre.

## 4.11.4 — Detección de sustitución determinista (sin reejecución de la suite)

- **Corregido (confiabilidad del test #195):** la prueba mezclaba seguridad con comportamiento del filesystem (monkeypatch de `fs.openSync` esperando que `dev/ino` cambiaran); en NTFS el file-id puede reutilizarse al recrear un archivo y el check fallaba aunque no hubiera regresión. `scripts/safe_fs.js` expone ahora el predicado **puro** `substitutionDetected(expectedStat, openedStat)`: identidad `dev/ino` primero y, como señal ADICIONAL, tamaño/mtime/birthtime (la identidad igual no es concluyente: en NTFS puede reutilizarse el file-id); estadísticas inválidas ⇒ fail-closed. Windows sigue documentado como best-effort (identidad y metadatos iguales no son distinguibles).
- **Tests deterministas:** predicado puro (`IDENTITY_CHANGED`/`METADATA_CHANGED`/`INVALID_STAT`) e integración con **estadísticas inyectadas** (sin depender de reutilización real de file-ids); la sustitución real con swap se ejecuta solo donde el filesystem ofrece identidad estable. `tests #199`–`#200`: 200/200 checks.
- **P13 sin reejecución:** `opencode_tester.js` ya no vuelve a ejecutar `test_suite.js` (duplicaba la suite entera, sumaba contención de temporales y era la superficie del flake en Windows). Ahora verifica que el runner único (`run_all_tests.js`) la incluye y que no existe invocación anidada; el runner ya la ejecuta una sola vez en CI.
- Versión 4.11.4.
## 4.11.3 — Padres intermedios no controlables

- **Corregido (perímetro dependiente de ancestro):** una ruta como `/tmp/padre-compartido-0777/plans` era admisible si `plans` acababa en 0700, pero un ancestro escribible podía renombrar/sustituir el directorio final. Ahora **cada padre intermedio** debe ser directorio, no symlink, no escribible por grupo/otros y no pertenecer a otro usuario (se tolera root como propietario de directorios de sistema). Excepción mínima sin extensión a hijos: solo los **hijos directos de la raíz** (`/tmp`, `/var`, `/private`…) quedan exentos. La cadena completa se **revalida antes de crear el temporal y antes del `rename`**.
- Regresión `tests #198` (padre/abuelo 0777 y 0770 sin creación ni escritura) 198/198 checks. Versión 4.11.3.

## 4.11.2 — Perímetro completo (sin evasión por symlinks ancestros)

- **Corregido (evasión del perímetro):** la validación solo miraba el directorio final, así que `/tmp/enlace-simbolico/plans` podía crear `plans` dentro del destino real del enlace. Ahora `safe_fs.ensurePrivateDir` recorre **todos los componentes desde la raíz** y rechaza cualquier symlink/junction en cualquier nivel (final, padre o abuelo). La creación es **escalonada** (nunca `recursive: true` a través de padres no validados) y la política de permisos/propietario se aplica solo al directorio final. La misma validación corre antes de listar, leer, actualizar y escribir.
- Regresión `tests #197` (symlink final/padre/abuelo + ruta privada anidada normal) 197/197 checks. Versión 4.11.2.

## 4.11.1 — Perímetro local y identidad completa del historial de planes

- **HIGH — perímetro del almacenamiento:** el directorio de planes existente ahora se valida en cada operación (`scripts/safe_fs.js`, extracto de la política ya probada del keystore): rechaza symlink, no-directorio, propietario ajeno (POSIX) y escritura de grupo/otros (0770/0777 no admisibles). Las lecturas abren por **descriptor con `O_NOFOLLOW`** y comparan `dev/ino` contra la inspección previa: sustitución ⇒ `PLAN_UNSAFE_PATH` (fail-closed). En Windows (sin `O_NOFOLLOW`) la detección se apoya en el file-id de NTFS, documentado como best-effort. La escritura re-verifica el directorio y nunca sobrescribe un enlace.
- **HIGH — identidad determinista completa:** `planId` se deriva ahora de **todo** el núcleo semántico persistido (jugador, `sourceRef`, procedencia, métrica, valor, umbral, limitación, acción completa, rutina completa y siguiente dato), excluyendo solo timestamps y bitácora. Un registro existente con núcleo distinto ⇒ `PLAN_CONFLICT` explícito (nunca devolver silenciosamente el anterior); idempotencia solo con núcleo idéntico.
- Regresiones `tests #195`–`#196` (196/196 checks). Versión 4.11.1.

## 4.11.0 — Automatización del ciclo de planes para el jugador

- **Historial local versionado** (`scripts/plan_store.js`): `plan <entrada> "<Nombre#TAG>"` persiste un registro con jugador exacto, `sourceRef` (identidad + digest), procedencia, fecha, métrica/valor/umbral/limitación, acción, rutina, siguiente dato y estado `PENDIENTE`; `planId` determinista. Directorio `VALORANT_PLANS_DIR` (por defecto `<cache>/plans`), permisos 0600, escritura atómica, symlinks rechazados, sin credenciales ni terceros; demo `synthetic_demo` no se persiste.
- **Subcomandos:** `plan list`, `show <id>`, `intent <id> [nota ≤200]`, `close|cancel <id>`, `compare <id> <entrada> ["handle"]`, `export [--pseudonymized]`. Sin selección silenciosa: id requerido, prefijos ambiguos listan candidatos.
- **Comparación honesta** (`scripts/plan_flow.js`): mismo jugador exacto, métrica observada y procedencia compatible; estados `MEDICION_COMPARABLE` / `DATOS_INSUFICIENTES` / `NO_COMPARABLE` / `SIMULACION_DEMO`; delta descriptivo + limitación explícita, sin “mejoraste”, MMR, talento ni causalidad.
- **Perfiles de salida:** `--profile player|coach|analyst` (misma evidencia, distinta presentación; analyst emite JSON estructurado).
- **Presupuestos:** `maxPlans` 500 y `maxNoteChars` 200 (reducibles, política de solo-reducción). Corruptos/oversized/versión futura/symlink fallan cerrado sin destruir registros válidos.
- Regresiones `tests #185`–`#194` (194/194 checks). Versión 4.11.0.

## 4.10.2 — Contrato inequívoco de `schemaVersion` Riot

- **Corregido (residual):** un payload con `payload.schemaVersion` **solo en la raíz** y sin `matchInfo.schemaVersion` se aceptaba como `supported`. La ubicación canónica es `matchInfo.schemaVersion`: la versión de raíz **solo** se admite si coincide con la canónica, y si la canónica falta se rechaza con `SCHEMA_UNSUPPORTED` (fail-closed). Ausencia total ⇒ `legacy_limited`.
- Regresión `tests #184` (root=1, matchInfo ausente) + matriz adversarial ampliada; README×3 y ayuda CLI reflejan la regla final.
- Versión 4.10.2 (184/184 checks).

## 4.10.1 — Correcciones del veredicto sobre la PR #18

- **Presupuestos no anulables:** `VA_BUDGET_*` (y overrides programáticos) **solo pueden REDUCIR** límites. Valores no finitos, no enteros, ≤0, texto o por encima del máximo seguro compilado fallan cerrado con `RESOURCE_BUDGET_EXCEEDED`; cadena vacía = variable ausente. No existe escape de entorno para ampliar límites.
- **`schemaVersion` Riot canónico:** ubicación canónica `matchInfo.schemaVersion`; la raíz `payload.schemaVersion` solo se acepta si coincide. Incompatible en cualquier ubicación o discrepancia ⇒ `SCHEMA_UNSUPPORTED` (fail-closed); ausencia ⇒ `legacy_limited` sin elevar procedencia. Normalizado: `data.metadata.schemaVersion`.
- **Tiempo cooperativo con alcance preciso:** checkpoints periódicos (`TimeBudget.sample`) en parseo de scoreboard, generación demo, observación de segmentos, adaptador VAL-MATCH-V1 y mapeo del plan; `checkpoint` usa `>=`. Documentado que el runtime JS no puede preemptar código síncrono: no es un corte total garantizado de 30 s.
- Regresiones `tests #181`–`#183` + 2 propiedades adversariales (183/183 checks). Versión 4.10.1.

## 4.10.0 — Robustez interna final (presupuestos, esquemas, estrés)

- **Presupuestos de recursos** (`scripts/resource_budget.js`), configurables con `VA_BUDGET_*`: archivo 5 MiB · texto 200 000 chars · profundidad JSON 64 · jugadores 64 · rondas 200 · eventos 100 000 · elementos/arreglo 20 000 · tiempo 30 s · workers 16. Al excederse: fail-closed con `INPUT_TOO_LARGE`, `SCHEMA_LIMIT_EXCEEDED` o `RESOURCE_BUDGET_EXCEEDED`, sin análisis parcial y con JSON puro bajo `--json`.
- **Esquemas versionados** (`scripts/schema_contract.js`): `schemaVersion: 1`; ausente ⇒ `legacy_limited` (procesa lo observable y lo declara); incompatible ⇒ `SCHEMA_UNSUPPORTED`; campos desconocidos se ignoran y se declaran en `plan.schema` (`unknownMetadataFields`/`unknownFields`) sin elevar procedencia.
- **Propiedades adversariales** (`tests/test_property_adversarial.js`, semilla fija): JSON profundo, arreglos gigantes, texto excesivo, truncados, tipos inesperados, prototipos extraños, claves duplicadas, BOM/Unicode, estabilidad de códigos y versiones de esquema.
- **Concurrencia acotada**: el estrés interno baja a 16 workers (presupuesto), conserva el primer error en logs y exige el invariante completo (16/16 claves, `generation ≥ 16`). Nueva modalidad `tests/stress_dsse.js` (sin reintentos) y **job CI separado** (`stress`, ubuntu/Node 20, `VA_STRESS_ROUNDS=3`); la matriz normal omite `stress_*` salvo `VA_RUN_STRESS=1`.
- Regresiones `tests #174`–`#180` (180/180 checks) + 7 propiedades adversariales. Versión 4.10.0.

## 4.9.0 — Confianza, telemetría y producto honesto

- **A1 Demo sellado:** `parseTextScoreboard(..., {demo:true})` y `assembleRawMatchStructure` marcan `synthetic: true` internamente (aunque se llamen directos). Los datos sintéticos no habilitan acción, rutina, medición, causa, fuga, rango ni MMR; `learning_profile` no prescribe, `routine_contract` omite rutinas y `duo` responde `SIMULACION_DEMO`. Ninguna etiqueta llama "observada"/`normalized_input` a una métrica sintética.
- **A2 Objetivo exacto sin fallbacks:** eliminado `allowFirstIfMissing`; ausente/vacío → `TARGET_REQUIRED`, inexistente → `TARGET_NOT_FOUND`, duplicado → `TARGET_AMBIGUOUS`. `observeMatchTelemetry` tampoco cae al primer jugador.
- **A3 Referencias locales:** `sourceRef` = identidad declarada + hash canónico del contenido (`match:<id>#sha256:<hash>`); dos contenidos con el mismo `matchId` no comparten ref y el orden de claves no altera el hash.
- **B4 VAL-MATCH-V1:** el adaptador verificado procesa listas de `damage`/`kills`/`playerStats` sumando solo campos presentes; lo ausente queda `undefined` (n/d). Nuevo fixture anonimizado `examples/riot_match_rounds_anonymized.json` (sin secretos; atestación efímera en test).
- **B5 Dominios estrictos:** HS/KAST fuera de 0–100, ACS/ADR negativos o fuera de rango, conteos negativos/no enteros, NaN e Infinity se descartan (`null`); un dato inválido no habilita radar, plan, acción, rutina, economía, dúo, consenso ni coaching.
- **B6 Economía:** ADR/ACS se leen correctamente desde `{ value }` y `{ displayValue }`; valores inválidos → `null` (sin ceros ni fallbacks).
- **C7 Promesas retiradas/reformuladas:** fuera "3 bandas de distancia", "ventanas de re-frag/tradeo (<2s)", "OCR de capturas" y distancia inferida en README×3, SKILL y prompt; se declara explícitamente que la distancia es n/d sin posiciones y que el OCR no está implementado.
- **C8 Entrada mínima:** nueva sección en los tres READMEs + SKILL y campo `entrada_minima` en `plan` (texto/marcador; eventos por ronda; fuente verificada). Si la entrada no alcanza, el plan indica el siguiente dato concreto.
- Regresiones `tests #167`–`#173` + propiedades de dominio (173/173 checks). Versión 4.9.0.

## 4.8.2 — FK/FD agregado no habilita tradeo/aperturas sin contexto temporal

- **Corregido (HIGH):** `plan` generaba acción/rutina de apertura ("no entrar solo", "confirmar el tradeo") a partir de FK/FD agregado, sin rondas, timestamps, posiciones ni marcas de trade — contradiciendo su propio límite.
- **Regla raíz en `routine_contract`:** `ANGLE_ISOLATION` exige **contexto temporal observado** (`trade`/`posición`/`timestamp`); sin él queda bloqueada (`areasBlockedByTemporal`) y los datos requeridos incluyen los eventos con contexto. Se conserva la ruta positiva cuando el contexto existe.
- **`data_contract.detectTemporalContext`** es ahora la única implementación (la usan `plan`, `kovaaks_generator`, `routine_synthesizer` vía CLI y `learning_profile`).
- Sin contexto: `plan` devuelve `RECOLECCION_REQUERIDA`, sin acción ni rutina, y pide **eventos de ronda con marcas de trade, posición o timestamp**.
- Regresión `tests #166` + invariante en la propiedad `plan:*` (166/166 checks). Versión 4.8.2.

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
