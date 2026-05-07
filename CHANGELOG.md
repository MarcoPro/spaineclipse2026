# Changelog

Todos los cambios notables del proyecto Eclipse Solar España 2026.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y este proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

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
