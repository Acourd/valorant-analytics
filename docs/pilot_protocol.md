# Protocolo del Piloto (#2) — Utilidad, claridad y accionabilidad

> **Estado:** **BORRADOR DE PROTOCOLO — no ejecutar el piloto ni reclutar/recopilar datos** hasta completar los campos `PENDIENTE_DE_DEFINICIÓN` (contacto, canal, plazo de borrado, almacenamiento/acceso, transferencia, grabación y edad mínima).
> **No** requiere `verified_source`: el piloto mide **utilidad percibida y accionabilidad** de salidas heurísticas sobre datos aportados por el jugador (`normalized_input`), no la verdad del MMR ni del talento.
> **Alcance:** 10–20 jugadores. **Duración:** 4–6 semanas.

---

## 1. Objetivo y preguntas de investigación

1. ¿Las recomendaciones son **útiles** para el jugador?
2. ¿Se entienden sin fricción (**claridad**) y con el alcance correcto (**no se leen como veredictos**)?
3. ¿Se llevan a la práctica (**accionabilidad**)?
4. ¿Qué secciones sobran, confunden o faltan?

**No** se evalúa acierto predictivo de rango/MMR: eso exige credenciales Riot y validación empírica (frente #1, paso 5).

---

## 2. Selección de 10–20 jugadores

**Inclusión**
- **Edad mínima: PENDIENTE_DE_DEFINICIÓN** (propuesta por defecto: 18+). Si se decide admitir 16–17: consentimiento del tutor + asentimiento del menor, documentados.
- Juega competitivo con regularidad (≥ 5 partidas/semana) y usa Tracker.gg/OP.GG.
- Dispone de datos que puede aportar (capturas, texto de marcador o JSON local).
- Disposición a dar feedback estructurado y, opcional, seguimiento a 2 semanas.

**Exclusión**
- Conflictos de interés (equipo/promotor), no consentimiento, cuentas compartidas sin permiso.

**Cuotas (10–20)**
- Rango: ~1/3 bajo (Hierro–Plata), ~1/3 medio (Oro–Platino), ~1/3 alto (Diamante+).
- Rol: al menos 2 de cada familia (duelista, iniciador, controlador, centinela).
- Uso previo de entrenadores de puntería: mezcla sí/no.
- Región/idioma: diversidad razonable (ES/EN).
- Apertura a registro anónimo y a ser contactados para la entrevista.

**Reclutamiento:** comunidades de Valorant, Discord, red personal; sin incentivos que sesguen (retribución simbólica neutra o ninguna). Los datos de contacto del reclutamiento se mantienen **separados** del registro de sesión (§7.1).

---

## 3. Consentimiento informado

Checklist que debe firmarse/aceptarse antes de la sesión:

- [ ] Voluntario y **revocable** en cualquier momento, sin justificación.
- [ ] Se explican objetivo del piloto y qué **no** es (no diagnóstico de MMR/talento).
- [ ] Datos: qué se recoge (rango, horas, métricas aportadas, feedback), para qué y por cuánto tiempo (retención **≤ 6 meses**).
- [ ] **Minimización:** no se piden contraseñas, tokens de Riot ni datos sensibles.
- [ ] **Anonimización** del feedback y de los artefactos antes de compartir.
- [ ] **Terceros en capturas:** los marcadores incluyen handles de otros 9 jugadores (dato público, pero de terceros); se recortan/ocultan antes de compartirse y nunca se publican.
- [ ] **No verificación de origen:** se informa que los datos son `normalized_input` (no verificados).
- [ ] **Retirada/borrado:** el participante puede solicitarlo en cualquier momento.
  - Contacto del responsable: **PENDIENTE_DE_DEFINICIÓN**.
  - Canal de solicitud: **PENDIENTE_DE_DEFINICIÓN**.
  - Plazo máximo de borrado: **PENDIENTE_DE_DEFINICIÓN**.
  - Alcance: datos crudos, notas del moderador y artefactos. **Incluye derivados**: si un hallazgo ya se agregó en un informe, no es reversible, pero el informe nunca es identificable.
- [ ] **Grabación de audio/vídeo: PENDIENTE_DE_DEFINICIÓN.** Si se activa, exige consentimiento específico por escrito (y retención propia); si NO se activa, toda grabación queda **prohibida**.
- [ ] **Edad mínima:** PENDIENTE_DE_DEFINICIÓN (propuesta: 18+). Si se admite 16–17: consentimiento del tutor **y** asentimiento del menor, documentados.

Plantilla mínima: nombre/seudónimo, fecha, aceptación de los puntos anteriores, firma o confirmación por escrito.

---

## 4. Protocolo de sesión (≈ 45–60 min)

1. **Línea base (5 min):** rango actual/pico, horas/semana, objetivos, herramientas que ya usa.
2. **Ingesta (10 min):** el jugador aporta 1–3 partidas recientes. Se ejecuta el reporte sin pedir credenciales Riot.
3. **Lectura guiada (15 min):** el jugador lee el reporte en voz alta (*think-aloud*), señalando dudas y fricciones.
4. **Cuestionario (10 min):** feedback estructurado (§6).
5. **Entrevista breve (10 min):** guía semiestructurada (§6.3).
6. **(Opcional) Seguimiento 2 semanas:** ¿aplicaste algo? ¿qué cambió?

**Ética de operación:** nunca presentar hipótesis como hechos; el moderador corrige en el momento cualquier lectura que sobreinterprete las salidas.

---

## 5. Métricas de utilidad

| Dimensión | Ítem (Likert 1–5) | Definición operativa |
|---|---|---|
| **Utilidad** | "La información me resultó valiosa" | Percepción de valor general |
| **Claridad** | "Entendí cada sección sin ayuda" | Comprensión sin explicación externa |
| **Accionabilidad** | "Sé exactamente qué probar en mi próxima sesión" | Puedo convertirla en acciones concretas |
| **Calibración de alcance** | "Entendí que son hipótesis, no veredictos" (≥4 esperado) | No malinterpreta límites |
| **Calibración inversa** | "Leí alguna afirmación como un hecho" (1–5; **menor es mejor**) | Detecta sobreinterpretación |
| **Señal de ruido** | "Nada me pareció exagerado o inventado" (1–5; `null` = sin respuesta) | Anti-sobreafirmación |

**Binarias**
- ¿Ejecutó ≥1 recomendación en 2 semanas? (sí/no) · ¿Cuál(es)?
- ¿Compartiría el reporte con un amigo? (sí/no)

**Acción concreta (obligatoria en cada sesión)**
- Recomendación concreta elegida: **¿cuál exactamente?**
- **Fecha prevista de prueba** (ISO): ¿cuándo la probará?

**Cualitativas**
- Sección más y menos útil; ambigüedades; recomendaciones no ejecutables; texto sobrante.

**Criterios de éxito (provisionales)**
- Mediana ≥ 4 en **Utilidad**, **Claridad** y **Accionabilidad**.
- ≥ 60% ejecutó ≥ 1 recomendación a 2 semanas.
- Mediana ≥ 4 en **Calibración de alcance**, mediana ≥ 4 en **Señal de ruido** y mediana ≤ 2 en **Calibración inversa**.
- Ningún incidente de privacidad.

---

## 6. Formato de feedback

### 6.1 Registro por sesión (JSON)

```json
{
  "sessionId": "anon-001",
  "fechaISO": "YYYY-MM-DD",
  "perfil": { "bandaRango": "medio", "bandaHoras": "5-10", "macroRegion": "EU", "nota": "sin handles, sin fechas exactas ni horarios" },
  "evidencia": { "tipo": "normalized_input", "partidasAportadas": 2 },
  "likert": { "utilidad": null, "claridad": null, "accionabilidad": null, "calibracionAlcance": null, "calibracionInversa": null, "senalRuido": null },
  "accion": { "recomendacionConcreta": "", "fechaPrevistaPrueba": "" },
  "binarias": { "compartiriaConAmigo": null, "ejecutoRecomendacion": null },
  "secciones": { "masUtil": "", "menosUtil": "", "confusa": "", "faltante": "" },
  "notasModerador": "",
  "seguimiento2semanas": { "aplicoAlgo": null, "queAplico": "", "fechaRealizada": "", "efectoPercibido": "" }
}
```

### 6.2 Ítems Likert (redacción estable; 1–5, `null` = sin respuesta)
1. La información me resultó valiosa. (Utilidad)
2. Entendí cada sección sin ayuda. (Claridad)
3. Sé exactamente qué probar en mi próxima sesión. (Accionabilidad)
4. Entendí que son hipótesis, no veredictos. (Calibración de alcance)
5. Leí alguna afirmación como un hecho. (Calibración inversa; **menor es mejor**)
6. Nada me pareció exagerado o inventado. (Señal de ruido)

### 6.3 Guía de entrevista (semiestructurada)
- ¿Qué fue lo primero que miraste? ¿Por qué?
- ¿Algo te confundió o tuviste que releer?
- ¿Qué acción concreta sacas? ¿La harías esta semana?
- ¿Alguna afirmación te pareció una verdad absoluta? ¿Cuál?
- ¿Qué quitarías? ¿Qué añadirías?

---

## 7. Privacidad y seguridad

- Datos en local; sin subir capturas con datos personales a servicios externos.
- **Almacenamiento:** PENDIENTE_DE_DEFINICIÓN (ubicación y control de acceso).
- **Notas del moderador:** pueden contener PII; se anonimizan antes de compartirse o no salen del equipo del operador.
- **Transferencia entre roles:** canal PENDIENTE_DE_DEFINICIÓN; se evita enviar capturas sin recortar.
- **Anonimización de terceros:** antes de compartir cualquier captura, se recortan/ocultan los handles de los otros jugadores.
- Anonimización antes de archivar; retención ≤ 6 meses; **retirada/borrado** según el procedimiento del §3 (incluye derivados no reversibles, nunca identificables).
- Nada de credenciales Riot; la ingesta es `normalized_input`.
- Los hallazgos se reportan agregados; sin identificar a nadie sin permiso.
- **Grabación:** PENDIENTE_DE_DEFINICIÓN; prohibida salvo consentimiento específico por escrito.

### 7.1 Separación identidad ↔ registro pseudónimo (anti-reidentificación)

- **Regla de oro:** el vínculo identidad/contacto vive **fuera** del registro de sesión.
  - El JSON de §6.1 es **pseudónimo** (`sessionId`): sin handle, nombre, email, Discord ni IP.
  - La tabla de correspondencia (si existe) es un artefacto separado con acceso restringido: **PENDIENTE_DE_DEFINICIÓN**. Alternativa preferida: no almacenarla y usar un identificador efímero.
- **Generalización obligatoria** en el registro: banda de rango (bajo/medio/alto), banda de horas (`<5`, `5–10`, `>10`) y macro-región. **No** se guardan horarios ni fechas exactas de sesión.
- **Notas del moderador:** sin PII directa ni cuasi-identificadores; se revisan y redactan antes de archivar; nunca citas textuales identificables.
- **Muestra pequeña:** no se reportan celdas con combinaciones rango×región×horario cuando **n < 5**; los hallazgos se agregan por rangos amplios.

---

## 8. Análisis y reporte

- **Cuantitativo:** mediana/RIQ por ítem; proporciones binarias; n pequeño ⇒ sin significación inferencial.
- **Cualitativo:** codificación temática de fricciones y acciones.
- **Entregable:** informe con evidencia, límites declarados y recomendaciones de producto (qué mantener, cambiar o eliminar).

---

## 9. Roles y cronograma

| Semana | Hito |
|---|---|
| 1 | Reclutamiento + consentimiento |
| 2–3 | Sesiones (mitad del grupo) |
| 4 | Sesiones (resto) |
| 5 | Seguimiento a 2 semanas |
| 6 | Análisis y informe |

Roles: **Coordinador** (recluta/consentimiento), **Operador** (ejecuta reportes), **Analista** (datos + informe).

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Muestra pequeña / sesgo de autoselección | Cuotas por rango/rol; declarar límite |
| Auto-informe | Triangulación con artefactos del reporte y seguimiento |
| Sobreinterpretar hipótesis | Moderador corrige; calibración de alcance + ítem inverso |
| Privacidad | Anonimización (incluidos terceros en capturas), retención limitada, sin credenciales |
| Grabación no consentida | Prohibida salvo consentimiento específico por escrito (PENDIENTE_DE_DEFINICIÓN) |
| Confundir utilidad con acierto | Mensaje explícito: no se evalúa verdad del MMR/talento |

---

## 11. Fuera de alcance (requiere frente #1)
- Verificación de procedencia (`verified_source`) y validación contra partidas reales de Riot.
- Cualquier afirmación sobre MMR interno, talento real o rango merecido.
