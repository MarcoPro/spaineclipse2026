# Changelog

Todos los cambios notables del proyecto Eclipse Solar España.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y este proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

## [3.0.0] — 2026-08-17

### 🔄 Migración Eclipse 2026 → 2027
- **Transición completa al eclipse solar total del 2 de agosto de 2027** (sur de España: Cádiz, Málaga, Gibraltar, Granada, Almería).
- Archivado completo del eclipse 2026 en el directorio `eclipse 2026/` (7 ficheros, ~7 MB).

### ✨ Añadido
- **Configuración centralizada `config.js` v3.0.0 (`window.EclipseConfig`)**
  - Objeto global único con 15 secciones: identidad, versión, cronología, elementos besselianos (Espenak + Jubier ΔT=69.3s), geometría solar/lunar, perfil de limbo lunar, contactos por defecto, ubicación por defecto (Tarifa), mapa, heatmap, topografía, scoring, textos dinámicos, y **flags de meteorología**.
  - Todos los módulos JS (`app.js`, `phase_clock.js`, `limb_simulator.js`, `lunar_limb_profile.js`, `observation_card.js`, `besselian_calculator.js`, `location_finder.js`, `astrophoto_calc.js`) ahora leen de `window.EclipseConfig` en lugar de valores hardcodeados.
- **Control de meteorología configurable (`weather.forecast_enabled` / `weather.default_mode`)**
  - Nuevo flag `forecast_enabled: false` que oculta automáticamente los toggles de "Previsión Real" en el panel lateral y en el mapa de nubes.
  - La web muestra solo el perfil climatológico histórico ERA5 por defecto.
  - Para activar la previsión NWP en vivo, basta con cambiar `forecast_enabled: true` y `default_mode: 'forecast'` en `config.js`.
- **Catálogo de municipios del sur de España (`origins.json`)**: 35 municipios clave de Cádiz, Málaga, Granada, Almería, Ceuta, Melilla, Gibraltar, Sevilla y Córdoba.

### 🔧 Cambiado
- **Refactorización completa de los 8 scripts Python de generación de datos**:
  - Todos los scripts ahora leen parámetros (fecha, hora, coordenadas, GeoJSON, libración lunar) desde `config.js` en lugar de tener valores hardcodeados.
  - Parser robusto de `config.js` con soporte para comentarios JS (`//`) mediante `re.sub()`.
  - `generate_eclipse_geojson.py`: rangos geográficos ajustados al sur de España, ventana temporal 7h-13h TDT, salida dinámica `eclipse_{year}.geojson`.
  - `generate_limb_profile.py`: lee libración (l, b, c), timestamp y radio medio desde `config.js`.
  - `generate_cloud_heatmap_gee.py`, `generate_topography_gee.py`: paths dinámicos desde config.
  - `generate_cloud_heatmap-open-meto.py`: añadida lectura de `config.js`, paths absolutos.
  - `generate_weather_forecast_models.py`, `generate_weather_forecast.py`, `generate_weather_forecast(openMeteo).py`: leen fecha/hora/GeoJSON de `config.js`.
- **Elementos besselianos actualizados** para el eclipse del 2 de agosto de 2027 (T0=10.0, ΔT=69.3s, γ=0.1421, magnitud=1.079).
- **Ubicación por defecto** cambiada de Palencia → Tarifa (36.0143°N, 5.6044°W).
- **Centro del mapa** reposicionado al sur de España (36.75°N, 5.0°W).
- **Metadata del sitio** (`index.html`, `manifest.json`, `sw.js`, `sitemap.xml`, `robots.txt`) actualizada para 2027.

### ⚠️ Pendiente
- Regenerar `eclipse_2027.geojson` y `eclipse_data.js` con la trayectoria final del eclipse 2027.
- Regenerar `cloud_heatmap.js` (heatmap climático para 2 de agosto, zona sur).
- Regenerar `topography_data.js` (SRTM corredor sur Cádiz-Málaga-Granada).
- Regenerar `lunar_limb_profile.js` con libración 2027.
- Crear catálogo `aemet_path_municipalities.json` para municipios del sur de España.
- Poblar `events.json` con eventos de observación del eclipse 2027.

---

## [2.7.0] — 2026-08-04

### ✨ Añadido
- **Sistema Integral de Descargo de Responsabilidad y Uso Consciente (`#modal-disclaimer`)**
  - **Modal de Primera Visita & Términos Legales**: Presentación automática de la descarga de responsabilidad en el primer acceso a la app (con persistencia en `localStorage`), accesible en todo momento mediante el botón con icono de escudo en el header, el botón de *Aviso Legal* en el panel lateral y clic en el fondo oscuro del modal.
  - **Cuatro Ejes Fundamentales de Seguridad**:
    1. *Salud Visual & Responsabilidad Personal*: Enfatiza la obligación de utilizar gafas certificadas ISO 12312-2 en fase parcial y el uso bajo criterio propio.
    2. *Tiempos Astronómicos de Alta Precisión y Posibles Diferencias*: Aclara que los tiempos son de alta precisión astronómica (calculados por elementos besselianos y efemérides), pero pueden diferir ligeramente de la realidad (debido a altitud local, refracción, reloj del dispositivo o limbo lunar).
    3. *Precisión Geográfica del Usuario*: Informa sobre la sensibilidad del cálculo al marcar o seleccionar la localidad en el mapa.
    4. *Imponderables Tecnológicos*: Detalla las limitaciones de las alertas acústicas y voz sintetizada por bloqueos de audio, ahorro de batería o fallos del navegador.
  - **Avisos Contextuales en la Interfaz**:
    - *Tarjeta de Seguridad Visual (`#safety-warning`)*: Nota sobre tiempos de alta precisión que pueden diferir de la realidad.
    - *Reloj Día D & Alertas Sonoras (`#modal-phase-clock`)*: Banner de aviso de seguridad acústica y sincronía horaria.
    - *Recomendador por Radio (`#modal-location-finder`)*: Advertencia de sensibilidad de cálculo por margen geográfico.
    - *Pase Oficial de Observación (`observation_card.js`)*: Micro-disclaimer impreso en el pie del pase exportable.
- **Ampliación de Cobertura Meteorológica (`generate_weather_forecast.py` & `weather_forecast_data.js`)**:
  - Aumentada la densidad de la cuadrícula de predicción de **534 a 1.634 coordenadas** en la franja de totalidad (~20 km de separación entre puntos de muestreo), mejorando drásticamente la resolución de la interpolación IDW local en valles, montañas y zonas costeras.

### 🐛 Corregido
- **Activación de Botones del Disclaimer**: Añadidos controladores globales (`window.openDisclaimerModal`), gestión de eventos táctiles (`touchstart` y `click`), detención de propagación y atributo `onclick` de respaldo para garantizar la apertura instantánea del modal de aviso legal desde la cabecera o el panel en cualquier dispositivo.

## [2.6.0] — 2026-08-04

### ✨ Añadido
- **Modo Test & Simulador del Día D (`phase_clock.js`)**
  - **Simulador Temporal Acelerado**: Permite ejecutar un reloj virtual del eclipse transcurriendo a velocidad ajustable (**1X, 5X, 10X, 30X**) desde minutos antes de C1 hasta el final del eclipse para ensayar todo el flujo de avisos en directo hoy mismo.
  - **Salto de Fase Interactivo**: Menú desplegable para posicionar la simulación al instante a preavisos específicos (Pre C1 a 3m, Pre C2 a 1m, C2 a 30s, MAX, C3 a 30s, C3 a 10s, Pre C4 a 3m).
  - **Botonera de Pruebas Rápidas**: Rejilla de botones dedicados para escuchar bajo demanda cualquier aviso de locución por voz (`es-ES`) y tono sintético (beep) individualmente.
  - **Subtítulos y Estado Visual**: Indicador activo en vivo de la hora simulada y banner resaltado con el subtítulo del aviso de voz en reproducción.
- **Motor de Voz HD & Selección Inteligente de Sintetizadores**
  - **Priorización de Voces Neuronales/HD**: Algoritmo de puntuación que selecciona automáticamente voces de alta fidelidad humana disponibles en el sistema (*Google español de España*, *Apple Mónica/Jorge Enhanced*, *Microsoft Jorge Natural*).
  - **Selector de Voz en UI**: Menú desplegable `Voz de Sintetizador` con indicación **`✨ HD`** para elegir manualmente entre las voces instaladas en el dispositivo.
  - **Cadencia Humana Calibrada**: Reducción de velocidad a `0.94` para una entonación más pausada, natural y clara.
- **Sistema de Preavisos Adaptativo No Solapado en Totalidad**
  - **Reorganización Cronológica en Totalidad**: Ajuste de intervalos de preaviso para evitar solapamientos durante eclipses totales cortos (< 2 min): Pre C2 (-1 min y -30s), C2 (0s), MAX (0s), Pre C3 (-30s y -10s), C3 (0s).
  - **Diferenciación Estricta entre Totalidad y Parcialidad**:
    - *Zona de Totalidad*: Instruye preparar la retirada de gafas solares y filtros de cámara a los 30s antes de C2, autoriza su retirada exacta en C2 (totalidad), e insta encarecidamente a volver a colocárselos a 30s y 10s antes de C3.
    - *Zona de Parcialidad*: Enfatiza en todos los preavisos que **NUNCA** se deben retirar las gafas ni los filtros durante ninguna fase del eclipse parcial.
- **Diseño e Integración Completa de Favicon & Iconos PWA**
  - **Favicon Vectorial SVG (`favicon.svg`)**: Diseño estilizado de alta definición de la corona solar dorada envolviendo la luna oscura con resplandor radial y perla de Baily para pantallas Retina y monitores 4K.
  - **Formatos Multi-Dispositivo**: Generación de `favicon-32x32.png`, `favicon-16x16.png`, `favicon.ico`, `apple-touch-icon.png` (iOS) e iconos PWA de 192px y 512px para Android y escritorio.
  - **Caché Offline en Service Worker**: Integración en `sw.js` (v2.6.0) para garantizar su disponibilidad 100% sin conexión.

### 🐛 Corregido
- **Compatibilidad de Audio y Simulación en Android / iOS Móviles**: Implementada función `unlockMobileAudio()` vinculada a eventos de toque (`touchstart` y `click`) para desbloquear las restricciones de `AudioContext` y `SpeechSynthesis` en navegadores móviles.
- **Responsividad de Desplegables en Móvil**: Solucionado el desbordamiento de ancho en selectores de voz y velocidad mediante maquetación vertical (`1fr`), `min-width: 0` y truncado con `text-overflow: ellipsis`.
- **Rendimiento del Simulador 3D de Horizonte en iPhone 15 / iOS Safari (`horizon_3d.js`)**: Solucionado el bloqueo con la rueda giratoria (*spinner*) en procesadores móviles y pantallas Retina al optimizar la rejilla 3D adaptativa (de 62.500 a 6.400 vértices en móviles, ejecutando los cálculos en < 20ms) y añadir protección con bloque `try/catch` para ocultar siempre el spinner tras la carga.

---

## [2.5.0] — 2026-08-02

### ✨ Añadido
- **Suite Avanzada de Herramientas Astronómicas**
  - **Reloj Día D & Alertas de Voz en Vivo (`phase_clock.js`)**: Cuenta atrás interactiva en tiempo real con horas exactas de contactos C1, C2, MAX, C3 y C4 y avisos hablados en español (Web Speech API) para guiar la observación sin mirar la pantalla.
  - **Calculador & Encuadre Fotográfico Solar (`astrophoto_calc.js`)**: Simulador Canvas del visor según tipo de sensor de cámara (Full Frame, APS-C, Micro 4/3, Smartphone) y focal (10mm a 1000mm) con tabla de exposiciones recomendadas.
  - **Recomendador Inteligente por Radio de Km (`location_finder.js`)**: Búsqueda geoespacial desde la localidad seleccionada o tecleando cualquier municipio de España con **autocompletado interactivo en tiempo real**. Muestra las 3 mejores opciones con geocodificación inversa de municipios y marcadores numerados (1, 2, 3) en el mapa Leaflet.
  - **Pase Oficial de Observación Exportable (`observation_card.js`)**: Generación de credencial astronómica HD en Canvas con los datos del observador, tiempos C1-C4 al segundo, previsión y checklist de seguridad.
  - **Impresión a Sangre DIN A4**: Adaptación del pase a la proporción matemática A4 (1200x1697 px) y reglas `@media print` para imprimir o guardar en PDF al 100% del folio A4 sin márgenes.
- **Integración de Analytics Libre de Cache de Service Worker**
  - Snippet oficial de Cloudflare Web Analytics integrado respetando la privacidad del usuario.

### 🐛 Corregido
- **Geocodificación de Origen y Fallback de Komoot Photon**: Eliminado parámetro `lang=es` no soportado que producía error HTTP 400 Bad Request en peticiones Photon e integrado fallback con Nominatim.
- **Referencia de Mapa Leaflet**: Exportación de `window.eclipseMap` en `app.js` solucionando el error `TypeError: t.addLayer is not a function`.
- **Superposición de Modales**: Reglas CSS para `.modal-overlay` y `.modal-container` en `styles.css`.

---

## [2.4.0] — 2026-07-30

### ✨ Añadido
- **Previsión Meteorológica Diaria Offline (Open-Meteo)**
  - Script `scripts/generate_weather_forecast.py` para pregenerar diariamente la predicción numérico-climática (534 puntos de muestreo en España) para el 12 de agosto de 2026 a las 18:00 UTC.
  - Cero peticiones AJAX en tiempo de ejecución (funcionamiento estático 100% offline).
  - Desglose detallado por capas de nubes: **Nubes Bajas, Medias y Altas (Cirros)**, probabilidad de lluvia y temperatura.
  - Marca de tiempo explícita con la fecha y hora exacta en la que se calculó la última previsión.
  - Etiqueta dinámica de claridad de cielo (ej. *80% despejado - Óptimo*).
  - Conmutador interactivo entre **Previsión Real (Open-Meteo)** (activa por defecto) e **Histórico ERA5 (Copernicus)**.
  - Capa temática en el mapa de calor de nubes sincronizada dinámicamente con la previsión real en vivo.
  - Recálculo en tiempo real del **Índice de Observación (Score 0–10)** priorizando la previsión real.
- **Base de Datos Centralizada de Actividades y Eventos (`events.json`)**
  - Migración del catálogo de actividades y puntos de observación a un archivo `events.json` desacoplado e independiente para facilitar su edición y actualización.
  - Enriquecimiento masivo con **30 ubicaciones y eventos reales** (Osorno, Guardo, Paredes de Nava, Arévalo, Íscar, Alaejos, Arija, Torre de Hércules, GALÁCTICA Teruel, etc.) incluyendo enlaces a webs oficiales y badges de inscripción.
- **Enlace al Código Fuente**
  - Añadido enlace directo al repositorio oficial del proyecto en GitHub (`https://github.com/marcopro/spaineclipse2026/`) en la barra principal de controles.

### 💄 UX & Móvil (iPhones)
- **Solución de visualización en pantallas móviles e iPhones**:
  - Ajustado el tamaño de fuente, interlineado y paddings de `.info-header` y `#locality-name` en pantallas móviles (`@media (max-width: 600px)`).
  - Resuelto el problema donde el nombre de la localidad quedaba recortado o tapado en iPhone/Safari debido a la Dynamic Island, notch y barras dinámicas de navegación mediante `100dvh` y `safe-area-inset`.

---

## [2.3.0] — 2026-05-08

### ✨ Añadido
- **Índice de Observación del Eclipse** (puntuación 0-10)
  - Indicador discreto centrado bajo el nombre de localidad y región en el panel de detalle.
  - **5 criterios objetivos** para eclipses totales (suma = 10 pts):
    - Duración de la totalidad (0–3.0 pts): calibrado para el máximo de ~100s en España.
    - Altitud solar (0–1.5 pts): mayor altitud = menor extinción atmosférica.
    - Cielo despejado (0–2.0 pts): curva exponencial (potencia 1.5) sobre datos históricos IDW.
    - Horizonte libre (0–2.0 pts): penalización escalonada por altitud solar (0-5°/5-10°/10-15°/15-20°).
    - Puesta de sol (0–1.5 pts): coherente con horizonte — bloqueo orográfico implica puesta efectiva.
  - **Eclipses parciales**: puntuación 0 con explicación descriptiva (sin totalidad = sin valor).
  - Tooltip interactivo (`position: fixed`, anclado a `body`) con desglose visual por barras.
  - Código de color: excelente (verde), bueno (amarillo), regular (naranja), desfavorable (rojo), sin puntuación (gris).
  - Actualización dinámica tras la comprobación asíncrona del horizonte.

### 🐛 Corregido
- **Nubosidad mostraba NaN**: propiedad `cloudcover` no existía en datos; corregido a `accumulated`.
- **Predicción meteorológica desaparecida**: `Math.round(null)` producía NaN y ocultaba el panel.
- **Umbral de horizonte ampliado**: de 15° a 20° para cubrir más ubicaciones en España.

---

## [2.2.0] — 2026-05-07

### ✨ Añadido
- **Simulador de Perlas de Baily v2 — Reescritura completa**
  - **Modo fotorrealista mejorado**:
    - Cromosfera solar (arco rojo Hα) visible cerca de la totalidad.
    - Corona solar con estructura asimétrica y streamers realistas.
    - Perfil LOLA visible como contorno sutil sobre el borde lunar.
    - Anillo de Diamante con star-burst y flare óptico calibrado.
  - **Dirección lunar corregida**: PA ≈ 300° (Luna entra desde cuadrante superior-derecho).
  - **Canvas HiDPI**: Resolución 800×800 con soporte para devicePixelRatio.
  - **Optimización de rendimiento**: Gate de proximidad a totalidad, cap de perlas renderizadas.
  - **Controles mejorados**:
    - Botón Play/Pause para animación automática.
    - Indicador de fase actual (Parcial / Perlas C2 / Totalidad / Perlas C3).
    - Rango temporal expandido a ±20s alrededor de la totalidad.

### 🔧 Cambiado
- Escala visual del perfil lunar calibrada para proporciones realistas.
- Modal del simulador ampliado (max-width: 580px) para aprovechar el canvas mayor.
- Slider de tiempo reorganizado en layout horizontal con botón play integrado.
- Brillo del disco solar, corona y anillo de diamante reducidos para mayor realismo.

---

## [2.1.0] — 2026-05-07

### ✨ Añadido
- **Mejoras en el Simulador de Horizonte 3D**
  - Implementación de **Interpolación IDW** (Inverse Distance Weighting) para suavizar el relieve con datos dispersos.
  - Capa de **ruido fractal procedural** para micro-topografía realista.
  - Corrección de la **orientación geográfica** (Norte = -Z, Este = +X) para total coherencia con el mapa.
  - Nueva perspectiva panorámica con el observador en primer plano.
  - Radio de 20km sincronizado con el perfil topográfico del radar.
- **Educación y Seguridad**
  - Nuevo modal de ayuda educativa en el simulador de Perlas de Baily.
  - Explicación científica del fenómeno y refuerzo de las normas de seguridad visual.
- **Sistema de Changelog Dinámico**
  - El changelog de la aplicación ahora se carga directamente desde `CHANGELOG.md`.

---

## [2.0.0] — 2026-05-07

### ✨ Añadido

- **Simulador de Perlas de Baily (Limb Profile)**
  - Visualización interactiva del fenómeno de Perlas de Baily durante C2/C3.
  - Perfil de limbo lunar basado en datos reales **LOLA/SLDEM2015** (NASA LRO).
  - Generador Python (`scripts/generate_limb_profile.py`) que calcula el perfil usando armónicos esféricos con los parámetros exactos de libración del eclipse (l=+4.1°, b=-1.1°, c=17.0°).
  - Archivo de datos `lunar_limb_profile.js` con 720 puntos de corrección en arcsegundos.
  - Slider interactivo T-10s a T+10s para explorar la transición a la totalidad.
  - Efecto de Corona Solar con streamers durante la totalidad.
  - Efecto de Anillo de Diamante dinámico posicionado en la perla más brillante.
  - Indicador "LOLA/SLDEM2015" en el canvas para certificar el origen de los datos.

- **Simulador de Horizonte 3D (Three.js)**
  - Renderizado 3D del relieve local usando datos de `topography_data.js`.
  - Visualización de la posición del Sol en el momento máximo del eclipse.
  - Trayectoria solar proyectada sobre el horizonte 3D.
  - Integración con Three.js (WebGL) para renderizado en tiempo real.

- **Interfaz: Botones de simulación**
  - Nuevos botones "Perlas de Baily" y "Vista 3D" en el panel de información.
  - Modales con animaciones de entrada y diseño glassmorphism.

- **Versionado y Changelog**
  - Número de versión visible en la aplicación.
  - Acceso al changelog desde la interfaz.

### 🔧 Cambiado

- Reorganizado el pie del panel de información para incluir los nuevos simuladores.
- Añadida dependencia de Three.js (CDN) para renderizado WebGL.
- El estado del cálculo (posición solar, eclipse data) ahora se comparte con los módulos de simulación.

---

## [1.5.0] — 2026-05-06

### ✨ Añadido

- Migración del buscador de Nominatim a **Photon API** (komoot) para mejor relevancia.
- El marcador de localización ahora persiste al cerrar el panel de información.

---

## [1.4.0] — 2026-05-04

### ✨ Añadido

- **Mapa de nubes interactivo por año**: slider para navegar entre datos acumulados y anuales (2008-2025).
- Script `generate_cloud_heatmap_gee.py` actualizado para soportar extracción multi-año.

---

## [1.3.0] — 2026-05-02

### ✨ Añadido

- **Aviso de seguridad visual** contextual en el modal de detalle.
  - Adapta el mensaje según eclipse total o parcial.
  - Timeline visual de fases con indicación de uso de gafas.

### 🔧 Cambiado

- Icono del heatmap reemplazado (termómetro → cronómetro).
- Corregido el recorte de la imagen de perfil montañoso en el modal de ajustes móvil.

---

## [1.2.0] — 2026-05-01

### ✨ Añadido

- **Radar de Horizonte en Vivo**: perfil topográfico de 20km con detección de bloqueo por montañas.
- Alertas visuales de bloqueo orográfico en el panel de información.
- **Mapa de calor de duración de totalidad** (heatmap).
- Control de capas de mapa (Estándar, Satélite, Relieve).

---

## [1.1.0] — 2026-04-29

### ✨ Añadido

- **Motor Besseliano propio** (`besselian_calculator.js`) con corrección de altitud.
- **Corrección asimétrica de limbo lunar** con modelo polinómico (Norte/Sur independientes).
- Interpolación espacial de datos meteorológicos (promedio 10 años).

### 🔧 Cambiado

- Calibración del radio umbral (L2_CORRECTION) para sincronización visual-matemática.

---

## [1.0.0] — 2026-04-25

### ✨ Añadido

- Versión inicial de la aplicación.
- Mapa Leaflet con franja de totalidad GeoJSON.
- Panel de información con tiempos de contacto C1-C4.
- Animación de sombra umbral sobre el mapa.
- Buscador de localidades y geolocalización.
- Comparador de localidades.
- Countdown al eclipse.
- PWA (Service Worker + Manifest) para uso offline.
- Diseño responsive glassmorphism dark mode.
