<div align="center">

# ⚡ VALORANT ANALYTICS

### Telemetría Competitiva Local · Diagnóstico Descriptivo 360° · Motor de Puntería Adaptativo

[![Versión](https://img.shields.io/badge/versión-4.11.0_Sovereign-FF4655.svg?style=for-the-badge&logo=valorant&logoColor=white)](https://playvalorant.com/)
[![Runtime](https://img.shields.io/badge/runtime-Node.js_18%2B_Nativo-339933.svg?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Dependencias](https://img.shields.io/badge/dependencias-0_npm_(Core)-38BDF8.svg?style=for-the-badge&logo=codeforces&logoColor=white)](package.json)
[![Pruebas](https://img.shields.io/badge/tests-194%2F194_PASS-10B981.svg?style=for-the-badge&logo=checkmarx&logoColor=white)](test_suite.js)
[![Auditoría](https://img.shields.io/badge/auditoría-15%2F15_propiedades_PASS-8B5CF6.svg?style=for-the-badge&logo=codereview&logoColor=white)](opencode_tester.js)
[![Licencia](https://img.shields.io/badge/licencia-MIT-6B7280.svg?style=for-the-badge)](LICENSE)

<p align="center">
  <b>Transforma micro-eventos de ronda en decisiones tácticas deterministas.</b><br>
  Diseñado para describir patrones de rendimiento y fugas probables de ronda, señalar posibles indicios de anclaje de MMR (hipótesis, no verificado) y sugerir rutinas biomecánicas de 15 minutos en KovaaK's y Aim Lab.
</p>

[Tres Formas de Empezar](#-tres-formas-de-empezar) • [Matriz de Telemetría](#-el-problema-con-los-rastreadores-convencionales) • [Arquitectura](#-arquitectura-del-flujo-de-análisis) • [Diagnóstico en Acción](#-diagnóstico-en-acción) • [Comandos CLI](#-guía-de-comandos-principales) • [Gemini Gems & GPTs](#-soporte-para-gemini-gems-y-custom-gpts) • [English](README.en.md)

</div>

---

## ◈ El Problema con los Rastreadores Convencionales

La mayoría de rastreadores web públicos solo suman cifras acumuladas al final de la partida: bajas totales, muertes y un porcentaje genérico de tiros a la cabeza. **Describen el marcador, pero son ciegos ante el por qué se perdió la partida.**

| Dimensión Analítica | Rastreadores Públicos | Motor Valorant Analytics | Impacto Directo en tu Rango |
| :--- | :---: | :---: | :--- |
| **Bajas de Impacto Real** | 🔴 K/D plano sin contexto | 🟢 **ADR útil + Ratio $FK/FD$** | Diferencia bajas clave de apertura de rondas basura en desventajas 1v4 ya perdidas. |
| **Mecánica de Disparo** | 🔴 % Headshot global | 🟢 **Ratio $SE/TP$ (zonas observadas)** | Mide sobre-spray con zonas observadas; la distancia es n/d sin posiciones (no se infiere). |
| **Sinergia en Pareja** | 🔴 Inexistente | 🟢 **Auditoría de Dúo (agregados)** | Describe balance de bajas y carga; NO mide ventanas de tradeo sin eventos con contexto temporal. |
| **Economía de Rondas** | 🔴 Total gastado global | 🟢 **Conversión por Buy-Tiers (Eco/Semi/Full)** | Identifica si estás regalando rondas clave tras ganar pistolas o en compras completas. |
| **Salud de Cuenta** | 🔴 Solo rango visual | 🟡 **Señal heurística de MMR & estimación de rango** | Plantea una HIPÓTESIS (no verificada) de posible anclaje y una estimación orientativa de rango. No mide el MMR interno de Riot ni el talento real. |
| **Entrada de datos** | 🔴 Cosecha de caché / Tracker | 🟢 **JSON/export o texto aportados por ti** | Sin cosecha de caché ni descarga automática: la entrada la aportas explícitamente; la vía autorizada (Riot RSO) está pendiente de credenciales. |

---

## ◈ Arquitectura del Flujo de Análisis

El pipeline extrae micro-datos de cada ronda y los somete a verificación formal e inferencia táctica:

```mermaid
flowchart TD
    subgraph INGESTION["1. INGESTA RESILIENTE MULTI-FUENTE"]
        A1["JSON / Export del usuario"] --> B["universal_ingestor.js"]
        A2["Volcado de Marcador
(Texto Plano / OCR)"] --> B
        A3["Historial JSON / API
(Anti-WAF Turnstile)"] --> B
    end

    subgraph ENGINE["2. MOTORES DE TELEMETRÍA PROFUNDA"]
        B --> C1["learning_profile.js
(Radar 360° & Fugas de ELO)"]
        B --> C2["weapon_telemetry.js
(Bandas 0-15m / 15-30m / 30-50m)"]
        B --> C3["economy_analyzer.js
(Conversión Pistol / Eco / Full-Buy)"]
        B --> C4["duo_synergy.js
(Tradeos & Balance de Carga)"]
        B --> C5["autodiagnostic_engine.js
(señal heurística MMR & estimación de rango)"]
    end

    subgraph OUTPUT["3. PRESCRIPCIÓN Y ACCIÓN INMEDIATA"]
        C1 --> D1["Rutina KovaaK's / Aim Lab
(15 min adaptativos)"]
        C2 --> D1
        C3 --> D2["Ajuste de Compras & Pacing"]
        C4 --> D3["Directivas Tácticas de Dúo"]
        C5 --> D4["Proyección de Carrera & Hitos"]
    end
```

---

## ◈ Tres Formas de Empezar

Diseñado para adaptarse a cualquier flujo de trabajo sin fricciones:

### 🔹 Opción 1: Modo Directo sin Terminal (Vía Asistente Web o Gem)
> **Ideal si buscas un análisis conversacional inmediato desde un JSON/export o el texto de tu marcador (OCR de capturas: no implementado).**

1. Abre la especificación lista para usar: 👉 [**`standalone_prompt.md`**](standalone_prompt.md)
2. Copia todo su contenido y pégalo en tu asistente de IA favorito (**ChatGPT, Claude, Gemini o DeepSeek-R1**), o configúralo como un **Gem de Google Gemini** o **Custom GPT de OpenAI**.
3. Pega el texto de tu marcador o aporta un JSON/export (OCR de capturas NO implementado; Tracker no soportado).

### ⚡ Opción 2: Modo Local en Terminal (Despachador Maestro `cli.js`)
> **Ideal para jugadores competitivos que buscan velocidad (<100ms) y análisis 100% local. No hay descarga automática de Tracker ni cosecha de caché: aportas un JSON/export, el texto de tu marcador o una captura (con confirmación).**

```bash
# 1. Clona el repositorio
git clone https://github.com/Acourd/valorant-analytics.git
cd valorant-analytics

# 2. PLAN para la siguiente partida (flujo recomendado: aportar → entender → una acción → medir)
node cli.js plan examples/sample_match.json "TenZ#0001"

# 3. Ingesta de tu propio marcador (JSON/export o texto; sin red)
node cli.js parse mi_marcador.txt "TenZ#0001"

# 4. Lectura amplia y rutina (cuando el plan las habilite)
node cli.js match examples/sample_match.json "TenZ#0001"
node cli.js aim examples/sample_match.json "TenZ#0001"

# 5. Herramientas técnicas de integridad (no son coaching): DSSE, Merkle, MPC, Wasm, invariantes
node cli.js --advanced --help
```

### 🤖 Opción 3: Modo Agente Autónomo (Antigravity / Claude Code / OpenCode)
> **Para desarrolladores y usuarios avanzados que integran habilidades agénticas.**

- Carga la carpeta como skill activa enlazando [`SKILL.md`](SKILL.md).
- Dispondrás de más de 16 comandos con verificación formal de invariantes matemáticos y atestaciones criptográficas in-toto DSSE v1.

---

## ◈ Diagnóstico en Acción

Ejemplo ilustrativo (fixture local; no es telemetría real ni una salida validada empíricamente):

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

  [#2] Ráfagas prolongadas en rondas observadas (ejemplo ilustrativo; distancia n/d sin posiciones)
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

## ◈ Guía de Comandos Principales

El despachador maestro `cli.js` provee acceso unificado a todas las capacidades del sistema:

| Comando | Sintaxis | Descripción |
| :--- | :--- | :--- |
| **Diagnóstico 360°** | `node cli.js match [partida.json] <jugador>` | Evalúa los 5 pilares de rendimiento y extrae las 3 fugas críticas de ELO. |
| **Rutina de Puntería** | `node cli.js aim [partida.json] <jugador>` | Genera una playlist adaptativa de 15 minutos en KovaaK's / Aim Lab. |
| **Telemetría de Armas** | `node cli.js weapons [partida.json] <jugador>` | Mide zonas observadas (Head/Body/Leg) y ratio SE/TP; la distancia es n/d: no se infiere sin posiciones. |
| **Economía & Buy Tiers**| `node cli.js economy [partida.json] <jugador>` | Desglosa winrate, K/D y ADR en rondas Pistol, Eco, Semi-Buy y Full-Buy. |
| **Coaching Introspectivo**| `node cli.js coaching [partida.json] <jugador>` | Identifica duelos de máxima fricción y prescribe recursos tácticos de YouTube. |
| **Auditoría de Dúo** | `node cli.js duo [partida.json] [p1] [p2]` | Describe balance de bajas y carga (sin ventanas de timing; heurística de boost no validada). |
| **Matriz de Duelos 1v1** | `node cli.js duels [partida.json] [jugador]` | Desglosa los duelos directos cara a cara contra cada agente rival. |
| **Simulación Offline** | `node cli.js calibrate [jugador] [rango] [rol]` | SIMULACIÓN con valores ilustrativos (sin datos del jugador ni telemetría real). |
| **Auditoría de Carrera** | `node cli.js career <perfil.json>` | Desglosa horas competitivas vs casuales y cronología de hitos por rango. |
| **Señal Heurística de MMR** | `node cli.js diagnose <perfil.json>` | Señala un patrón compatible con posible anclaje (hipótesis NO verificada) y una estimación orientativa de rango. No mide el MMR interno. |
| **Ingesta Resiliente** | `node cli.js parse <archivo_o_texto> [jugador]` | Procesa JSON/export, volcados de texto o cualquier archivo existente (extensión opcional). Sin red. |
| **Invariantes Matemáticos**| `node cli.js invariants [partida.json] [jugador]` | Verificación formal de cotas numéricas [0, 100] y convergencia de zonas (100%). |
| **Atestación Cripto** | `node cli.js attest [partida.json] [jugador]` | Genera y valida un sobre DSSE in-toto firmado con Ed25519. |
| **Árbol Merkle** | `node cli.js merkle [partida.json]` | Construye el árbol Merkle de eventos discretos y emite pruebas de inclusión. |
| **Session Guardian** | `node cli.js guardian [partida.json] [jugador]` | Monitorea fatiga neuromuscular acumulada y calcula índice de tilt cognitivo. |
| **Deriva Táctica** | `node cli.js drift [partida.json] [jugador]` | Calcula divergencia de lado y entropía de Shannon en la distribución de rondas. |
| **Consenso Multi-Lente** | `node cli.js consensus [partida.json] [jugador]` | Arbitraje determinista entre 3 lentes locales (NO es BFT real) para síntesis de rendimiento. |
| **Manifiesto SBOM** | `node cli.js sbom` | Genera el manifiesto SBOM en formato CycloneDX v1.5 con 0 dependencias externas. |

---

## 🗂️ Seguimiento local de planes (privacidad y retención)

El ciclo completo es local: **crear plan → marcar intento → aportar otra partida → comparar → siguiente paso**.

```bash
node cli.js plan mi_marcador.txt "TenZ#0001"          # crea el plan y lo registra (planId determinista)
node cli.js plan list                                  # planes activos
node cli.js plan show <planId>                         # detalle: métrica, umbral, acción, rutina, bitácora
node cli.js plan intent <planId> "nota breve"          # marca la acción como intentada (≤200 caracteres)
node cli.js plan compare <planId> otra_partida.txt     # comparación honesta (solo métricas comparables)
node cli.js plan close <planId> | cancel <planId>      # cierra o cancela
node cli.js plan export --pseudonymized                # exportación explícita a stdout (jugador pseudonimizado)
```

**Privacidad y retención:** el historial vive en `VALORANT_PLANS_DIR` (por defecto `<cache>/plans`), un archivo JSON por plan con permisos 0600 en POSIX y escritura atómica; los symlinks se rechazan. Se guardan solo campos del plan: jugador, referencia+digest de la entrada, procedencia, fecha, métrica/valor/umbral/limitación, acción, rutina, siguiente dato, estado y bitácora breve. **No** se guardan credenciales, tokens ni datos de terceros. Retención local indefinida hasta cierre/cancelación (puedes borrar los archivos manualmente); límite de 500 planes. Los datos `synthetic_demo` **no se persisten** ni se comparan.

**Comparación honesta:** exige mismo jugador exacto, métrica observada y procedencia compatible. Estados: `MEDICION_COMPARABLE`, `DATOS_INSUFICIENTES`, `NO_COMPARABLE`, `SIMULACION_DEMO`; con `--json`, un único objeto. El resultado es un **delta descriptivo** con limitación explícita: una variación entre dos partidas no demuestra efecto de la rutina, mejora, MMR, rango ni talento.

**Perfiles de salida (misma evidencia, distinta presentación):** `--profile player` (breve), `--profile coach` (evidencia, límites y preguntas sugeridas) y `--profile analyst` (JSON estructurado). No cambian la política de evidencia.


## 🧱 Presupuestos de recursos y contrato de esquema

Las entradas no confiables se procesan con **límites explícitos**. `VA_BUDGET_*` (p. ej. `VA_BUDGET_MAX_PLAYERS=32`) **solo puede REDUCIR** un límite: los valores inválidos (texto, NaN, Infinity, no enteros, ≤0) o los intentos de ampliación por encima del máximo seguro compilado **fallan cerrado** con `RESOURCE_BUDGET_EXCEEDED`. No existe escape de entorno para ampliar límites. Al exceder un límite se falla cerrado con un código estable y **sin análisis parcial**:

| Presupuesto | Valor por defecto | Motivo |
|---|---|---|
| Tamaño de archivo | 5 MiB | un export normal pesa <1 MiB; margen amplio sin OOM |
| Longitud de texto | 200 000 caracteres | un marcador pegado enorme ronda decenas de KB |
| Profundidad JSON | 64 niveles | `JSON.parse` no limita profundidad |
| Jugadores | 64 | una partida tiene 10-20 |
| Rondas | 200 | un competitivo largo ronda 40 |
| Eventos | 100 000 | agregados por ronda de partidas largas |
| Elementos por arreglo | 20 000 | listas de daño/kills reales |
| Tiempo de proceso | 30 s | **corte cooperativo** en fases y bucles instrumentados (`sample()`); el runtime JS no puede preemptar código síncrono, así que no es un corte total garantizado |
| Workers concurrentes | 16 | estrés interno sin saturar runners |

Códigos: `INPUT_TOO_LARGE` (archivo/texto), `SCHEMA_LIMIT_EXCEEDED` (profundidad, jugadores, rondas, eventos, arreglos), `RESOURCE_BUDGET_EXCEEDED` (tiempo, workers). Con `--json`, la salida es **un único objeto** `{ ok:false, exitCode, error:{ code, message, details } }`.

**Esquema versionado:** `schemaVersion: 1` es el contrato actual. Ubicaciones canónicas: `data.metadata.schemaVersion` (normalizado) y `matchInfo.schemaVersion` (Riot). En Riot, `payload.schemaVersion` en la raíz **solo** se acepta si coincide con la canónica; si la canónica falta, la versión de raíz **se rechaza** (`SCHEMA_UNSUPPORTED`), nunca se admite como `supported`. Ausente ⇒ **legado limitado** (se procesa lo observable y se declara); incompatible en cualquier ubicación admitida o **discrepancia** ⇒ `SCHEMA_UNSUPPORTED`. Los campos desconocidos se ignoran con seguridad y se **declaran en el diagnóstico**, sin elevar la procedencia.

**Modalidad de estrés (fuera de la matriz normal):** `node tests/stress_dsse.js` ejecuta rondas acotadas de registro concurrente en el keystore DSSE con invariante completo en cada ronda y sin reintentos silenciosos (el primer error queda en logs). CI la corre en un job separado (`VA_STRESS_ROUNDS=3`).


## 📥 Entrada mínima útil (qué puedes aportar)

No necesitas telemetría imposible. El flujo `plan` funciona por niveles:

| Nivel | Qué aportas | Qué habilita |
|---|---|---|
| 1. Texto/marcador | Pegas el texto del marcador o un JSON/export con funciones y K/D/A, ACS, ADR y HS% | Observaciones descriptivas y, si una métrica cruza su umbral documentado, **una** acción mecánica con su rutina |
| 2. Eventos por ronda | Segmentos `player-round` / `player-round-damage` | Zonas head/body/leg y ratio spray/tap observados. El tradeo/aperturas requieren además marcas de trade, posición o timestamp |
| 3. Fuente verificada | Riot RSO con atestación (credenciales pendientes) | Única vía que podría habilitar causas/fugas atribuibles; hoy no disponible |

Si tu entrada no alcanza, `plan` no falla de forma genérica: indica el **siguiente dato más pequeño y concreto** (p. ej. "HS% del marcador" o "eventos de ronda con marcas de trade").


## ◈ Soporte para Gemini Gems y Custom GPTs

Si utilizas **Google Gemini (Gems)** o **OpenAI (Custom GPTs)**, el archivo [`standalone_prompt.md`](standalone_prompt.md) ha sido completamente optimizado con:

- **Instrucciones de Sistema (System Prompt)** estructuradas con tags XML (`<system_role>`, `<vision_and_input_protocol>`, `<output_specification>`, etc.) con rigor matemático y guardas anti-alucinación.
- **Protocolo de Ingesta Multi-Formato:** Diseñado para JSON/export aportado por ti, texto plano pegado o archivos existentes; OCR de capturas NO implementado.
- **Iniciadores de Conversación Listos para Usar:** 4 botones pre-configurados para diagnósticos de partida, sinergia de dúo, rutinas KovaaK's y señal heurística de MMR.
- **Formato Visual Deterministico:** Salida con barras ASCII de progreso (`[████████░░]`), matrices limpias de datos y bifurcaciones de coaching interactivo.

👉 **Consulta la guía completa de configuración en [standalone_prompt.md](standalone_prompt.md)**.

---

## ◈ Privacidad y Especificaciones de Ingeniería

- **100% Local y Confidencial:** todo el análisis se ejecuta en tu equipo; nada sale de tu máquina. No hay llamadas de red salvo que en el futuro actives Riot RSO con credenciales propias.
- **Sin red por defecto:** el análisis es local. No se cosecha la caché del navegador ni se consulta Tracker.gg. La entrada es un JSON/export, texto o captura que aportas explícitamente.
- **Zero Dependencias NPM:** Diseñado exclusivamente sobre las librerías estándar de Node.js (`fs`, `path`, `zlib`, `crypto`, `child_process`). Cero descargas externas.
- **Compatibilidad Multiplataforma:** Probado y garantizado en Windows 11 (PowerShell/CMD), macOS (zsh) y Linux (bash).
- **Garantía Determinista:** 194 pruebas automatizadas y suites modulares verificadas con Exit Code 0 (`node run_all_tests.js`) y auditoría semántica de propiedades fail-closed, sin puntuación promocional (`node opencode_tester.js`).
- **Contrato CLI:** salida humana y `--json`; códigos `0`/`1`/`2` documentados (resultado válido / entrada inválida / evidencia insuficiente); ningún comando selecciona un jugador en silencio.

---

## ◈ Alcance y Límites (Honestidad de Datos)

Este proyecto **describe** lo que la telemetría local permite observar; no certifica hechos sobre el emparejamiento interno de Riot ni sobre el jugador.

- **MMR / "MMR Drag":** la salida es una **hipótesis heurística no verificada** a partir de agregados (partidas, KD, ACS, DDΔ, HS, horas). El proyecto **no accede al MMR interno** ni a las ganancias/pérdidas de RR por partida, por lo que no puede determinar ni demostrar un anclaje algorítmico. Toda conclusión de este tipo queda marcada como `hipotesis_no_verificada`.
- **Talento vs esfuerzo:** es una **etiqueta descriptiva** de patrones de impacto/volumen, no una medición de talento. Los agregados no separan talento de esfuerzo ni prueban causalidad.
- **Rango merecido:** la "estimación de rango" es una **cota orientativa** derivada de umbrales heurísticos, no un rango real.
- **Validación pendiente:** el motor aún no se ha validado con telemetría real ni con una muestra de jugadores. Hasta entonces, ninguna salida debe presentarse como diagnóstico concluyente.
- **`verified_source` (frente #1):** la única fuente autorizada para VALORANT es la **API oficial de Riot (production key + Riot Sign-On)**; las claves personales/developer no tienen acceso. El adaptador (`scripts/riot_source.js`) exige token Riot, host en allowlist, `matchId` verificable y una atestación Ed25519 **verificada contra el trust store del operador** (`RIOT_ATTESTATION_TRUST`), que **no se acepta como argumento**; la firma la produce la clave privada del **ingestor autorizado** (`RIOT_ATTESTATION_KEY`, 0600 fuera del repo), nunca una clave del llamador. Una firma local acredita **procedencia del ingestor**, no que Riot emitiera criptográficamente el contenido. Sin credenciales aprobadas, `verified_source` es inalcanzable y todo queda como `normalized_input`. Credenciales Riot: **pendientes de solicitud**.
- **Fugas de ELO (aprendizaje 360°):** son señales derivadas de micro-eventos de la partida analizada (fixture o datos que aportes), no una auditoría forense de la cuenta.

---

## ◈ Licencia

Distribuido bajo la [Licencia MIT](LICENSE). Código libre para uso personal, competitivo y formativo.
