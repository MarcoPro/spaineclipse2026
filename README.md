# ☀️🌑 Eclipse Solar España 2026

**Mapa interactivo de alta precisión** para el eclipse solar total del **12 de agosto de 2026** visible desde España.

Permite a cualquier usuario buscar su localidad (o hacer clic en el mapa) y obtener los **horarios exactos** de cada fase del eclipse, el porcentaje de oscurecimiento y si se encuentra dentro de la franja de totalidad.

---

## 🖥️ Demo

**Prueba la aplicación interactiva aquí:** [https://marcopro.github.io/spaineclipse2026/](https://marcopro.github.io/spaineclipse2026/)

![Vista general del mapa con la franja de totalidad y panel informativo](https://img.shields.io/badge/Status-En%20desarrollo-yellow?style=for-the-badge)

La aplicación muestra:

- 🗺️ **Múltiples Mapas Base** interactivos (Estándar, Satélite y Relieve Topográfico)
- ⚡ **Previsión Meteorológica Real Pregenerada (Open-Meteo)**: predicción numérico-climática en vivo para el día del eclipse con desglose de **Nubes Bajas, Medias y Altas (Cirros)**, temperatura y probabilidad de lluvia.
- 🟢 **Etiqueta Dinámica de Claridad**: interpretación automática del % de nubosidad (ej. *80% despejado - Óptimo*).
- 🕒 **Marca de Tiempo de Cálculo**: fecha y hora exacta en la que se calculó el pronóstico actual.
- ☁️ **Mapa de Nubes Histórico (Heatmap)**: basado en probabilidad estadística interactiva (Acumulado y por año, 2008-2025).
- ⛰️ **Análisis de Altitud 3D**, calculando el impacto de tu elevación (0-3000m) en los tiempos del eclipse.
- 📡 **Radar de Horizonte en Vivo**, generando gráficas de perfiles montañosos cruzados con la trayectoria del sol.
- ⭐ **Índice de Observación** (0-10): puntuación astrofísica objetiva con 5 criterios (duración, altitud solar, nubosidad prevista/histórica, horizonte, puesta de sol).
- 🌑 **Simulación de la sombra (Umbra)** animada en tiempo real.
- 💎 **Simulador de Perlas de Baily** con perfil lunar real y modos fotorrealista/técnico.
- 🔍 **Buscador de localidades** con autocompletado vía Photon (OpenStreetMap).
- 📍 **Geolocalización** para detectar tu posición automáticamente.
- 📊 **Panel informativo** con tiempos de contacto (C1–C4) ajustados a la curvatura terrestre.
- 🌅 **Alertas de visibilidad**: puesta de sol y montañas bloqueando la totalidad.
- 🐙 **Enlace al Repositorio Oficial en GitHub** en la barra principal de controles.
- 📱 **Diseño responsivo optimizado** para una visualización perfecta en iPhones (iOS/Safari) y dispositivos móviles.

---

## 🏗️ Estructura del Proyecto

### Archivos del Frontend (Web App)
- `index.html`: Punto de entrada principal. Contiene la estructura DOM, el modal de información y el contenedor del mapa.
- `app.js`: Motor principal de la aplicación. Maneja el mapa Leaflet, la geolocalización, la búsqueda, la animación de la sombra, el gráfico de horizonte, la previsión meteorológica real/histórica, el índice de observación y la interfaz.
- `besselian_calculator.js`: Motor matemático puro. Utiliza los elementos besselianos para calcular el instante exacto, duración y oscurecimiento con precisión de sub-segundos corrigiendo la altitud terrestre.
- `limb_simulator.js`: Simulador de Perlas de Baily con renderizado dual (fotorrealista y técnico) basado en el perfil real del limbo lunar.
- `lunar_limb_profile.js`: Perfil de elevación del limbo lunar real para el simulador de Perlas de Baily.
- `horizon_3d.js`: Motor de visualización 3D del terreno con interpolación IDW y ruido fractal procedural.
- `config.js`: Archivo de configuración centralizado (única fuente de la verdad, v2.5.0). Almacena los elementos besselianos, deltas de tiempo, y parámetros de conexión para APIs y capas topográficas.
- `styles.css`: Hoja de estilos principal con diseño *glassmorphism*, dark mode y diseño responsive optimizado para móviles e iPhones.
- `sw.js`: *Service Worker*. Cachea todos los archivos de la app para que funcione 100% offline (sin internet) el día del eclipse.
- `manifest.json`: Archivo de manifiesto que permite instalar la web como una app nativa en el móvil (PWA).

### Archivos de Datos (Generados / Estáticos)
- `events.json`: **Fuente única centralizada** de actividades, zonas de observación pública, observatorios, miradores y planetarios para el eclipse solar 2026.
- `weather_forecast_data.js`: Matriz estática pregenerada diariamente con la previsión numérico-climática (534 puntos de muestreo en España) de Open-Meteo (nubes totales, bajas, medias, cirros, precipitación, temp, fecha/hora de cálculo).
- `cloud_heatmap.js`: Matriz estadística con la probabilidad histórica de nubes en cada coordenada de la franja de totalidad (ERA5 Copernicus 2008-2025).
- `eclipse_data.js`: Contiene el polígono WGS84 de la franja de totalidad, ajustado por los algoritmos asimétricos del limbo lunar.
- `topography_data.js`: Cuadrícula con las altitudes locales (modelo SRTM) utilizada para los cálculos matemáticos de fase y precisión.
- `eclipse_2026.geojson`: El archivo crudo GeoJSON de la franja, ideal para exportar a QGIS o herramientas GIS de terceros.

### Scripts de Backend (Python)
- `scripts/generate_weather_forecast.py`: Generador diario de previsión meteorológica. Consulta la API de Open-Meteo sobre la franja de totalidad para el 12 de agosto de 2026 a las 18:00 UTC y genera `weather_forecast_data.js`.
- `scripts/generate_eclipse_geojson.py`: Motor de geometría espacial. Lee los elementos besselianos, genera la franja en WGS84 aplicando un modelo polinómico avanzado para los límites norte y sur, y crea el GeoJSON.
- `scripts/generate_topography_gee.py`: Se conecta a Google Earth Engine, escanea la franja del eclipse sobre el modelo SRTM de la Tierra y exporta la cuadrícula de altitudes.
- `scripts/generate_cloud_heatmap_gee.py`: Extrae y promedia 15 años de datos climáticos del modelo ERA5 (Copernicus) a través de Google Earth Engine para construir el mapa de probabilidad de nubes.

### Flujo de datos

```mermaid
graph LR
    A[Elementos Besselianos<br>NASA/Espenak] -->|Python| B[generate_eclipse_geojson.py]
    B --> C[eclipse_2026.geojson]
    B --> D[eclipse_data.js]
    D --> E[app.js]
    E -->|BesselianCalculator| F[Fases exactas y oscurecimiento<br>C1, C2, Max, C3, C4]
    E -->|Astronomy Engine| I[Posición solar y puesta de sol]
    E -->|Point-in-polygon| G[¿Totalidad Sí/No?]
    C -.->|Uso externo| H[QGIS / GIS tools]
```

---

## 🔬 Metodología científica

### Generación de la franja de totalidad

El script Python (`scripts/generate_eclipse_geojson.py`) calcula la geometría de la franja directamente desde los **Elementos Besselianos oficiales de NASA/Espenak**:

| Parámetro | Descripción |
|-----------|-------------|
| `X_COEFFS`, `Y_COEFFS` | Coordenadas del centro de la sombra en el plano fundamental |
| `D_COEFFS` | Declinación del eje de la sombra |
| `L2_COEFFS` | Radio del cono de sombra (penumbra exterior) |
| `MU_COEFFS` | Ángulo horario del eje |
| `DELTA_T` | Diferencia entre el Tiempo Terrestre (TT/TDT) y el Tiempo Universal (UT), fijado en **69.11 segundos** para ajustar la rotación de la Tierra. |

**Método de cálculo:**

1. **Línea central:** proyección directa `(x, y) → (lat, lon)` sobre elipsoide WGS84.
2. **Límites norte/sur:** para cada meridiano objetivo, se barren **todos los instantes** del eclipse. En cada instante se calcula dónde el borde del círculo umbral interseca ese meridiano. La latitud máxima encontrada es el límite norte real; la mínima es el límite sur.
3. **Corrección de limbo lunar (Efecto Embudo Asimétrico):** Los Elementos Besselianos clásicos asumen una Luna esférica perfecta, pero en la realidad, las montañas y valles del contorno lunar (Watts' profile) deforman la sombra proyectada. Para lograr replicar con máxima fidelidad los mapas astronómicos profesionales (como los de Xavier Jubier), hemos sustituido la clásica corrección fija de radio umbral (`L2`) por un motor de corrección matemático dinámico e independiente para los límites NORTE y SUR.
   Cada límite se deforma mediante un polinomio de segundo grado gobernado por 3 variables:
   - **`BASE`:** Determina el colchón de ensanchamiento o estrechamiento general.
   - **`SLOPE` (Pendiente):** Genera el efecto de "embudo" lineal a lo largo de la trayectoria. Como el tiempo `t` a lo largo de España discurre desde `~0.42` en Galicia hasta `~0.55` en el Mediterráneo, una pendiente negativa provoca que el ensanchamiento sea agresivo en la entrada noroeste y se vaya estrechando progresivamente hacia la salida este.
   - **`QUAD` (Curvatura Cuadrática):** Introduce una aceleración exponencial al embudo (`t²`), permitiendo crear límites cóncavos o convexos (por ejemplo, que la franja se estreche de golpe justo antes de salir al mar) para calcar con exactitud la topografía irregular del limbo lunar.
4. **Post-procesado:** recorte de extremos con ancho < 0.5° y suavizado con media móvil de 5 puntos.

**Precisión:** < 0.2 km vs tabla oficial NASA para la línea central.

### Topografía y Detección de Horizonte (Sistema Híbrido)

- **Precisión Altimétrica Offline (`topography_data.js`)**: El script `scripts/generate_topography_gee.py` extrae un mapa offline con la altitud sobre el nivel del mar a partir del modelo digital de elevaciones (SRTM). Al hacer clic en un valle o una montaña alta (ej. 2.500m), la aplicación introduce matemáticamente esa ganancia de altitud en las ecuaciones geométricas de Bessel para arrojar el segundo exacto en el que el cono de sombra de la Luna barrerá físicamente tu ubicación (en las alturas los contactos suceden fracciones de segundo antes).
- **Radar de Horizonte en Tiempo Real (Open-Meteo)**: Un sofisticado motor de *ray-casting* direccional. Al hacer clic, se calcula la posición del sol en el cielo (Azimut y Elevación). Acto seguido, dispara 20 trazadores a lo largo de 20 km sobre la superficie terrestre en la dirección óptica del Sol. Obtiene el perfil del terreno usando la API en vivo de Open-Meteo Elevation, corrige la curvatura de la Tierra de las montañas, y grafica un perfil del terreno contra la línea de visión del Sol informando de forma visual (y mediante alertas) si la montaña cortará el eclipse o no.

### Meteorología (Previsión Real vs Climatología Histórica)

El sistema incorpora un modelo dual meteorológico offline-first:

- **Previsión Meteorológica Real Pregenerada (Open-Meteo API):** El script `scripts/generate_weather_forecast.py` realiza un muestreo espacial de alta resolución (534 puntos) sobre toda la franja de totalidad en España para el 12 de agosto de 2026 a las 18:00 UTC. Genera `weather_forecast_data.js` desglosando:
  - **Nubes Bajas y Medias:** Nubes densas opacas que tapan completamente el disco solar.
  - **Nubes Altas (Cirros):** Nubes translúcidas compuestas de cristales de hielo que permiten visibilidad parcial de la corona.
  - **Probabilidad de lluvia, temperatura y fecha/hora exacta del cálculo.**
- **Mapa Histórico de Nubes (Climatología ERA5):** El script `scripts/generate_cloud_heatmap_gee.py` extrae 15 años de datos históricos del reanálisis climático ERA5 (Copernicus / ECMWF) a través de Google Earth Engine, permitiendo explorar la evolución estadística de 2008 a 2025 mediante un slider interactivo.

### Cálculos en el frontend

El frontend utiliza un **Motor Matemático Propio (`besselian_calculator.js`)** basado en los Elementos Besselianos para calcular en tiempo real y con precisión de sub-segundos (aplicando correcciones por altitud local):

- **Fases de contacto exactas** (C1–C4) para cualquier coordenada.
- **Oscurecimiento máximo** del disco solar.

Adicionalmente, se sigue empleando la librería **[Astronomy Engine](https://github.com/cosinekitty/astronomy)**, pero **únicamente** para:

- **Posición del Sol** (Azimut y Elevación) en el instante máximo del eclipse.
- **Puesta de sol** local, para lanzar alertas si coincide con la fase del eclipse.

La **determinación estricta de totalidad** usa un test **point-in-polygon** (ray casting) contra el polígono GeoJSON como fuente de verdad, ya que el polígono contiene las asimetrías y deformaciones exactas de la sombra por el relieve lunar.

### Índice de Observación del Eclipse (Score 0–10)

El sistema implementa una **puntuación objetiva de 0 a 10** basada en criterios astrofísicos para evaluar la calidad de observación en cualquier coordenada:

| Criterio | Peso | Método |
|----------|------|--------|
| **Duración de totalidad** | 3.0 pts (30%) | Lineal: 0s → 0 pts, 100s+ → 3.0 pts |
| **Altitud solar** | 1.5 pts (15%) | Lineal: 0° → 0 pts, 20°+ → 1.5 pts |
| **Cielo despejado** | 2.0 pts (20%) | Curva potencial (exp. 1.5) sobre la previsión real o histórico IDW |
| **Horizonte libre** | 2.0 pts (20%) | Escalonado por altitud: bloqueo a ≤5° = 0 pts, a ≤10° = 0.4 pts |
| **Puesta de sol** | 1.5 pts (15%) | Puesta astronómica + bloqueo orográfico como puesta efectiva |

**Reglas especiales:**
- **Previsión Real Prioritaria:** Por defecto, el criterio de cielo despejado utiliza la nubosidad de la **Previsión Real**. Si el usuario cambia a la pestaña *Histórico ERA5*, la puntuación se recalcula en tiempo real adaptándose a los datos climatológicos.
- **Eclipses parciales** reciben puntuación **0** (sin totalidad = sin valor de observación para un evento de eclipse total).
- Los criterios **horizonte** y **puesta de sol** están **correlacionados**: si el terreno bloquea el sol, ambos se penalizan simultáneamente.

---

## 🛠️ Stack tecnológico

| Tecnología | Uso |
|------------|-----|
| **HTML5 / CSS3 / JavaScript** | Frontend puro, sin frameworks |
| **[Leaflet](https://leafletjs.com/)** v1.9.4 | Mapa interactivo |
| **[Astronomy Engine](https://github.com/cosinekitty/astronomy)** v2.1.19 | Posición solar y ocaso |
| **[Photon](https://photon.komoot.io/)** | Geocodificación directa e inversa |
| **[OpenStreetMap](https://www.openstreetmap.org/)** | Tiles del mapa base |
| **Python 3** | Generación offline de datos GeoJSON |
| **[Font Awesome](https://fontawesome.com/)** v6.4 | Iconografía |
| **[Google Fonts](https://fonts.google.com/)** (Outfit) | Tipografía |

---

## 🚀 Uso

### Visualizar la aplicación

Simplemente abre `index.html` en un navegador moderno. No requiere servidor ni compilación.

```bash
# Opción 1: abrir directamente
open index.html

# Opción 2: servidor local (recomendado para evitar restricciones CORS)
python3 -m http.server 8080
# Navega a http://localhost:8080
```

### Regenerar los datos GeoJSON

Si necesitas recalcular la franja de totalidad (por ejemplo, tras ajustar la corrección de limbo lunar):

```bash
python3 scripts/generate_eclipse_geojson.py
```

Esto genera:
- `eclipse_2026.geojson` — GeoJSON estándar
- `eclipse_data.js` — Variable JS exportada para carga directa en el frontend

### Regenerar los datos de Meteorología y Relieve

**Generar Previsión Meteorológica Real (Actualización Diaria Offline):**
```bash
python3 scripts/generate_weather_forecast.py
```
> **📡 Previsión Meteorológica numérico-climática en vivo (Open-Meteo API):** Genera la cobertura de nubes prevista para el 12 de agosto de 2026 (desglosada en nubes bajas, medias y altas), probabilidad de precipitación y temperatura. Produce el archivo estático `weather_forecast_data.js` para un funcionamiento 100% offline sin llamadas AJAX en tiempo de ejecución.

**Generar Nubes Históricas:**
```bash
python3 scripts/generate_cloud_heatmap_gee.py
```
> **⚖️ Fuentes y Atribución (Open Data):** Los datos climáticos utilizan el modelo de reanálisis horario ERA5 (Copernicus/ECMWF). Procesados a través de **Google Earth Engine**. Produce el archivo `cloud_heatmap.js`.

**Generar Topografía:**
```bash
python3 scripts/generate_topography_gee.py
```
> **ℹ️ Nota:** Usa el modelo SRTM90_V4 vía Google Earth Engine. Produce la matriz base de cálculo `topography_data.js`.

---

## 🎨 Diseño

La interfaz utiliza un enfoque **dark mode** con estética de **glassmorphism**:

- Paneles con `backdrop-filter: blur(16px)` y bordes translúcidos
- Paleta oscura (`#0a0b10`) con acentos dorados (`#ffcc00`) que evocan la corona solar
- Tipografía moderna [Outfit](https://fonts.google.com/specimen/Outfit) con pesos variados
- Animaciones suaves (`cubic-bezier`) en transiciones y apariciones
- Diseño responsive con breakpoint a 600px

---

## 📚 Referencias

- [Elementos Besselianos del eclipse — NASA/Espenak](https://eclipse.gsfc.nasa.gov/SEbeselm/SEbeselm2001/SE2026Aug12Tbeselm.html)
- [Astronomy Engine — Don Cross](https://github.com/cosinekitty/astronomy)
- [Xavier Jubier — Interactive Eclipse Maps](http://xjubier.free.fr/en/site_pages/solar_eclipses/TSE_2026_GoogleMapFull.html)
- [TimeAndDate — Eclipse 2026](https://www.timeanddate.com/eclipse/solar/2026-august-12)

---

## 📄 Licencia

Este proyecto es de uso personal y educativo.

---

> **Nota:** Todos los horarios se muestran en hora local española (Europe/Madrid, CEST — UTC+2 en agosto).
