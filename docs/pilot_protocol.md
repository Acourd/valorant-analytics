# Protocolo del Piloto (#2) — Utilidad, claridad y accionabilidad

> **Estado:** borrador para ejecución. **No** requiere `verified_source`: el piloto mide **utilidad percibida y accionabilidad** de salidas heurísticas sobre datos aportados por el jugador (`normalized_input`), no la verdad del MMR ni del talento.
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
- 18+ (si hay 16–17: consentimiento del tutor + asentimiento del menor).
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

**Reclutamiento:** comunidades de Valorant, Discord, red personal; sin incentivos que sesguen (retribución simbólica neutra o ninguna).

---

## 3. Consentimiento informado

Checklist que debe firmarse/aceptarse antes de la sesión:

- [ ] Voluntario y **revocable** en cualquier momento, sin justificación.
- [ ] Se explican objetivo del piloto y qué **no** es (no diagnóstico de MMR/talento).
- [ ] Datos: qué se recoge (rango, horas, métricas aportadas, feedback), para qué y por cuánto tiempo (retención **≤ 6 meses**).
- [ ] **Minimización:** no se piden contraseñas, tokens de Riot ni datos sensibles.
- [ ] **Anonimización** del feedback y de los artefactos antes de compartir.
- [ ] **No verificación de origen:** se informa que los datos son `normalized_input` (no verificados).
- [ ] Contacto del responsable y vía de retirada/borrado.
- [ ] (Si aplica) Consentimiento del tutor + asentimiento del menor.

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
| **Señal de ruido** | "¿Hubo algo que pareciera exagerado o inventado?" (0 = no) | Anti-sobreafirmación |

**Binarias**
- ¿Ejecutó ≥1 recomendación en 2 semanas? (sí/no) · ¿Cuál(es)?
- ¿Compartiría el reporte con un amigo? (sí/no)

**Cualitativas**
- Sección más y menos útil; ambigüedades; recomendaciones no ejecutables; texto sobrante.

**Criterios de éxito (provisionales)**
- Mediana ≥ 4 en **Utilidad**, **Claridad** y **Accionabilidad**.
- ≥ 60% ejecutó ≥ 1 recomendación a 2 semanas.
- Mediana ≥ 4 en **Calibración de alcance** y 0 casos de "exagerado/inventado" con valor > 1.
- Ningún incidente de privacidad.

---

## 6. Formato de feedback

### 6.1 Registro por sesión (JSON)

```json
{
  "sessionId": "anon-001",
  "fechaISO": "YYYY-MM-DD",
  "perfil": { "rangoActual": "Oro 2", "rangoPico": "Platino 1", "horasSemana": 8, "region": "EU" },
  "evidencia": { "tipo": "normalized_input", "partidasAportadas": 2 },
  "likert": { "utilidad": 0, "claridad": 0, "accionabilidad": 0, "calibracionAlcance": 0, "sensacionRuido": 0 },
  "binarias": { "compartiriaConAmigo": null, "ejecutoRecomendacion": null },
  "secciones": { "masUtil": "", "menosUtil": "", "confusa": "", "faltante": "" },
  "notasModerador": "",
  "seguimiento2semanas": { "aplicoAlgo": null, "queAplico": "", "efectoPercibido": "" }
}
```

### 6.2 Ítems Likert (redacción estable)
1. La información me resultó valiosa. (Utilidad)
2. Entendí cada sección sin ayuda. (Claridad)
3. Sé exactamente qué probar en mi próxima sesión. (Accionabilidad)
4. Entendí que son hipótesis, no veredictos. (Calibración)
5. Nada me pareció exagerado o inventado. (Ruido; 5 = totalmente de acuerdo)

### 6.3 Guía de entrevista (semiestructurada)
- ¿Qué fue lo primero que miraste? ¿Por qué?
- ¿Algo te confundió o tuviste que releer?
- ¿Qué acción concreta sacas? ¿La harías esta semana?
- ¿Alguna afirmación te pareció una verdad absoluta? ¿Cuál?
- ¿Qué quitarías? ¿Qué añadirías?

---

## 7. Privacidad y seguridad

- Datos en local; sin subir capturas con datos personales a servicios externos.
- Anonimización antes de archivar; retención ≤ 6 meses; borrado a petición.
- Nada de credenciales Riot; la ingesta es `normalized_input`.
- Los hallazgos se reportan agregados; sin identificar a nadie sin permiso.

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
| Sobreinterpretar hipótesis | Moderador corrige; ítem de calibración de alcance |
| Privacidad | Anonimización, retención limitada, sin credenciales |
| Confundir utilidad con acierto | Mensaje explícito: no se evalúa verdad del MMR/talento |

---

## 11. Fuera de alcance (requiere frente #1)
- Verificación de procedencia (`verified_source`) y validación contra partidas reales de Riot.
- Cualquier afirmación sobre MMR interno, talento real o rango merecido.
