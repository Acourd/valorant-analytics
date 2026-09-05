# Valorant Analytics

[![Versión](https://img.shields.io/badge/versión-4.0-black.svg?style=flat-square)](https://github.com/Acourd/valorant-analytics)
[![Runtime](https://img.shields.io/badge/runtime-Node.js_nativo-black.svg?style=flat-square)](https://nodejs.org/)
[![Dependencias](https://img.shields.io/badge/dependencias-0_npm-black.svg?style=flat-square)](package.json)
[![Licencia](https://img.shields.io/badge/licencia-MIT-black.svg?style=flat-square)](LICENSE)
[![Pruebas](https://img.shields.io/badge/pruebas-46%2F46_aprobadas-black.svg?style=flat-square)](test_suite.js)

Análisis táctico y diagnóstico de partidas para jugadores competitivos de Valorant. Diseñado para identificar fugas de rondas, corregir hábitos mecánicos y medir tu progreso real sin depender de estadísticas superficiales.

Disponible también en: [English (README.en.md)](README.en.md) | [Documentación Técnica (SKILL.md)](SKILL.md)

---

## El problema con las estadísticas tradicionales

La mayoría de plataformas muestran cifras aisladas: bajas, muertes, porcentaje de tiros a la cabeza y tasa de victoria. Aunque estos datos describen el resultado final, no explican la causa.

- No aclaran si tus bajas cambiaron el destino de la ronda o si ocurrieron cuando el punto ya estaba perdido.
- No identifican si pierdes enfrentamientos por abusar del retroceso del arma o por mala anticipación de ángulos.
- No distinguen entre un mal momento individual y una cuenta cuyo emparejamiento interno (MMR) quedó anclado tras cientos de partidas.

Valorant Analytics examina lo que sucede en cada ronda para darte respuestas claras y soluciones prácticas que puedes aplicar en tu siguiente partida.

---

## Qué obtienes con la herramienta

### Diagnóstico 360° de la partida
Un desglose conciso que evalúa tus cinco áreas clave: puntería inicial, control de mapa, duelos de apertura, economía de equipo y compostura en situaciones límite. Detecta con precisión las tres jugadas exactas donde se perdieron ventajas decisivas.

### Rutina de puntería personalizada en 15 minutos
En lugar de practicar ejercicios genéricos, el sistema genera una rutina adaptada a las debilidades de tu última sesión para KovaaK's, Aim Lab o la galería de tiro en Valorant. Si fallaste disparos a larga distancia, la rutina prioriza micro-ajustes estáticos; si abusaste de ráfagas largas, entrena disparos únicos con movimiento lateral.

### Sinergia y coordinación en dúo
Si juegas en pareja, analiza si ambos sincronizan bien los intercambios de bajas (re-frags), cómo se distribuye la carga ofensiva y si sus selecciones de agentes se complementan de manera eficiente.

### Auditoría de horas reales y rango merecido
Separa tus horas de juego efectivo en competitivo de los modos casuales y descarta la inflación artificial de puntos de cuenta. Evalúa la dificultad real de las salas donde compites para indicarte qué rango mereces y si tu cuenta experimenta arrastre de emparejamiento.

### Extracción local sin bloqueos
Recupera los datos de tus partidas directamente desde la memoria temporal de tu navegador habitual (Chrome, Brave, Edge, Opera o Vivaldi). Esto evita tiempos de espera caídos y bloqueos por sistemas antibot en páginas públicas.

---

## Tres formas sencillas de usarlo

Elige la modalidad que mejor se adapte a tu flujo de trabajo:

| Modalidad | Para quién es | Requisitos | Cómo se utiliza |
| :--- | :--- | :---: | :--- |
| **Modo Texto (Sin consola)** | Jugadores que buscan una lectura rápida | Ninguno | Copia la plantilla de `standalone_prompt.md` y pégala junto con los datos de tu partida en cualquier asistente web. |
| **Línea de Comandos (Local)** | Quienes prefieren procesar datos en su equipo | Node.js instalado | Clona el repositorio y ejecuta `node cli.js match <archivo> "<Jugador#Tag>"`. |
| **Asistente de Código / Agente** | Usuarios de entornos avanzados | Entorno compatible | Integra la carpeta en Claude Code, Google Antigravity u OpenCode mediante su archivo `SKILL.md`. |

---

## Ejemplo de diagnóstico

Así se presenta un reporte tras procesar una partida competitiva:

```text
========================================================================
VALORANT ANALYTICS — REPORTE DE RENDIMIENTO
Partida: Lotus | Jugador: Iso | Rango de sala: Platino 2 / Diamante 1
========================================================================

EVALUACIÓN GENERAL: 88 / 100
  • Puntería y primer impacto:     86 / 100  (28.5% tiros a la cabeza)
  • Participación útil (KAST):      82 / 100  (74.0% de rondas con impacto)
  • Apertura de duelos:             89 / 100  (54.0% de duelos iniciales ganados)
  • Disciplina económica:           90 / 100  (Buen aprovechamiento en compra completa)
  • Resolución en desventaja:       80 / 100  (1 conversión de 3 intentos en 1v2)

FUGAS PRINCIPALES DE RONDAS:
  1. Sobre-exposición en post-plant (Rondas 7 y 14):
     Búsqueda innecesaria de la última baja con ventaja numérica (5v3).
     Ajuste: Mantener posiciones cruzadas y consumir el tiempo del rival.

  2. Ráfagas prolongadas a más de 30 metros:
     Compromiso excesivo con el retroceso del arma frente a coberturas lejanas.
     Ajuste: Disparar ráfagas de 2 balas combinadas con desplazamiento corto.

RUTINA DE PUNTERÍA SUGERIDA (15 MINUTOS):
  • Microshot / Click-timing: 5 minutos (precisión de parada inicial).
  • Dynamic Horizontal Click: 5 minutos (control de ángulos y esquinas).
  • Smooth Tracking:          5 minutos (seguimiento de desplazamientos rápidos).
========================================================================
```

---

## Comandos principales

Para quienes utilicen la terminal, el despachador unificado reúne las funciones clave:

```bash
# Diagnóstico completo de partida y detección de fallos
node cli.js match examples/sample_match.json "TuNombre#TAG"

# Generación de rutina de puntería de 15 minutos
node cli.js aim examples/sample_match.json "TuNombre#TAG"

# Telemetría de armas y distancias de enfrentamiento
node cli.js weapons examples/sample_match.json "TuNombre#TAG"

# Auditoría de coordinación con tu compañero de dúo
node cli.js duo examples/sample_match.json "Jugador1#TAG" "Jugador2#TAG"

# Extracción de datos desde la caché del navegador (sin bloqueos de red)
node cli.js harvest

# Auditoría de horas de carrera y tiempo efectivo de juego
node cli.js career

# Evaluación de rango merecido y detección de estancamiento
node cli.js diagnose
```

---

## Privacidad y arquitectura ligera

- **Procesamiento estrictamente local:** Tus partidas e historiales se analizan en tu propio ordenador. Ninguna información se envía a servidores remotos ni se comparte con terceros.
- **Cero dependencias externas:** El código opera únicamente con módulos incluidos de fábrica en Node.js. No requiere descargas pesadas ni instalaciones adicionales con npm.
- **Multiplataforma:** Probado y funcional en Windows 11, macOS y distribuciones comunes de Linux.

---

## Licencia

Distribuido bajo licencia MIT. Consulta el archivo `LICENSE` para más información.
