document.addEventListener("DOMContentLoaded", () => {
    // Configuración global para Astronomy Engine: 
    // Forzar el valor Delta T para agosto de 2026 (69.10s) para sincronizar con el script de Python y Jubier
    if (window.Astronomy) {
        window.Astronomy.SetDeltaTFunction(function () {
            return 69.1;
        });
    }

    // --- COUNTDOWN TIMER ---
    const ECLIPSE_DATE = new Date('2026-08-12T18:28:00Z'); // Approximate peak UTC
    const countdownText = document.getElementById('countdown-text');
    const countdownBadge = document.getElementById('countdown-badge');

    function updateCountdown() {
        const now = new Date();
        const diff = ECLIPSE_DATE - now;

        if (diff <= 0) {
            countdownBadge.classList.add('hidden');
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        countdownText.innerHTML =
            `<span class="cd-number">${days}</span><span class="cd-unit">d</span> ` +
            `<span class="cd-number">${String(hours).padStart(2, '0')}</span><span class="cd-unit">h</span> ` +
            `<span class="cd-number">${String(minutes).padStart(2, '0')}</span><span class="cd-unit">m</span> ` +
            `<span class="cd-number">${String(seconds).padStart(2, '0')}</span><span class="cd-unit">s</span>`;
    }

    updateCountdown();
    setInterval(updateCountdown, 1000);

    // Elements
    const searchInput = document.getElementById("search-input");
    const searchResults = document.getElementById("search-results");
    const searchLoading = document.getElementById("search-loading");
    const btnGeolocation = document.getElementById("btn-geolocation");

    // --- MOBILE MENU ---
    const btnMobileMenu = document.getElementById("btn-mobile-menu");
    const headerControls = document.getElementById("header-controls");

    if (btnMobileMenu && headerControls) {
        btnMobileMenu.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent map click
            headerControls.classList.toggle('show');
            const icon = btnMobileMenu.querySelector('i');
            if (headerControls.classList.contains('show')) {
                icon.className = 'fa-solid fa-xmark';
            } else {
                icon.className = 'fa-solid fa-bars';
            }
        });

        // Close menu if clicked outside
        document.addEventListener('click', (e) => {
            if (!headerControls.contains(e.target) && !btnMobileMenu.contains(e.target)) {
                headerControls.classList.remove('show');
                btnMobileMenu.querySelector('i').className = 'fa-solid fa-bars';
            }
        });
    }

    const infoPanel = document.getElementById("info-panel");
    const closePanelBtn = document.getElementById("close-panel");
    const introMessage = document.getElementById("intro-message");
    const closeIntroBtn = document.getElementById("close-intro");

    let currentMarker = null;
    let currentSunLine = null;

    // State for simulations
    let lastEclipseData = null;
    let lastLocation = { name: 'Palencia', lat: 42.0096, lng: -4.5288, alt: 0, az: 0 };
    window.lastLocation = lastLocation;
    let lastScoreState = null;

    // --- LEAFLET MAP INITIALIZATION ---
    // Madrid center as default
    const map = L.map('map', { zoomControl: false }).setView([40.4168, -3.7038], 6);
    window.map = map;
    window.eclipseMap = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Capas base
    const standardMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        subdomains: 'abc',
        maxZoom: 19
    });

    const topoMap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
    });

    const satelliteMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    // Añadir topográfico por defecto porque ahora el relieve es vital
    topoMap.addTo(map);

    // Control de capas
    const baseMaps = {
        "Mapa Topográfico (Relieve)": topoMap,
        "Mapa Estándar": standardMap,
        "Satélite": satelliteMap
    };
    L.control.layers(baseMaps).addTo(map);

    // --- GEOJSON ASTRONOMICAL PATH REPRESENTATION (WGS84) ---
    // Load rigorous topologic data calculated directly from Ephemerides on backend.
    // Variable 'eclipseGeoJSON' is natively loaded via eclipse_data.js to bypass file:// CORS blocks.
    let totalityPolygon = null; // Ring de coordenadas del polígono de totalidad
    if (typeof eclipseGeoJSON !== 'undefined') {
        L.geoJSON(eclipseGeoJSON, {
            style: function (feature) {
                return feature.properties;
            }
        }).addTo(map);
        // Extraer el polígono de totalidad para point-in-polygon tests
        const bandFeature = eclipseGeoJSON.features.find(f => f.geometry.type === 'Polygon');
        if (bandFeature) {
            totalityPolygon = bandFeature.geometry.coordinates[0]; // ring [lon, lat]
        }
    } else {
        console.error("No se pudo cargar la variable eclipseGeoJSON. Asegúrate de incluir eclipse_data.js");
    }

    // Ray-casting point-in-polygon test
    function isInsideTotalityBand(lat, lng) {
        if (!totalityPolygon) return false;
        let inside = false;
        for (let i = 0, j = totalityPolygon.length - 1; i < totalityPolygon.length; j = i++) {
            const xi = totalityPolygon[i][1], yi = totalityPolygon[i][0]; // lat, lon
            const xj = totalityPolygon[j][1], yj = totalityPolygon[j][0];
            if (((yi > lng) !== (yj > lng)) &&
                (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    // Click on map to get coords
    map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        // Close search results if open
        searchResults.classList.add('hidden');
        reverseGeocode(lat, lng);
    });

    // --- NOMINATIM SEARCH IMPLEMENTATION ---
    let searchTimeout = null;

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();

        clearTimeout(searchTimeout);

        if (query.length < 3) {
            searchResults.classList.add('hidden');
            searchLoading.classList.add('hidden');
            return;
        }

        searchLoading.classList.remove('hidden');

        searchTimeout = setTimeout(() => {
            fetchLocations(query);
        }, 500); // 500ms debounce
    });

    async function fetchLocations(query) {
        try {
            // Request more results to allow for post-filtering
            const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&bbox=-18.2,27.6,4.4,43.8&limit=15`);
            const data = await response.json();

            // Filter strictly for Spain
            let spanishResults = (data.features || []).filter(f => {
                const props = f.properties;
                return props.countrycode === 'ES' ||
                    (props.country && props.country.toLowerCase().includes('españa')) ||
                    (props.country && props.country.toLowerCase().includes('spain'));
            });

            // Keep only the top 5 relevant results
            spanishResults = spanishResults.slice(0, 5);

            displaySearchResults(spanishResults);
        } catch (error) {
            console.error("Error fetching locations:", error);
            // Hide loading on error
            searchLoading.classList.add('hidden');
        }
    }

    function displaySearchResults(results) {
        searchLoading.classList.add('hidden');
        searchResults.innerHTML = '';

        if (!results || results.length === 0) {
            searchResults.innerHTML = '<div class="search-result-item"><span class="res-context">No se encontraron resultados</span></div>';
            searchResults.classList.remove('hidden');
            return;
        }

        const seenSignatures = new Set();

        results.forEach(pos => {
            // Extract a nice name from Photon GeoJSON
            const props = pos.properties;
            const coords = pos.geometry.coordinates; // [lng, lat]

            const name = props.name || props.city || props.town || props.village || props.locality || "Ubicación";

            const contextParts = [];
            if (props.city && props.city !== name) contextParts.push(props.city);
            if (props.state && props.state !== name) contextParts.push(props.state);
            if (props.country && props.country !== name) contextParts.push(props.country);

            const context = contextParts.join(', ') || props.country || "España";

            // Avoid duplicate results (e.g., city center vs railway station with the same name)
            const signature = `${name}|${context}`;
            if (seenSignatures.has(signature)) return;
            seenSignatures.add(signature);

            const div = document.createElement('div');
            div.className = 'search-result-item';

            div.innerHTML = `
                <span class="res-name">${name}</span>
                <span class="res-context">${context}</span>
            `;

            div.addEventListener('click', () => {
                selectLocation(parseFloat(coords[1]), parseFloat(coords[0]), name, context);
                searchResults.classList.add('hidden');
                searchInput.value = name;
            });

            searchResults.appendChild(div);
        });

        searchResults.classList.remove('hidden');
    }

    async function reverseGeocode(lat, lng) {
        searchLoading.classList.remove('hidden');
        try {
            const response = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`);
            const data = await response.json();
            searchLoading.classList.add('hidden');

            if (data && data.features && data.features.length > 0) {
                const props = data.features[0].properties;
                const name = props.city || props.town || props.village || props.locality || props.name || "Ubicación Seleccionada";

                const contextParts = [];
                if (props.city && props.city !== name) contextParts.push(props.city);
                if (props.state && props.state !== name) contextParts.push(props.state);
                if (props.country && props.country !== name) contextParts.push(props.country);

                const context = contextParts.join(', ') || props.country || "España";

                selectLocation(lat, lng, name, context);
            } else {
                selectLocation(lat, lng, `Lat: ${lat.toFixed(3)}, Lng: ${lng.toFixed(3)}`, "España");
            }
        } catch (error) {
            console.error("Geocoding error", error);
            searchLoading.classList.add('hidden');
            selectLocation(lat, lng, "Ubicación Desconocida", "");
        }
    }

    function selectLocation(lat, lng, name, context) {
        // Move map
        map.flyTo([lat, lng], 10, { duration: 1.5 });

        // Add Marker
        if (currentMarker) {
            map.removeLayer(currentMarker);
        }

        // Custom neon marker
        const markerSvg = `<div style="background-color: var(--accent-neon); width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 0 10px 4px rgba(255, 204, 0, 0.4), inset 0 0 4px rgba(0,0,0,0.5); border: 2px solid #fff;"></div>`;
        const icon = L.divIcon({
            className: 'custom-div-icon',
            html: markerSvg,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });

        currentMarker = L.marker([lat, lng], { icon: icon }).addTo(map);

        // Hide intro, show loading state on panel if we want, then calculate
        introMessage.classList.add('hidden');

        // Calculate Eclipse
        calculateEclipse(lat, lng, name, context);
    }

    // --- GEOLOCATION ---
    btnGeolocation.addEventListener('click', () => {
        if ("geolocation" in navigator) {
            btnGeolocation.classList.add('fa-beat-fade');
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    btnGeolocation.classList.remove('fa-beat-fade');
                    reverseGeocode(position.coords.latitude, position.coords.longitude);
                },
                (error) => {
                    btnGeolocation.classList.remove('fa-beat-fade');
                    alert("No se pudo obtener tu ubicación. Por favor, asegúrate de haber dado permisos.");
                }
            );
        } else {
            alert("Tu navegador no soporta geolocalización.");
        }
    });

    closePanelBtn.addEventListener('click', () => {
        infoPanel.classList.add('hidden');
        // Hide score tooltip (it lives in body, outside the panel)
        const tooltip = document.getElementById('score-tooltip');
        if (tooltip) tooltip.classList.remove('visible');
    });

    closeIntroBtn.addEventListener('click', () => {
        introMessage.classList.add('hidden');
    });

    // --- POINTS OF INTEREST & ACTIVITIES ---
    const btnPois = document.getElementById('btn-pois');
    let poiLayerGroup = null;
    let poisVisible = false;

    const poiTypeLabels = {
        public_zone: 'Zona de Observación Pública',
        event: 'Evento Organizado',
        observatory: 'Observatorio',
        viewpoint: 'Mirador',
        planetarium: 'Planetario'
    };

    async function loadEventsData() {
        try {
            const res = await fetch('events.json');
            if (res.ok) {
                return await res.json();
            }
        } catch (e) {
            console.warn('Could not fetch events.json:', e);
        }
        return [];
    }

    async function createPOIMarkers() {
        const eventsList = await loadEventsData();
        if (!eventsList || !eventsList.length) return;

        poiLayerGroup = L.layerGroup();

        eventsList.forEach((poi) => {
            const iconClass = poi.icon || 'fa-location-dot';
            const icon = L.divIcon({
                className: '',
                html: `<div class="poi-marker"><i class="fa-solid ${iconClass}"></i></div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
                popupAnchor: [0, -20]
            });

            const typeLabel = poi.category || poiTypeLabels[poi.type] || poi.type;
            const locationStr = poi.town ? `${poi.town} (${poi.province})` : (poi.province ? poi.province : '');

            let urlHtml = '';
            if (poi.url) {
                urlHtml = `
                    <a href="${poi.url}" target="_blank" rel="noopener" class="poi-popup-url-btn" style="display: flex; align-items: center; justify-content: center; gap: 5px; background: rgba(52, 152, 219, 0.15); color: #3498db; border: 1px solid rgba(52, 152, 219, 0.3); padding: 5px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 600; text-decoration: none; margin-bottom: 6px; transition: all 0.2s ease;">
                        <i class="fa-solid fa-up-right-from-square"></i> Ver programa / Web oficial
                    </a>
                `;
            }

            let regHtml = '';
            if (poi.registration_required) {
                regHtml = `
                    <div style="font-size: 0.68rem; color: #f1c40f; background: rgba(241,196,15,0.15); padding: 2px 6px; border-radius: 4px; margin-bottom: 6px; display: inline-flex; align-items: center; gap: 4px; font-weight: 500;">
                        <i class="fa-solid fa-ticket"></i> Requiere inscripción previa
                    </div>
                `;
            }

            const popupContent = `
                <div class="poi-popup-title">${poi.name}</div>
                <div class="poi-popup-type"><i class="fa-solid ${iconClass}"></i> ${typeLabel}</div>
                ${locationStr ? `<div style="font-size: 0.72rem; color: #a4b0be; margin-bottom: 4px;"><i class="fa-solid fa-location-dot"></i> ${locationStr}</div>` : ''}
                <div class="poi-popup-desc" style="margin-bottom: 8px;">${poi.description}</div>
                ${regHtml}
                ${urlHtml}
                <button class="poi-popup-btn" onclick="document.dispatchEvent(new CustomEvent('poi-calc', {detail: {lat: ${poi.lat}, lng: ${poi.lng}, name: '${poi.name.replace(/'/g, "\\'")}'}}))">
                    <i class="fa-solid fa-calculator"></i> Ver datos del eclipse
                </button>
            `;

            const marker = L.marker([poi.lat, poi.lng], { icon })
                .bindPopup(popupContent, {
                    className: 'poi-popup',
                    maxWidth: 300
                });

            poiLayerGroup.addLayer(marker);
        });

        if (poisVisible && poiLayerGroup) {
            poiLayerGroup.addTo(map);
        }
    }

    createPOIMarkers();

    // Listen for POI calculation requests
    document.addEventListener('poi-calc', (e) => {
        const { lat, lng, name } = e.detail;
        map.closePopup();
        reverseGeocode(lat, lng);
    });

    btnPois.addEventListener('click', () => {
        poisVisible = !poisVisible;
        btnPois.classList.toggle('active', poisVisible);

        if (poisVisible && poiLayerGroup) {
            poiLayerGroup.addTo(map);
        } else if (poiLayerGroup) {
            map.removeLayer(poiLayerGroup);
        }
    });

    // --- SHADOW ANIMATION ---
    const shadowControls = document.getElementById('shadow-controls');
    const shadowPlayBtn = document.getElementById('shadow-play');
    const shadowPlayIcon = document.getElementById('shadow-play-icon');
    const shadowSlider = document.getElementById('shadow-slider');
    const shadowTimeEl = document.getElementById('shadow-time');
    const btnShadowAnim = document.getElementById('btn-shadow-anim');

    let shadowCircle = null;
    let shadowPlaying = false;
    let shadowAnimFrame = null;
    let shadowCenterCoords = []; // [lon, lat] from GeoJSON
    let shadowFrames = [];
    if (typeof eclipseGeoJSON !== 'undefined') {
        const lineFeature = eclipseGeoJSON.features.find(f => f.geometry.type === 'LineString');
        if (lineFeature) {
            shadowCenterCoords = lineFeature.geometry.coordinates; // [lon, lat]
        }
        if (eclipseGeoJSON.shadow_frames) {
            shadowFrames = eclipseGeoJSON.shadow_frames;
        }
    }

    function shadowTimeFromFraction(frac) {
        if (!eclipseGeoJSON.shadow_times || eclipseGeoJSON.shadow_times.length === 0) return "--:--:--";
        const idx = frac * (eclipseGeoJSON.shadow_times.length - 1);
        const i = Math.floor(idx);
        const t = idx - i;
        const utHoursA = eclipseGeoJSON.shadow_times[Math.min(i, eclipseGeoJSON.shadow_times.length - 1)];
        const utHoursB = eclipseGeoJSON.shadow_times[Math.min(i + 1, eclipseGeoJSON.shadow_times.length - 1)];

        const utHours = utHoursA + t * (utHoursB - utHoursA);
        const cestHours = utHours + 2; // CEST = UTC+2 in August
        const h = Math.floor(cestHours);
        const m = Math.floor((cestHours - h) * 60);
        const s = Math.floor(((cestHours - h) * 60 - m) * 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function interpolatePath(frac) {
        if (shadowCenterCoords.length === 0) return null;
        const idx = frac * (shadowCenterCoords.length - 1);
        const i = Math.floor(idx);
        const t = idx - i;
        const a = shadowCenterCoords[Math.min(i, shadowCenterCoords.length - 1)];
        const b = shadowCenterCoords[Math.min(i + 1, shadowCenterCoords.length - 1)];
        return {
            lat: a[1] + t * (b[1] - a[1]),
            lng: a[0] + t * (b[0] - a[0]),
            index: idx
        };
    }

    function resamplePolygon(points, numPoints) {
        if (!points || points.length === 0) return [];
        if (points.length === 1) {
            return new Array(numPoints).fill([points[0][1], points[0][0]]);
        }

        let totalLen = 0;
        const lengths = [0];
        for (let i = 0; i < points.length - 1; i++) {
            const dx = points[i + 1][0] - points[i][0];
            const dy = points[i + 1][1] - points[i][1];
            const dist = Math.sqrt(dx * dx + dy * dy);
            totalLen += dist;
            lengths.push(totalLen);
        }

        const resampled = [];
        for (let i = 0; i < numPoints; i++) {
            const targetLen = (i / (numPoints - 1)) * totalLen;
            let seg = 0;
            while (seg < lengths.length - 2 && targetLen > lengths[seg + 1]) {
                seg++;
            }
            const segStartLen = lengths[seg];
            const segEndLen = lengths[seg + 1];
            const t = segEndLen === segStartLen ? 0 : (targetLen - segStartLen) / (segEndLen - segStartLen);

            const lng = points[seg][0] + t * (points[seg + 1][0] - points[seg][0]);
            const lat = points[seg][1] + t * (points[seg + 1][1] - points[seg][1]);
            resampled.push([lat, lng]);
        }
        return resampled;
    }

    function updateShadowPosition(frac) {
        if (!shadowFrames || shadowFrames.length === 0) return;

        const idx = frac * (shadowFrames.length - 1);
        const i = Math.floor(idx);
        const t = idx - i;

        const frameA = shadowFrames[Math.min(i, shadowFrames.length - 1)];
        const frameB = shadowFrames[Math.min(i + 1, shadowFrames.length - 1)];

        if (!frameA || frameA.length === 0) {
            if (shadowCircle) shadowCircle.setLatLngs([]);
            shadowTimeEl.textContent = shadowTimeFromFraction(frac);
            return;
        }

        let currentPoints = [];
        if (t === 0 || !frameB || frameB.length === 0) {
            currentPoints = frameA.map(p => [p[1], p[0]]);
        } else {
            const resA = resamplePolygon(frameA, 60);
            const resB = resamplePolygon(frameB, 60);
            for (let k = 0; k < 60; k++) {
                const lat = resA[k][0] + t * (resB[k][0] - resA[k][0]);
                const lng = resA[k][1] + t * (resB[k][1] - resA[k][1]);
                currentPoints.push([lat, lng]);
            }
        }

        if (!shadowCircle) {
            shadowCircle = L.polygon(currentPoints, {
                color: 'rgba(255, 204, 0, 0.35)',
                fillColor: 'rgba(10, 11, 16, 0.5)',
                fillOpacity: 0.5,
                weight: 1.5,
                dashArray: '8, 4'
            }).addTo(map);
        } else {
            shadowCircle.setLatLngs(currentPoints);
        }

        shadowTimeEl.textContent = shadowTimeFromFraction(frac);
    }

    function shadowAnimLoop() {
        if (!shadowPlaying) return;
        let val = parseInt(shadowSlider.value);
        val += 2; // Speed: 2 units per frame out of 1000
        if (val > 1000) {
            val = 0; // Loop
        }
        shadowSlider.value = val;
        updateShadowPosition(val / 1000);
        shadowAnimFrame = requestAnimationFrame(shadowAnimLoop);
    }

    function startShadowAnimation() {
        shadowControls.classList.remove('hidden');
        introMessage.classList.add('hidden');

        // Zoom to fit the path
        if (shadowCenterCoords.length > 0) {
            const lats = shadowCenterCoords.map(c => c[1]);
            const lngs = shadowCenterCoords.map(c => c[0]);
            map.fitBounds([
                [Math.min(...lats), Math.min(...lngs)],
                [Math.max(...lats), Math.max(...lngs)]
            ], { padding: [60, 60] });
        }

        // Initialize at start
        shadowSlider.value = 0;
        updateShadowPosition(0);

        // Auto-play
        shadowPlaying = true;
        shadowPlayIcon.className = 'fa-solid fa-pause';
        shadowAnimLoop();
    }

    function stopShadowAnimation() {
        shadowPlaying = false;
        shadowPlayIcon.className = 'fa-solid fa-play';
        if (shadowAnimFrame) {
            cancelAnimationFrame(shadowAnimFrame);
            shadowAnimFrame = null;
        }
        if (shadowCircle) {
            map.removeLayer(shadowCircle);
            shadowCircle = null;
        }
        shadowControls.classList.add('hidden');
    }

    btnShadowAnim.addEventListener('click', () => {
        if (shadowControls.classList.contains('hidden')) {
            startShadowAnimation();
        } else {
            stopShadowAnimation();
        }
    });

    shadowPlayBtn.addEventListener('click', () => {
        if (shadowPlaying) {
            shadowPlaying = false;
            shadowPlayIcon.className = 'fa-solid fa-play';
            if (shadowAnimFrame) cancelAnimationFrame(shadowAnimFrame);
        } else {
            shadowPlaying = true;
            shadowPlayIcon.className = 'fa-solid fa-pause';
            shadowAnimLoop();
        }
    });

    shadowSlider.addEventListener('input', () => {
        // Pause on manual scrub
        if (shadowPlaying) {
            shadowPlaying = false;
            shadowPlayIcon.className = 'fa-solid fa-play';
            if (shadowAnimFrame) cancelAnimationFrame(shadowAnimFrame);
        }
        updateShadowPosition(parseInt(shadowSlider.value) / 1000);
    });

    document.getElementById('shadow-close').addEventListener('click', stopShadowAnimation);

    // --- ASTRONOMY CALCULATIONS ---
    function getElevation(lat, lng) {
        if (!window.topographyData || window.topographyData.length === 0) return 0;
        let nearest = null;
        let minDist = Infinity;
        for (const pt of window.topographyData) {
            const dist = haversineDist(lat, lng, pt.lat, pt.lng);
            if (dist < minDist) {
                minDist = dist;
                nearest = pt;
            }
        }
        if (minDist > 10) return 0;
        return nearest.alt || 0;
    }

    function calculateEclipse(lat, lng, name, context) {
        if (!window.Astronomy || !window.BesselianCalculator) {
            console.error("Astronomy Engine o BesselianCalculator no cargados.");
            return;
        }

        const localElev = getElevation(lat, lng);

        // Astronomy observer for sun position/sunset
        const observer = new window.Astronomy.Observer(lat, lng, localElev);

        // Usar BesselianCalculator para las fases exactas sincronizadas con el mapa
        const eclipse = window.BesselianCalculator.calculateLocalCircumstances(lat, lng, localElev);

        if (eclipse && eclipse.peak) {
            // Guardar estado para simuladores y herramientas astronómicas
            lastEclipseData = eclipse;

            window.currentEclipseDetails = {
                isTotality: Boolean(eclipse.total_begin && eclipse.total_end),
                c1: eclipse.c1,
                c2: eclipse.c2 || eclipse.total_begin,
                c3: eclipse.c3 || eclipse.total_end,
                c4: eclipse.c4,
                max: eclipse.peak,
                c2Date: eclipse.total_begin ? eclipse.total_begin.time.date : null,
                c3Date: eclipse.total_end ? eclipse.total_end.time.date : null
            };

            const equ_peak = window.Astronomy.Equator('Sun', eclipse.peak.time.date, observer, true, true);
            const hor_peak = window.Astronomy.Horizon(eclipse.peak.time.date, observer, equ_peak.ra, equ_peak.dec, 'normal');
            lastLocation = { name: name || 'Ubicación Seleccionada', lat, lng, alt: hor_peak.altitude, az: hor_peak.azimuth, elevation: localElev };
            window.lastLocation = lastLocation;

            drawSunDirection(lat, lng, eclipse.peak.time.date, localElev);
            renderEclipseInfo(eclipse, observer, name, context, localElev);
            checkHorizonBlockage(lat, lng, localElev, eclipse.peak.time.date, observer);
        } else {
            if (currentSunLine) map.removeLayer(currentSunLine);
            alert("No hay eclipse total o parcial visible en esta fecha para esta ubicación.");
        }
    }

    function drawSunDirection(lat, lng, peakDate, elev) {
        if (currentSunLine) map.removeLayer(currentSunLine);

        const observer = new window.Astronomy.Observer(lat, lng, elev);
        const equ_peak = window.Astronomy.Equator('Sun', peakDate, observer, true, true);
        const hor_peak = window.Astronomy.Horizon(peakDate, observer, equ_peak.ra, equ_peak.dec, 'normal');

        const sunAzimuth = hor_peak.azimuth;

        // Trazamos una línea de 20km (la misma distancia que escanea el radar del horizonte)
        const dest = calculateDestinationPoint(lat, lng, 20, sunAzimuth);

        currentSunLine = L.polyline([
            [lat, lng],
            [dest.lat, dest.lng]
        ], {
            color: '#f1c40f',
            weight: 3,
            dashArray: '5, 8',
            opacity: 0.9
        }).addTo(map);
    }

    // --- ECLIPSE DISC VISUALIZATION ---
    function drawEclipseDisc(obscurationFraction) {
        const canvas = document.getElementById('eclipse-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const r = w / 2 - 8; // Sun radius with padding

        ctx.clearRect(0, 0, w, h);

        // Draw sun with radial gradient (corona effect)
        const sunGrad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
        sunGrad.addColorStop(0, '#fff8e1');
        sunGrad.addColorStop(0.4, '#ffcc00');
        sunGrad.addColorStop(0.75, '#ff9900');
        sunGrad.addColorStop(1, '#e65100');
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = sunGrad;
        ctx.fill();

        // Outer glow
        const glowGrad = ctx.createRadialGradient(cx, cy, r, cx, cy, r + 6);
        glowGrad.addColorStop(0, 'rgba(255, 204, 0, 0.3)');
        glowGrad.addColorStop(1, 'rgba(255, 204, 0, 0)');
        ctx.beginPath();
        ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
        ctx.fillStyle = glowGrad;
        ctx.fill();

        // Draw moon overlay
        // Moon moves from right (0% obscuration) to overlapping center (100%)
        const moonR = r * 1.02; // Moon slightly larger than sun
        const maxOffset = r * 2; // Fully off to the right
        const moonOffset = maxOffset * (1 - obscurationFraction);
        const moonX = cx + moonOffset;

        ctx.beginPath();
        ctx.arc(moonX, cy, moonR, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0b10';
        ctx.fill();

        // If total: draw corona ring around moon edge
        if (obscurationFraction >= 1.0) {
            const coronaGrad = ctx.createRadialGradient(cx, cy, moonR - 2, cx, cy, moonR + 10);
            coronaGrad.addColorStop(0, 'rgba(255, 204, 0, 0)');
            coronaGrad.addColorStop(0.3, 'rgba(255, 204, 0, 0.5)');
            coronaGrad.addColorStop(0.6, 'rgba(255, 180, 0, 0.2)');
            coronaGrad.addColorStop(1, 'rgba(255, 204, 0, 0)');
            ctx.beginPath();
            ctx.arc(cx, cy, moonR + 10, 0, Math.PI * 2);
            ctx.fillStyle = coronaGrad;
            ctx.fill();
        }
    }

    function haversineDist(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // --- ECLIPSE OBSERVATION SCORE ---
    // Scoring system based on objective astrophysical criteria.
    // Total eclipses: max 10 points across 5 criteria.
    // Partial eclipses: score = 0 (no totality = no observation value for a total eclipse event).
    //
    // Criteria weights (total = 10):
    //   1. Duration of totality:    3.0 pts (30%)
    //   2. Solar altitude:          1.0 pts (10%)
    //   3. Cloud probability:       3.0 pts (30%)
    //   4. Horizon obstruction:     2.0 pts (20%)
    //   5. Sunset interference:     1.0 pts (10%)
    //
    function calculateObservationScore(eclipse, observer, inBand, sunAltitude, cloudPct, isHorizonBlocked, warningSunset, sunsetDate, maxHorizonAngle) {
        // Default maxHorizonAngle to 0 if not provided (terrain check not done yet)
        maxHorizonAngle = maxHorizonAngle || 0;
        const criteria = [];

        if (inBand && eclipse.total_begin && eclipse.total_end) {
            // --- TOTAL ECLIPSE SCORING (5 criteria, sum = 10) ---

            // 1. DURATION OF TOTALITY (0–3.0 pts)
            // Rationale: The most important factor. Longer totality = more observation time.
            // Uses power curve (exp 1.5) so full score is only reached at maximum duration.
            // Ceiling at 110s (theoretical max). 100s→2.7pts, 80s→1.9pts, 60s→1.2pts
            const durationSec = (eclipse.total_end.time.date - eclipse.total_begin.time.date) / 1000;
            const durationFraction = Math.min(1, durationSec / 110);
            const durationScore = Math.pow(durationFraction, 1.5) * 3.0;
            criteria.push({
                icon: 'fa-clock',
                label: 'Duración totalidad',
                detail: `${Math.round(durationSec)}s`,
                pts: durationScore,
                max: 3.0,
                color: '#2ecc71'
            });

            // 2. SOLAR ALTITUDE (0–1.0 pts)
            // Rationale: Higher sun = less atmospheric extinction, better contrast for corona.
            // Ceiling at 11°: full score from 11°+ (realistic max for this eclipse in Spain).
            const altScore = Math.min(1.0, Math.max(0, (sunAltitude / 11) * 1.0));
            criteria.push({
                icon: 'fa-arrows-up-to-line',
                label: 'Altitud solar',
                detail: `${sunAltitude.toFixed(1)}°`,
                pts: altScore,
                max: 1.0,
                color: '#f1c40f'
            });

            // 3. CLOUD PROBABILITY (0–3.0 pts)
            // Rationale: Historical cloud cover or real forecast is the primary risk factor.
            // Effective range: 85%+ clear (≤15% nubes) = full score, ≤20% clear (≥80% nubes) = 0.
            // Remapped from [20%–85% clear] → [0–1], then power curve (1.5).
            let cloudScore = 0;
            if (cloudPct !== null && !isNaN(cloudPct)) {
                const clearPct = 100 - cloudPct;
                // Remap: ≤20% clear → 0, ≥85% clear → 1.0
                const effectiveClear = Math.max(0, Math.min(1, (clearPct - 20) / 65));
                cloudScore = Math.pow(effectiveClear, 1.5) * 3.0;
            } else {
                cloudScore = 1.5; // Unknown: neutral
            }
            const sourceLabelStr = (typeof currentForecastMode !== 'undefined' && currentForecastMode === 'forecast') ? 'Previsión Real' : 'Histórico ERA5';
            criteria.push({
                icon: 'fa-cloud-sun',
                label: 'Cielo despejado',
                detail: cloudPct !== null && !isNaN(cloudPct) ? `${Math.round(100 - cloudPct)}% despejado (${sourceLabelStr})` : 'Sin datos (Fuera de cobertura)',
                pts: cloudScore,
                max: 3.0,
                color: '#3498db'
            });

            // 4. HORIZON OBSTRUCTION (0–2.0 pts)
            // Rationale: At low-to-moderate sun altitudes, terrain can PHYSICALLY BLOCK the view.
            // This is especially critical in mountainous areas (Picos de Europa, Pirineos).
            // - Sun > 20°: horizon almost irrelevant, full score
            // - Sun ≤ 20°: terrain matters. Blockage penalty scales with altitude:
            //   - Sun 0-5°: catastrophic (lose 2.0 pts)
            //   - Sun 5-10°: severe (lose 1.6 pts)
            //   - Sun 10-15°: serious (lose 1.2 pts)
            //   - Sun 15-20°: moderate (lose 0.8 pts)
            let horizonScore = 2.0;
            let horizonDetail = 'Despejado';
            if (sunAltitude <= 20) {
                if (isHorizonBlocked) {
                    if (sunAltitude <= 5) {
                        horizonScore = 0;
                        horizonDetail = '⚠ Bloqueado (crítico)';
                    } else if (sunAltitude <= 10) {
                        horizonScore = 0.4;
                        horizonDetail = '⚠ Bloqueado (grave)';
                    } else if (sunAltitude <= 15) {
                        horizonScore = 0.8;
                        horizonDetail = '⚠ Bloqueado';
                    } else {
                        horizonScore = 1.2;
                        horizonDetail = '⚠ Parcialmente bloqueado';
                    }
                } else {
                    horizonDetail = 'Sin obstrucción';
                }
            } else {
                horizonDetail = 'Sol alto (N/A)';
            }
            criteria.push({
                icon: 'fa-mountain-sun',
                label: 'Horizonte libre',
                detail: horizonDetail,
                pts: horizonScore,
                max: 2.0,
                color: '#e67e22'
            });

            // 5. SUNSET INTERFERENCE (0–1.0 pts)
            // Rationale: If the sun sets before the eclipse finishes, the observation experience
            // is degraded. This includes:
            //   a) Astronomical sunset during eclipse phases
            //   b) Terrain blockage at peak (isHorizonBlocked)
            //   c) Terrain that will block the sun as it DESCENDS during partial phases
            let sunsetScore = 1.0;
            let sunsetDetail = 'Eclipse completo visible';

            if (isHorizonBlocked) {
                // Case B: Mountains already block the sun at peak — catastrophic
                if (sunAltitude <= 5) {
                    sunsetScore = 0;
                    sunsetDetail = '⚠ Sol oculto por terreno';
                } else if (sunAltitude <= 10) {
                    sunsetScore = 0.2;
                    sunsetDetail = '⚠ Terreno oculta el sol bajo';
                } else {
                    sunsetScore = 0.4;
                    sunsetDetail = 'Riesgo de ocultación por terreno';
                }
            } else if (maxHorizonAngle > 2) {
                // Case C: Sun at peak is above mountains, but as the sun descends
                // during the partial phase after totality, it will drop behind terrain.
                if (maxHorizonAngle >= 9) {
                    sunsetScore = 0.1;
                    sunsetDetail = '⚠ Montañas a ' + maxHorizonAngle.toFixed(0) + '° ocultan parcialidad';
                } else if (maxHorizonAngle >= 5) {
                    sunsetScore = 0.5;
                    sunsetDetail = 'Montañas a ' + maxHorizonAngle.toFixed(0) + '° recortarán fase final';
                } else {
                    sunsetScore = 0.8;
                    sunsetDetail = 'Horizonte elevado a ' + maxHorizonAngle.toFixed(0) + '°';
                }
            } else if (warningSunset && sunsetDate) {
                // Case A: Astronomical sunset interferes
                const totalBeginTime = eclipse.total_begin.time.date.getTime();
                const totalEndTime = eclipse.total_end.time.date.getTime();
                const sunsetTime = sunsetDate.getTime();
                const partialEndTime = eclipse.partial_end ? eclipse.partial_end.time.date.getTime() : totalEndTime + 3600000;

                if (sunsetTime <= totalBeginTime) {
                    sunsetScore = 0;
                    sunsetDetail = '⚠ Sol puesto antes de totalidad';
                } else if (sunsetTime <= totalEndTime) {
                    sunsetScore = 0;
                    sunsetDetail = '⚠ Sol se pone durante totalidad';
                } else if (sunsetTime <= totalEndTime + 600000) {
                    sunsetScore = 0.2;
                    sunsetDetail = 'Puesta < 10min tras totalidad';
                } else if (sunsetTime <= totalEndTime + 1800000) {
                    sunsetScore = 0.5;
                    sunsetDetail = 'Fase parcial recortada';
                } else if (sunsetTime < partialEndTime) {
                    sunsetScore = 0.7;
                    sunsetDetail = 'Puesta antes de C4';
                }
            } else if (!sunsetDate) {
                sunsetScore = 1.0;
                sunsetDetail = 'Sin datos';
            }

            criteria.push({
                icon: 'fa-sun',
                label: 'Puesta de sol',
                detail: sunsetDetail,
                pts: sunsetScore,
                max: 1.0,
                color: '#e74c3c'
            });

        } else {
            // --- PARTIAL ECLIPSE: NO SCORE ---
            criteria.push({
                icon: 'fa-circle-half-stroke',
                label: 'Sin totalidad',
                detail: `${(eclipse.obscuration * 100).toFixed(0)}% oscurec.`,
                pts: 0,
                max: 10.0,
                color: '#636e72'
            });

            return {
                score: 0,
                isPartial: true,
                criteria,
                totalPts: 0,
                totalMax: 10.0
            };
        }

        // Sum total
        const totalPts = criteria.reduce((sum, c) => sum + c.pts, 0);
        const totalMax = criteria.reduce((sum, c) => sum + c.max, 0);
        // Normalize to 0-10 scale
        const score10 = totalMax > 0 ? (totalPts / totalMax) * 10 : 0;

        return {
            score: Math.round(score10 * 10) / 10, // 1 decimal
            isPartial: false,
            criteria,
            totalPts,
            totalMax
        };
    }

    function updateScoreBadge(scoreResult) {
        const badge = document.getElementById('eclipse-score-badge');
        const valueEl = document.getElementById('score-value');
        const breakdownEl = document.getElementById('score-breakdown');

        if (!badge || !valueEl || !breakdownEl) return;

        const score = scoreResult.score;

        // Remove all tier classes
        badge.classList.remove('score-excellent', 'score-good', 'score-fair', 'score-poor', 'score-none');

        if (scoreResult.isPartial) {
            // Partial eclipse: show dash, grey style
            valueEl.textContent = '—';
            badge.classList.add('score-none');

            breakdownEl.innerHTML = `
                <div class="score-criterion">
                    <div class="score-criterion-header">
                        <span class="score-criterion-label">
                            <i class="fa-solid fa-circle-half-stroke" style="color: #636e72;"></i>
                            Fuera de la franja de totalidad
                        </span>
                    </div>
                    <div style="font-size: 0.7rem; color: #636e72; margin-top: 4px; line-height: 1.4;">
                        Esta ubicación solo experimenta un eclipse parcial (${scoreResult.criteria[0] && scoreResult.criteria[0].detail ? scoreResult.criteria[0].detail : ''}). 
                        Sin totalidad, no es posible observar la corona solar, las Perlas de Baily ni el anillo de diamante.
                        La puntuación solo se calcula para ubicaciones dentro de la franja de totalidad.
                    </div>
                </div>
            `;
        } else {
            valueEl.textContent = score.toFixed(1);

            // Assign color tier
            if (score >= 8) {
                badge.classList.add('score-excellent');
            } else if (score >= 5.5) {
                badge.classList.add('score-good');
            } else if (score >= 3) {
                badge.classList.add('score-fair');
            } else {
                badge.classList.add('score-poor');
            }

            // Build breakdown HTML
            breakdownEl.innerHTML = scoreResult.criteria.map(c => {
                const pctFill = c.max > 0 ? (c.pts / c.max) * 100 : 0;
                return `
                    <div class="score-criterion">
                        <div class="score-criterion-header">
                            <span class="score-criterion-label">
                                <i class="fa-solid ${c.icon}" style="color: ${c.color};"></i>
                                ${c.label}
                                <span style="opacity:0.5; font-weight:400;">(${c.detail})</span>
                            </span>
                            <span class="score-criterion-pts" style="color: ${c.color};">${c.pts.toFixed(1)}/${c.max.toFixed(1)}</span>
                        </div>
                        <div class="score-criterion-bar">
                            <div class="score-criterion-fill" style="width: ${pctFill}%; background: ${c.color};"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        badge.classList.remove('hidden');
    }

    // --- Score tooltip positioning (appended to body, fully independent) ---
    (function initScoreTooltip() {
        const badge = document.getElementById('eclipse-score-badge');
        const tooltip = document.getElementById('score-tooltip');
        if (!badge || !tooltip) return;

        // Move tooltip to body so it's outside the scrollable info-panel
        document.body.appendChild(tooltip);

        function showTooltip() {
            const rect = badge.getBoundingClientRect();
            const tooltipWidth = window.innerWidth < 600 ? 280 : 310;

            // Position directly below the badge
            let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
            let top = rect.bottom + 8;

            // Clamp horizontal to viewport
            if (left < 8) left = 8;
            if (left + tooltipWidth > window.innerWidth - 8) left = window.innerWidth - tooltipWidth - 8;

            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
            tooltip.style.bottom = 'auto';
            tooltip.style.width = tooltipWidth + 'px';

            // Arrow points at badge center
            const arrowLeft = (rect.left + rect.width / 2) - left;
            tooltip.style.setProperty('--arrow-left', arrowLeft + 'px');

            tooltip.classList.add('visible');
        }

        function hideTooltip() {
            tooltip.classList.remove('visible');
        }

        badge.addEventListener('mouseenter', showTooltip);
        badge.addEventListener('mouseleave', hideTooltip);
        badge.addEventListener('touchstart', function(e) {
            e.preventDefault();
            if (tooltip.classList.contains('visible')) {
                hideTooltip();
            } else {
                showTooltip();
            }
        });
    })();

    function renderEclipseInfo(eclipse, observer, name, context, localElev) {
        // Usar el polígono GeoJSON como fuente de verdad para la totalidad.
        // Astronomy Engine usa un modelo de sombra ligeramente diferente.
        const inBand = isInsideTotalityBand(observer.latitude, observer.longitude);

        // Obscuration: si está fuera de la banda, limitar a <100%
        let obscuration = eclipse.obscuration;
        if (!inBand && obscuration >= 1.0) {
            obscuration = 0.999; // Ajustar para reflejar que NO es total
        }
        const obscurationPercent = (obscuration * 100).toFixed(1);

        // Draw visual disc
        drawEclipseDisc(obscuration);

        // Determinar tipo: usar polígono como autoridad
        let eclipseTypeStr;
        const isLocallyTotal = inBand;

        if (inBand) {
            eclipseTypeStr = "Total";
        } else {
            eclipseTypeStr = "Parcial";
        }

        // Time formatter
        const timeFmt = new Intl.DateTimeFormat('es-ES', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Madrid'
        });

        const timeC1 = eclipse.partial_begin ? timeFmt.format(eclipse.partial_begin.time.date) : '--:--:--';
        const timeC2 = (isLocallyTotal && eclipse.total_begin) ? timeFmt.format(eclipse.total_begin.time.date) : '--:--:--';
        const timePeak = eclipse.peak ? timeFmt.format(eclipse.peak.time.date) : '--:--:--';
        const timeC3 = (isLocallyTotal && eclipse.total_end) ? timeFmt.format(eclipse.total_end.time.date) : '--:--:--';
        const timeC4 = eclipse.partial_end ? timeFmt.format(eclipse.partial_end.time.date) : '--:--:--';

        // Sincronizar datos oficiales exactos para las herramientas astronómicas (Reloj Día D y Pase de Observación)
        window.currentEclipseDetails = {
            isTotality: isLocallyTotal,
            c1: { timeStr: timeC1, date: eclipse.partial_begin ? eclipse.partial_begin.time.date : null },
            c2: { timeStr: timeC2, date: (isLocallyTotal && eclipse.total_begin) ? eclipse.total_begin.time.date : null },
            max: { timeStr: timePeak, date: eclipse.peak ? eclipse.peak.time.date : null },
            c3: { timeStr: timeC3, date: (isLocallyTotal && eclipse.total_end) ? eclipse.total_end.time.date : null },
            c4: { timeStr: timeC4, date: eclipse.partial_end ? eclipse.partial_end.time.date : null },
            c1Date: eclipse.partial_begin ? eclipse.partial_begin.time.date : null,
            c2Date: (isLocallyTotal && eclipse.total_begin) ? eclipse.total_begin.time.date : null,
            maxDate: eclipse.peak ? eclipse.peak.time.date : null,
            c3Date: (isLocallyTotal && eclipse.total_end) ? eclipse.total_end.time.date : null,
            c4Date: eclipse.partial_end ? eclipse.partial_end.time.date : null
        };

        // Calculate durations
        let phaseDurationObj = { m: '--', s: '--' };
        if (isLocallyTotal && eclipse.total_begin && eclipse.total_end) {
            let diffMs = eclipse.total_end.time.date - eclipse.total_begin.time.date;

            phaseDurationObj = formatDuration(diffMs);

            // Si la duración cae a 0, actualizar las horas C2/C3 para coincidir con CMax
            if (diffMs === 0 && eclipse.peak) {
                const timeFmt = new Intl.DateTimeFormat('es-ES', {
                    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Madrid'
                });
                const peakStr = timeFmt.format(eclipse.peak.time.date);
                document.getElementById('time-c2').textContent = peakStr;
                document.getElementById('time-c3').textContent = peakStr;
            }
        }

        let totalDurationObj = { h: '--', m: '--' };
        if (eclipse.partial_begin && eclipse.partial_end) {
            const diffMs = eclipse.partial_end.time.date - eclipse.partial_begin.time.date;
            totalDurationObj = formatDurationHoursMinutes(diffMs);
        }

        // Sunset calculation
        const peakDate = eclipse.peak.time.date;
        const sunsetSearchStart = new Date(peakDate);
        sunsetSearchStart.setHours(0, 0, 0, 0);
        // Find sunset (-1 means set)
        const sunsetDateObj = window.Astronomy.SearchRiseSet('Sun', observer, -1, sunsetSearchStart, 1);
        const sunsetDate = sunsetDateObj ? sunsetDateObj.date : null;

        let warningSunset = false;
        let sunsetTimeStr = "--:--";
        if (sunsetDate) {
            sunsetTimeStr = timeFmt.format(sunsetDate);
            // If sunset happens before partial_end
            if (eclipse.partial_end && sunsetDate < eclipse.partial_end.time.date) {
                warningSunset = true;
            }
        }

        // Update DOM
        document.getElementById('locality-name').textContent = name;
        document.getElementById('region-name').textContent = context || 'España';

        const elevBadge = document.getElementById('elevation-badge');
        const elevValue = document.getElementById('elevation-value');
        if (localElev > 0) {
            elevValue.textContent = localElev;
            elevBadge.classList.remove('hidden');
        } else {
            elevBadge.classList.add('hidden');
        }

        document.getElementById('eclipse-type').textContent = `Fase ${eclipseTypeStr}`;

        document.getElementById('obscuration-value').textContent = obscurationPercent;

        // Contact times
        document.getElementById('time-c1').textContent = timeC1;
        document.getElementById('time-max').textContent = timePeak;
        document.getElementById('time-c4').textContent = timeC4;

        // C2/C3: only show for total eclipses
        const stepC2 = document.getElementById('step-c2');
        const stepC3 = document.getElementById('step-c3');
        const btnBeadsSim = document.getElementById('btn-beads-sim');
        if (isLocallyTotal) {
            document.getElementById('time-c2').textContent = timeC2;
            document.getElementById('time-c3').textContent = timeC3;
            stepC2.classList.remove('hidden');
            stepC3.classList.remove('hidden');
            if (btnBeadsSim) btnBeadsSim.style.display = '';
        } else {
            stepC2.classList.add('hidden');
            stepC3.classList.add('hidden');
            if (btnBeadsSim) btnBeadsSim.style.display = 'none';
        }

        document.getElementById('duration-totality').textContent = isLocallyTotal ? `${phaseDurationObj.m}m ${phaseDurationObj.s}s` : '0m 0s (Sin totalidad)';
        document.getElementById('duration-total').textContent = `${totalDurationObj.h}h ${totalDurationObj.m}m`;

        const warningEl = document.getElementById('sunset-warning');
        if (warningSunset) {
            document.getElementById('sunset-time').textContent = sunsetTimeStr;
            warningEl.classList.remove('hidden');
        } else {
            warningEl.classList.add('hidden');
        }

        // Adjust badge color
        const badge = document.getElementById('eclipse-type');
        if (isLocallyTotal) {
            badge.style.background = 'rgba(255, 204, 0, 0.15)';
            badge.style.color = 'var(--accent-neon)';
            badge.style.borderColor = 'rgba(255, 204, 0, 0.3)';
        } else {
            badge.style.background = 'rgba(255, 255, 255, 0.05)';
            badge.style.color = '#fff';
            badge.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        }

        // --- SAFETY WARNING (GLASSES) ---
        const safetyHeader = document.getElementById('safety-header');
        const safetyShieldIcon = document.getElementById('safety-shield-icon');
        const safetyHeaderText = document.getElementById('safety-header-text');
        const safetyIconBg = document.getElementById('safety-icon-bg');
        const safetyGlassesIcon = document.getElementById('safety-glasses-icon');
        const safetyTitle = document.getElementById('safety-title');
        const safetyDesc = document.getElementById('safety-desc');

        const safetyTimelineContainer = document.getElementById('safety-timeline-container');

        if (isLocallyTotal) {
            safetyHeader.style.background = 'rgba(46, 204, 113, 0.2)';
            safetyShieldIcon.style.color = '#2ecc71';
            safetyHeaderText.style.color = '#2ecc71';
            safetyIconBg.style.background = 'rgba(46, 204, 113, 0.1)';
            safetyGlassesIcon.style.color = '#2ecc71';
            safetyTitle.textContent = 'Gafas durante fase parcial';
            safetyDesc.innerHTML = 'Las gafas hay que usarlas durante todo el eclipse <strong>salvo en los minutos de totalidad</strong>.';

            if (safetyTimelineContainer) {
                safetyTimelineContainer.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 5px; background: rgba(0,0,0,0.2); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; width: 30%;">
                            <i class="fa-solid fa-glasses" style="color: #e74c3c; font-size: 1.1rem;"></i>
                            <span style="font-size: 0.65rem; color: #a4b0be; text-transform: uppercase; text-align: center;">Fase Parcial<br><strong style="color: #e74c3c;">Gafas SÍ</strong></span>
                        </div>
                        <i class="fa-solid fa-chevron-right" style="color: rgba(255,255,255,0.2); font-size: 0.8rem;"></i>
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; width: 30%;">
                            <i class="fa-solid fa-eye" style="color: #2ecc71; font-size: 1.1rem;"></i>
                            <span style="font-size: 0.65rem; color: #a4b0be; text-transform: uppercase; text-align: center;">Totalidad<br><strong style="color: #2ecc71;">Gafas NO</strong></span>
                        </div>
                        <i class="fa-solid fa-chevron-right" style="color: rgba(255,255,255,0.2); font-size: 0.8rem;"></i>
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; width: 30%;">
                            <i class="fa-solid fa-glasses" style="color: #e74c3c; font-size: 1.1rem;"></i>
                            <span style="font-size: 0.65rem; color: #a4b0be; text-transform: uppercase; text-align: center;">Fase Parcial<br><strong style="color: #e74c3c;">Gafas SÍ</strong></span>
                        </div>
                    </div>
                `;
            }
        } else {
            safetyHeader.style.background = 'rgba(231, 76, 60, 0.2)';
            safetyShieldIcon.style.color = '#e74c3c';
            safetyHeaderText.style.color = '#e74c3c';
            safetyIconBg.style.background = 'rgba(231, 76, 60, 0.1)';
            safetyGlassesIcon.style.color = '#e74c3c';
            safetyTitle.textContent = 'Uso permanente de gafas';
            safetyDesc.innerHTML = 'Al ser un eclipse parcial, las gafas deberían usarse <strong>durante todo el eclipse</strong> sin quitárselas en ningún momento.';

            if (safetyTimelineContainer) {
                safetyTimelineContainer.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: center; padding: 12px 5px; background: rgba(0,0,0,0.2); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                            <div style="display: flex; gap: 15px; align-items: center;">
                                <i class="fa-solid fa-glasses" style="color: #e74c3c; font-size: 1.2rem;"></i>
                                <i class="fa-solid fa-chevron-right" style="color: rgba(231, 76, 60, 0.5); font-size: 0.9rem;"></i>
                                <i class="fa-solid fa-glasses" style="color: #e74c3c; font-size: 1.2rem;"></i>
                                <i class="fa-solid fa-chevron-right" style="color: rgba(231, 76, 60, 0.5); font-size: 0.9rem;"></i>
                                <i class="fa-solid fa-glasses" style="color: #e74c3c; font-size: 1.2rem;"></i>
                            </div>
                            <span style="font-size: 0.75rem; color: #a4b0be; text-transform: uppercase; text-align: center; letter-spacing: 0.5px; margin-top: 2px;">Durante todo el eclipse: <strong style="color: #e74c3c;">Gafas SÍ</strong></span>
                        </div>
                    </div>
                `;
            }
        }

        // --- SUN POSITION AT PEAK ---
        if (eclipse.peak && window.Astronomy) {
            const peakTime = eclipse.peak.time.date;
            // Get Sun's actual equatorial coordinates, then convert to horizontal
            const equ = window.Astronomy.Equator('Sun', peakTime, observer, true, true);
            const horizon = window.Astronomy.Horizon(peakTime, observer, equ.ra, equ.dec, 'normal');
            const alt = horizon.altitude;
            const az = horizon.azimuth;

            document.getElementById('sun-altitude').textContent = `${alt.toFixed(1)}°`;
            document.getElementById('sun-azimuth').textContent = `${az.toFixed(1)}°`;

            // Human-readable direction (16-point compass)
            const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
            const dirIndex = Math.round(az / 22.5) % 16;
            document.getElementById('sun-direction').textContent = `Mirar al ${dirs[dirIndex]}`;

            // Animate compass needle (azimuth: 0=N, 90=E, 180=S, 270=W)
            const needle = document.getElementById('compass-needle');
            needle.style.transform = `translate(-50%, -100%) rotate(${az}deg)`;

            // Position sun icon on compass edge
            const sunIcon = document.getElementById('compass-sun-icon');
            const compassR = 30; // radius in px
            const azRad = (az - 90) * Math.PI / 180; // CSS: 0deg=top, convert
            const iconX = 36 + compassR * Math.cos(azRad);
            const iconY = 36 + compassR * Math.sin(azRad);
            sunIcon.style.left = `${iconX - 5}px`;
            sunIcon.style.top = `${iconY - 5}px`;
        }

        // --- WEATHER / CLIMATE DATA ---
        updateWeatherData(observer.latitude, observer.longitude);

        // --- OBSERVATION SCORE ---
        // Get cloud percentage for scoring (supports historical vs real forecast mode)
        const cloudPctForScore = getEffectiveCloudPct(observer.latitude, observer.longitude, currentForecastMode);
        // Sun altitude already computed above as `alt` (or from hor_peak)
        let sunAltForScore = 0;
        if (eclipse.peak && window.Astronomy) {
            const peakTimeScore = eclipse.peak.time.date;
            const equScore = window.Astronomy.Equator('Sun', peakTimeScore, observer, true, true);
            const horScore = window.Astronomy.Horizon(peakTimeScore, observer, equScore.ra, equScore.dec, 'normal');
            sunAltForScore = horScore.altitude;
        }

        // Initial score (horizon blockage unknown yet, assume clear)
        const initialScore = calculateObservationScore(
            eclipse, observer, inBand, sunAltForScore, cloudPctForScore, false, warningSunset, sunsetDate
        );
        updateScoreBadge(initialScore);

        // Store state so horizon check can re-score
        lastScoreState = {
            eclipse, observer, inBand, sunAltForScore, cloudPctForScore, warningSunset, sunsetDate
        };

        // Save for comparison
        lastEclipseResult = {
            name: name,
            type: eclipseTypeStr,
            obscuration: obscurationPercent,
            peak: timePeak,
            totalityDuration: isLocallyTotal ? `${phaseDurationObj.m}m ${phaseDurationObj.s}s` : '—',
            eclipseDuration: `${totalDurationObj.h}h ${totalDurationObj.m}m`
        };

        // Show panel
        infoPanel.classList.remove('hidden');
    }

    // --- HORIZON BLOCKAGE ---
    async function checkHorizonBlockage(lat, lng, observerElev, peakTime, observer) {
        const horizonWarning = document.getElementById('horizon-warning');
        const horizonContainer = document.getElementById('horizon-container');
        const horizonSpinner = document.getElementById('horizon-spinner');
        const canvas = document.getElementById('horizon-canvas');

        if (!horizonWarning || !horizonContainer || !horizonSpinner || !canvas) return;

        horizonWarning.classList.add('hidden');
        horizonContainer.classList.add('hidden');

        // Limpiar el canvas preventivamente
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Calcula posición del sol en el máximo
        const equ_peak = window.Astronomy.Equator('Sun', peakTime, observer, true, true);
        const hor_peak = window.Astronomy.Horizon(peakTime, observer, equ_peak.ra, equ_peak.dec, 'normal');

        const sunAzimuth = hor_peak.azimuth;
        const sunAltitude = hor_peak.altitude;

        // Si el sol ya está muy alto o se ha puesto
        if (sunAltitude > 20 || sunAltitude < 0) return;

        // Mostrar contenedor y spinner
        horizonContainer.classList.remove('hidden');
        horizonSpinner.classList.remove('hidden');

        // Generar 40 puntos a lo largo del azimut (0.5km a 20km)
        const points = [];
        // Insertamos el punto de origen (el observador) como el primer punto
        points.push({ lat: lat, lng: lng });
        for (let d = 0.5; d <= 20; d += 0.5) {
            points.push(calculateDestinationPoint(lat, lng, d, sunAzimuth));
        }

        const lats = points.map(p => p.lat.toFixed(4)).join(',');
        const lons = points.map(p => p.lng.toFixed(4)).join(',');

        try {
            const apiEndpoint = window.EclipseConfig.topography ? window.EclipseConfig.topography.api_endpoint : "https://api.open-meteo.com/v1/elevation";
            const url = `${apiEndpoint}?latitude=${lats}&longitude=${lons}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data && data.elevation) {
                let isBlocked = false;
                let maxHorizonAngle = 0; // Maximum angle any mountain subtends from observer
                // La elevación real del observador según la misma API (evita fallos si la local es 0)
                const apiObserverElev = data.elevation[0];
                const adjustedElevations = [apiObserverElev]; // Para la gráfica

                for (let i = 1; i < data.elevation.length; i++) {
                    const distKm = i * 0.5; // Porque el índice 0 es el observador, paso 0.5km
                    const mountainElev = data.elevation[i];

                    // Corrección de la curvatura de la tierra aprox: h_drop = (d^2) / (2R)
                    const earthDrop = (distKm * distKm) / (2 * 6371) * 1000;
                    const apparentMountainElev = mountainElev - earthDrop;
                    adjustedElevations.push(apparentMountainElev);

                    if (mountainElev > apiObserverElev) {
                        const deltaH = mountainElev - apiObserverElev;
                        const effectiveDeltaH = deltaH - earthDrop;

                        const mountainAngle = Math.atan2(effectiveDeltaH, distKm * 1000) * (180 / Math.PI);

                        // Track the maximum horizon angle from any mountain
                        if (mountainAngle > maxHorizonAngle) {
                            maxHorizonAngle = mountainAngle;
                        }

                        if (mountainAngle >= sunAltitude) {
                            isBlocked = true;
                        }
                    }
                }

                if (isBlocked) {
                    horizonWarning.classList.remove('hidden');
                }

                // Re-calculate observation score with actual horizon data
                // Pass maxHorizonAngle so sunset scoring can detect partial-phase blockage
                if (lastScoreState) {
                    const updatedScore = calculateObservationScore(
                        lastScoreState.eclipse,
                        lastScoreState.observer,
                        lastScoreState.inBand,
                        lastScoreState.sunAltForScore,
                        lastScoreState.cloudPctForScore,
                        isBlocked,
                        lastScoreState.warningSunset,
                        lastScoreState.sunsetDate,
                        maxHorizonAngle
                    );
                    updateScoreBadge(updatedScore);
                }

                drawHorizonProfile(canvas, adjustedElevations, apiObserverElev, sunAltitude, data.elevation);
            }
        } catch (e) {
            console.error("Error al comprobar horizonte:", e);
        } finally {
            horizonSpinner.classList.add('hidden');
        }
    }

    function drawHorizonProfile(canvas, elevations, observerElev, sunAltitude, rawElevations) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;

        ctx.clearRect(0, 0, W, H);
        if (!elevations || elevations.length === 0) return;

        // Calcular el perfil de la montaña vs la línea del sol
        let minElev = Math.min(...elevations);

        // Rayo del sol a lo largo de 20 km
        const sunRayElevations = [];
        for (let i = 0; i < elevations.length; i++) {
            const distKm = i * 0.5;
            const rayElev = observerElev + (distKm * 1000) * Math.tan(sunAltitude * Math.PI / 180);
            sunRayElevations.push(rayElev);
        }

        let maxElev = Math.max(...elevations, ...sunRayElevations);

        let rawRange = maxElev - minElev;
        if (rawRange < 100) rawRange = 100; // Evitar gráficos planos sin escala

        // Margen visual proporcional
        minElev = minElev - (rawRange * 0.20) - 10;
        maxElev = maxElev + (rawRange * 0.10) + 50;
        const range = maxElev - minElev;

        // --- Layout parameters ---
        const padLeft = 35;
        const padBottom = 20;
        const padTop = 15;
        const padRight = 10;
        const w = W - padLeft - padRight;
        const h = H - padTop - padBottom;

        const getY = (elev) => padTop + h - ((elev - minElev) / range) * h;
        const getX = (index) => padLeft + (index / (elevations.length - 1)) * w;

        // --- 1. Dibujar Cuadrícula y Ejes ---
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '9px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        // Grid Y (Altitud)
        const yStepOptions = [50, 100, 200, 500, 1000, 2000, 5000];
        let yStep = yStepOptions[yStepOptions.length - 1];
        for (const step of yStepOptions) {
            if (range / step <= 5) {
                yStep = step;
                break;
            }
        }

        let startY = Math.ceil(minElev / yStep) * yStep;
        for (let yVal = startY; yVal <= maxElev; yVal += yStep) {
            const py = getY(yVal);
            // linea
            ctx.beginPath();
            ctx.moveTo(padLeft, py);
            ctx.lineTo(W - padRight, py);
            ctx.stroke();
            // texto
            ctx.fillText(`${yVal}m`, padLeft - 4, py);
        }

        // Grid X (Distancia)
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let xKm = 0; xKm <= 20; xKm += 5) { // 0, 5, 10, 15, 20
            const px = getX(xKm * 2);
            // linea
            ctx.beginPath();
            ctx.moveTo(px, padTop);
            ctx.lineTo(px, H - padBottom);
            ctx.stroke();
            // texto
            ctx.fillText(`${xKm}km`, px, H - padBottom + 4);
        }

        // Ejes X e Y sólidos
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        // Eje Y
        ctx.moveTo(padLeft, padTop);
        ctx.lineTo(padLeft, H - padBottom);
        // Eje X
        ctx.lineTo(W - padRight, H - padBottom);
        ctx.stroke();


        // --- 2. Dibujar el Sol y su rayo ---
        ctx.beginPath();
        ctx.moveTo(getX(0), getY(sunRayElevations[0]));
        ctx.lineTo(getX(elevations.length - 1), getY(sunRayElevations[sunRayElevations.length - 1]));
        ctx.strokeStyle = 'rgba(241, 196, 15, 0.8)'; // Amarillo sol
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Dibujar el sol al final del rayo
        const sunX = getX(elevations.length - 1);
        const sunY = getY(sunRayElevations[sunRayElevations.length - 1]);
        ctx.beginPath();
        ctx.arc(sunX - 10, sunY, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#f1c40f';
        ctx.fill();
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#f1c40f';
        ctx.fill();
        ctx.shadowBlur = 0;

        // --- 3. Dibujar el perfil del terreno ---
        ctx.beginPath();
        ctx.moveTo(getX(0), H - padBottom);
        for (let i = 0; i < elevations.length; i++) {
            ctx.lineTo(getX(i), getY(elevations[i]));
        }
        ctx.lineTo(getX(elevations.length - 1), H - padBottom);
        ctx.closePath();

        // Degradado montaña
        const grad = ctx.createLinearGradient(0, padTop, 0, H - padBottom);
        grad.addColorStop(0, '#27ae60');
        grad.addColorStop(1, '#2c3e50');

        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = '#2ecc71';
        ctx.lineWidth = 2;
        ctx.stroke();

        // --- 4. Dibujar al observador ---
        const obsX = getX(0);
        const obsY = getY(observerElev);

        ctx.beginPath();
        ctx.arc(obsX, obsY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#e74c3c';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`Tú (${Math.round(observerElev)}m)`, obsX + 6, obsY - 4);

        // --- 5. Dibujar pico más alto ---
        if (rawElevations && rawElevations.length > 1) {
            let maxRaw = -Infinity;
            let peakIndex = -1;
            // Solo buscamos picos delante nuestra (distancia > 0)
            for (let i = 1; i < rawElevations.length; i++) {
                if (rawElevations[i] > maxRaw) {
                    maxRaw = rawElevations[i];
                    peakIndex = i;
                }
            }

            if (peakIndex > 0) {
                const peakX = getX(peakIndex);
                const peakY = getY(elevations[peakIndex]); // La gráfica usa las elevaciones ajustadas

                ctx.beginPath();
                ctx.arc(peakX, peakY, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#f39c12';
                ctx.fill();

                ctx.fillStyle = '#f1f2f6';
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(`${Math.round(maxRaw)}m`, peakX, peakY - 4);
                ctx.textAlign = 'left'; // resetear
            }
        }
    }

    function calculateDestinationPoint(lat, lng, distKm, bearingDeg) {
        const R = 6371; // radio Tierra km
        const d = distKm / R;
        const brng = bearingDeg * Math.PI / 180;
        const lat1 = lat * Math.PI / 180;
        const lon1 = lng * Math.PI / 180;

        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
        const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));

        return {
            lat: lat2 * 180 / Math.PI,
            lng: lon2 * 180 / Math.PI
        };
    }

    // --- FORECAST & WEATHER MODE STATE ---
    let currentForecastMode = 'forecast'; // 'forecast' | 'historical' (Default: Real Forecast)

    function getWeatherForecast(lat, lng) {
        if (!window.weatherForecastData || !window.weatherForecastData.points || window.weatherForecastData.points.length === 0) {
            return null;
        }
        try {
            // Filtrar únicamente puntos que tengan c_total válido (no nulo ni undefined)
            const validPoints = window.weatherForecastData.points.filter(p => p.c_total !== null && p.c_total !== undefined && !isNaN(p.c_total));
            if (validPoints.length === 0) return null;

            const pointsWithDist = validPoints.map(p => ({
                ...p,
                dist: haversineDist(lat, lng, p.lat, p.lon)
            }));
            pointsWithDist.sort((a, b) => a.dist - b.dist);
            const nearestPoints = pointsWithDist.slice(0, 4);

            // Si el punto más cercano está a más de 60 km, considerarlo fuera de la zona de cobertura
            if (nearestPoints[0].dist > 60) {
                return null;
            }

            if (nearestPoints[0].dist < 2) {
                return { ...nearestPoints[0], generated_at: window.weatherForecastData.generated_at, model: window.weatherForecastData.model };
            }

            let sumWeights = 0;
            let sumCTotal = 0, sumCLow = 0, sumCMid = 0, sumCHigh = 0, sumPrecip = 0, sumTemp = 0;
            for (const p of nearestPoints) {
                const weight = 1 / Math.pow(Math.max(0.1, p.dist), 2);
                sumWeights += weight;
                sumCTotal += p.c_total * weight;
                sumCLow += (p.c_low !== null && p.c_low !== undefined ? p.c_low : p.c_total) * weight;
                sumCMid += (p.c_mid !== null && p.c_mid !== undefined ? p.c_mid : p.c_total) * weight;
                sumCHigh += (p.c_high !== null && p.c_high !== undefined ? p.c_high : p.c_total) * weight;
                sumPrecip += (p.precip || 0) * weight;
                sumTemp += (p.temp || 25.0) * weight;
            }

            if (sumWeights === 0) return null;

            return {
                lat: lat,
                lon: lng,
                c_total: Math.round(sumCTotal / sumWeights),
                c_low: Math.round(sumCLow / sumWeights),
                c_mid: Math.round(sumCMid / sumWeights),
                c_high: Math.round(sumCHigh / sumWeights),
                precip: Math.round(sumPrecip / sumWeights),
                w_code: nearestPoints[0].w_code,
                temp: Math.round((sumTemp / sumWeights) * 10) / 10,
                generated_at: window.weatherForecastData.generated_at,
                model: window.weatherForecastData.model,
                dist: nearestPoints[0].dist
            };
        } catch (e) {
            console.warn('Weather forecast lookup error:', e);
            return null;
        }
    }
    window.getWeatherForecast = getWeatherForecast;

    function getWMOWeatherInfo(code, cloudPct, precip, cLow) {
        // Corregir códigos WMO contradictorios de lluvia/llovizna si la probabilidad de lluvia es 0% o si nubes bajas es 0%
        if (code >= 51 && (precip === 0 || precip === null || cLow === 0)) {
            const totalClouds = cloudPct || 0;
            if (totalClouds >= 70) return { text: 'Nublado / Cubierto', icon: 'fa-cloud', color: '#e67e22' };
            if (totalClouds >= 30) return { text: 'Parcialmente Nublado', icon: 'fa-cloud-sun', color: '#f1c40f' };
            return { text: 'Poco Nuboso', icon: 'fa-cloud-sun', color: '#2ecc71' };
        }

        if (code === 0) return { text: 'Cielo Despejado', icon: 'fa-sun', color: '#2ecc71' };
        if (code === 1) return { text: 'Principalmente Despejado', icon: 'fa-cloud-sun', color: '#2ecc71' };
        if (code === 2) return { text: 'Parcialmente Nublado', icon: 'fa-cloud-sun', color: '#f1c40f' };
        if (code === 3) return { text: 'Nublado / Cubierto', icon: 'fa-cloud', color: '#e67e22' };
        if (code === 45 || code === 48) return { text: 'Bruma / Niebla', icon: 'fa-smog', color: '#95a5a6' };
        if (code >= 51 && code <= 55) return { text: 'Llovizna', icon: 'fa-cloud-rain', color: '#3498db' };
        if (code >= 61 && code <= 65) return { text: 'Lluvia', icon: 'fa-cloud-showers-heavy', color: '#e74c3c' };
        if (code >= 80 && code <= 82) return { text: 'Chubascos', icon: 'fa-cloud-showers-water', color: '#e74c3c' };
        return { text: 'Nuboso', icon: 'fa-cloud', color: '#f1c40f' };
    }

    // --- WEATHER: Get cloud percentage for scoring (pure calculation, no DOM) ---
    function getCloudPct(lat, lng) {
        if (typeof window.cloudHeatmapData === 'undefined' || window.cloudHeatmapData.length === 0) {
            return null;
        }
        try {
            const pointsWithDist = window.cloudHeatmapData.map(p => ({
                ...p,
                dist: haversineDist(lat, lng, p.lat, p.lon)
            }));
            pointsWithDist.sort((a, b) => a.dist - b.dist);
            const nearestPoints = pointsWithDist.slice(0, 4);

            // Si el punto más cercano está a más de 60 km, considerarlo fuera de la zona de datos
            if (nearestPoints[0].dist > 60) {
                return null;
            }

            const getVal = (p) => p.accumulated !== undefined ? p.accumulated : (p.cloudcover !== undefined ? p.cloudcover : null);

            let sumWeights = 0;
            let sumValues = 0;
            for (const p of nearestPoints) {
                const val = getVal(p);
                if (val === null || isNaN(val)) continue;
                const weight = 1 / Math.pow(Math.max(0.1, p.dist), 2);
                sumWeights += weight;
                sumValues += val * weight;
            }
            const pct = sumWeights > 0 ? sumValues / sumWeights : null;
            return pct !== null ? Math.round(pct) : null;
        } catch (err) {
            return null;
        }
    }

    function getEffectiveCloudPct(lat, lng, mode) {
        if (mode === 'forecast') {
            const forecast = getWeatherForecast(lat, lng);
            if (forecast) {
                // Low and mid clouds block the corona completely; high cirrus clouds allow partial view
                const weightedCloud = Math.min(100, forecast.c_low * 1.0 + forecast.c_mid * 0.85 + forecast.c_high * 0.45);
                return Math.round(weightedCloud);
            }
        }
        return getCloudPct(lat, lng);
    }

    function refreshScoreForCurrentLocation() {
        if (!lastScoreState || !lastLocation) return;
        const cloudPctForScore = getEffectiveCloudPct(lastLocation.lat, lastLocation.lng, currentForecastMode);
        lastScoreState.cloudPctForScore = cloudPctForScore;
        const updatedScore = calculateObservationScore(
            lastScoreState.eclipse,
            lastScoreState.observer,
            lastScoreState.inBand,
            lastScoreState.sunAltForScore,
            cloudPctForScore,
            lastScoreState.isHorizonBlocked || false,
            lastScoreState.warningSunset,
            lastScoreState.sunsetDate,
            lastScoreState.maxHorizonAngle || 0
        );
        updateScoreBadge(updatedScore);
    }

    function initWeatherModeTabs() {
        const tabHist = document.getElementById('tab-mode-historical');
        const tabFore = document.getElementById('tab-mode-forecast');
        if (window.weatherForecastData && window.weatherForecastData.generated_at) {
            const d = new Date(window.weatherForecastData.generated_at);
            const dStr = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
            const tStr = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            tabFore.title = `Previsión meteorológica calculada el ${dStr} a las ${tStr}`;
        }

        tabHist.addEventListener('click', () => {
            if (currentForecastMode === 'historical') return;
            currentForecastMode = 'historical';
            tabHist.classList.add('active');
            tabFore.classList.remove('active');
            tabHist.style.background = 'rgba(255, 204, 0, 0.2)';
            tabHist.style.color = '#ffcc00';
            tabFore.style.background = 'transparent';
            tabFore.style.color = '#a4b0be';
            if (lastLocation && lastLocation.lat) {
                updateWeatherData(lastLocation.lat, lastLocation.lng);
                refreshScoreForCurrentLocation();
            }
        });

        tabFore.addEventListener('click', () => {
            if (currentForecastMode === 'forecast') return;
            currentForecastMode = 'forecast';
            tabFore.classList.add('active');
            tabHist.classList.remove('active');
            tabFore.style.background = 'rgba(255, 204, 0, 0.2)';
            tabFore.style.color = '#ffcc00';
            tabHist.style.background = 'transparent';
            tabHist.style.color = '#a4b0be';
            if (lastLocation && lastLocation.lat) {
                updateWeatherData(lastLocation.lat, lastLocation.lng);
                refreshScoreForCurrentLocation();
            }
        });
    }

    initWeatherModeTabs();

    // --- WEATHER CALCULATION (Historical ERA5 or Live Pregenerated Forecast) ---
    function updateWeatherData(lat, lng) {
        const weatherEl = document.getElementById('weather-info');
        const cloudsEl = document.getElementById('weather-clouds');
        const sourceEl = document.getElementById('weather-source');
        const iconEl = document.getElementById('weather-icon');
        const titleLabel = document.getElementById('weather-title-label');
        const forecastDetails = document.getElementById('weather-forecast-details');

        if (!weatherEl || !cloudsEl) return;

        const historicalPct = getCloudPct(lat, lng);
        const forecast = getWeatherForecast(lat, lng);

        const clarityTag = document.getElementById('weather-clarity-tag');
        const activeCloudPct = (currentForecastMode === 'forecast' && forecast) ? forecast.c_total : historicalPct;

        if (activeCloudPct === null || isNaN(activeCloudPct)) {
            if (titleLabel) titleLabel.textContent = 'Cobertura de Nubes:';
            cloudsEl.textContent = 'Sin datos';
            cloudsEl.style.color = '#a4b0be';
            if (iconEl) {
                iconEl.className = 'fa-solid fa-cloud-slash';
                iconEl.style.color = '#a4b0be';
            }
            if (clarityTag) {
                clarityTag.style.background = 'rgba(255, 255, 255, 0.08)';
                clarityTag.style.color = '#a4b0be';
                clarityTag.innerHTML = `<i class="fa-solid fa-circle-question"></i> Fuera de zona`;
            }
            if (forecastDetails) forecastDetails.classList.add('hidden');
            if (sourceEl) sourceEl.textContent = '📍 Ubicación fuera de la franja de cobertura meteorológica';
            weatherEl.classList.remove('hidden');
            return;
        }

        if (clarityTag) {
            const clearPct = 100 - activeCloudPct;
            if (activeCloudPct <= 30) {
                clarityTag.style.background = 'rgba(46, 204, 113, 0.15)';
                clarityTag.style.color = '#2ecc71';
                clarityTag.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${clearPct}% despejado (Óptimo)`;
            } else if (activeCloudPct <= 60) {
                clarityTag.style.background = 'rgba(241, 196, 15, 0.15)';
                clarityTag.style.color = '#f1c40f';
                clarityTag.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${clearPct}% despejado (Aceptable)`;
            } else {
                clarityTag.style.background = 'rgba(231, 76, 60, 0.15)';
                clarityTag.style.color = '#e74c3c';
                clarityTag.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${activeCloudPct}% nubes (Cubierto)`;
            }
        }

        if (currentForecastMode === 'forecast' && forecast) {
            // SHOW REAL PREGENERATED FORECAST
            if (titleLabel) titleLabel.textContent = 'Cobertura de Nubes (Prevista):';
            cloudsEl.textContent = `${forecast.c_total}%`;
            cloudsEl.style.color = forecast.c_total <= 30 ? '#2ecc71' : (forecast.c_total <= 60 ? '#f1c40f' : '#e74c3c');

            const wmo = getWMOWeatherInfo(forecast.w_code, forecast.c_total, forecast.precip, forecast.c_low);
            if (iconEl) {
                iconEl.className = `fa-solid ${wmo.icon}`;
                iconEl.style.color = wmo.color;
            }

            if (forecastDetails) forecastDetails.classList.remove('hidden');

            const condText = document.getElementById('weather-condition-text');
            if (condText) {
                condText.innerHTML = `<i class="fa-solid ${wmo.icon}"></i> ${wmo.text} (${forecast.temp}°C)`;
            }

            // Update cloud layer progress bars
            const barLow = document.getElementById('bar-cloud-low');
            const valLow = document.getElementById('val-cloud-low');
            if (barLow && valLow) {
                barLow.style.width = `${forecast.c_low}%`;
                valLow.textContent = `${forecast.c_low}%`;
            }

            const barMid = document.getElementById('bar-cloud-mid');
            const valMid = document.getElementById('val-cloud-mid');
            if (barMid && valMid) {
                barMid.style.width = `${forecast.c_mid}%`;
                valMid.textContent = `${forecast.c_mid}%`;
            }

            const barHigh = document.getElementById('bar-cloud-high');
            const valHigh = document.getElementById('val-cloud-high');
            if (barHigh && valHigh) {
                barHigh.style.width = `${forecast.c_high}%`;
                valHigh.textContent = `${forecast.c_high}%`;
            }

            const valPrecip = document.getElementById('val-precip');
            if (valPrecip) valPrecip.textContent = `${forecast.precip}%`;

            const updateBadge = document.getElementById('forecast-update-badge');
            let formattedGenDate = '';
            if (forecast.generated_at) {
                const dateObj = new Date(forecast.generated_at);
                const dayStr = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
                const timeStr = dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                formattedGenDate = `${dayStr} ${timeStr}`;

                if (updateBadge) {
                    updateBadge.title = `Previsión meteorológica calculada el ${dayStr} a las ${timeStr}`;
                    updateBadge.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> Calculado: ${dayStr} (${timeStr})`;
                }
            }

            const diffBadge = document.getElementById('cloud-diff-badge');
            if (diffBadge && historicalPct !== null) {
                const diff = forecast.c_total - historicalPct;
                if (diff < -5) {
                    diffBadge.style.color = '#2ecc71';
                    diffBadge.textContent = `${diff}% nubes vs hist. 🟢`;
                } else if (diff > 5) {
                    diffBadge.style.color = '#e74c3c';
                    diffBadge.textContent = `+${diff}% nubes vs hist. 🔴`;
                } else {
                    diffBadge.style.color = '#f1c40f';
                    diffBadge.textContent = `Similar a hist. (±5%)`;
                }
            }

            if (sourceEl) {
                sourceEl.innerHTML = `<i class="fa-regular fa-calendar-check"></i> Calculado el <strong>${formattedGenDate}</strong> • Modelo ${forecast.model}`;
            }

        } else {
            // SHOW HISTORICAL ERA5
            if (titleLabel) titleLabel.textContent = 'Cobertura de Nubes (Histórico):';
            if (forecastDetails) forecastDetails.classList.add('hidden');

            if (historicalPct !== null && !isNaN(historicalPct)) {
                cloudsEl.textContent = `${historicalPct}%`;
                cloudsEl.style.color = historicalPct <= 30 ? '#2ecc71' : (historicalPct <= 60 ? '#f1c40f' : '#e74c3c');

                if (iconEl) {
                    iconEl.className = 'fa-solid ';
                    if (historicalPct <= 30) iconEl.className += 'fa-sun weather-good';
                    else if (historicalPct <= 60) iconEl.className += 'fa-cloud-sun weather-ok';
                    else iconEl.className += 'fa-cloud weather-bad';
                }

                const hc = window.EclipseConfig ? window.EclipseConfig.heatmap : { day_start: 8, day_end: 14, year_start: 2008, year_end: 2025 };
                if (sourceEl) sourceEl.textContent = `Promedio ${hc.day_start}-${hc.day_end} Ago (${hc.year_start}-${hc.year_end})`;
            }
        }

        weatherEl.classList.remove('hidden');
    }

    function formatDuration(ms) {
        if (ms < 0) return { m: '0', s: '0' };
        const totalSeconds = Math.round(ms / 1000);
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return { m, s };
    }

    function formatDurationHoursMinutes(ms) {
        if (ms < 0) return { h: '0', m: '0' };
        const totalMinutes = Math.floor(ms / 60000);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return { h, m };
    }

    // --- COMPARISON SYSTEM ---
    const comparePanel = document.getElementById('compare-panel');
    const compareCards = document.getElementById('compare-cards');
    const btnAddCompare = document.getElementById('btn-add-compare');
    const closeCompare = document.getElementById('close-compare');
    let compareData = []; // Array of {name, type, obscuration, peak, totalityDuration, eclipseDuration}

    // Store the last computed eclipse data for "add to compare"
    let lastEclipseResult = null;

    // Patch renderEclipseInfo to save data for comparison
    const originalRenderEclipseInfo = renderEclipseInfo;

    btnAddCompare.addEventListener('click', () => {
        if (!lastEclipseResult) return;

        // Prevent duplicates
        if (compareData.find(d => d.name === lastEclipseResult.name)) return;

        compareData.push({ ...lastEclipseResult });
        renderComparePanel();
    });

    closeCompare.addEventListener('click', () => {
        comparePanel.classList.add('hidden');
        compareData = [];
        compareCards.innerHTML = '';
    });

    function renderComparePanel() {
        if (compareData.length === 0) {
            comparePanel.classList.add('hidden');
            return;
        }
        comparePanel.classList.remove('hidden');

        compareCards.innerHTML = compareData.map((d, i) => {
            const badgeClass = d.type === 'Total' ? 'badge-total' : 'badge-partial';
            return `
                <div class="compare-card">
                    <button class="compare-card-remove" onclick="document.dispatchEvent(new CustomEvent('compare-remove', {detail:${i}}))" title="Quitar">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                    <div class="compare-card-name">${d.name}</div>
                    <span class="compare-card-badge ${badgeClass}">${d.type}</span>
                    <div class="compare-card-grid">
                        <span class="cc-label">Oscurecimiento</span>
                        <span class="cc-value">${d.obscuration}%</span>
                        <span class="cc-label">Máximo</span>
                        <span class="cc-value">${d.peak}</span>
                        <span class="cc-label">Dur. Totalidad</span>
                        <span class="cc-value">${d.totalityDuration}</span>
                        <span class="cc-label">Dur. Eclipse</span>
                        <span class="cc-value">${d.eclipseDuration}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    document.addEventListener('compare-remove', (e) => {
        compareData.splice(e.detail, 1);
        renderComparePanel();
    });

    // --- HEATMAP OF TOTALITY DURATION ---
    const btnHeatmap = document.getElementById('btn-heatmap');
    let heatmapLayer = null;
    let heatmapLegend = null;
    let heatmapVisible = false;
    let heatmapGenerating = false;

    async function generateHeatmapAsync() {
        if (!window.Astronomy || typeof eclipseGeoJSON === 'undefined') {
            console.warn('Heatmap: Astronomy or GeoJSON not loaded');
            return;
        }

        heatmapLayer = L.layerGroup();

        // Get bounding box from the totality polygon
        const polyFeature = eclipseGeoJSON.features.find(f =>
            f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
        );
        if (!polyFeature) { console.warn('Heatmap: No polygon found'); return; }

        const coords = polyFeature.geometry.type === 'Polygon'
            ? polyFeature.geometry.coordinates[0]
            : polyFeature.geometry.coordinates[0][0];

        const lons = coords.map(c => c[0]);
        const lats = coords.map(c => c[1]);
        const lonMin = Math.min(...lons);
        const lonMax = Math.max(...lons);
        const latMin = Math.min(...lats);
        const latMax = Math.max(...lats);

        // Generate grid points inside the band
        // Grid resolution: ~0.33° spacing → ~600 points
        const step = 0.33;
        const gridPoints = [];
        for (let lat = latMin + step / 2; lat <= latMax; lat += step) {
            for (let lon = lonMin + step / 2; lon <= lonMax; lon += step) {
                if (isInsideTotalityBand(lat, lon)) {
                    gridPoints.push({ lat, lon });
                }
            }
        }

        console.log(`Heatmap: Computing ${gridPoints.length} grid points...`);
        if (gridPoints.length === 0) return;

        const results = [];
        const BATCH_SIZE = 5;
        const searchDate = new Date('2026-08-01');

        for (let i = 0; i < gridPoints.length; i += BATCH_SIZE) {
            const batch = gridPoints.slice(i, i + BATCH_SIZE);
            for (const pt of batch) {
                try {
                    const eclipse = window.BesselianCalculator.calculateLocalCircumstances(pt.lat, pt.lon, 0);
                    if (eclipse && eclipse.total_begin && eclipse.total_end) {
                        const durationSec = (eclipse.total_end.time.date - eclipse.total_begin.time.date) / 1000;
                        if (durationSec > 0 && durationSec < 300) {
                            results.push({ lat: pt.lat, lon: pt.lon, duration: durationSec });
                        }
                    }
                } catch (e) { /* skip */ }
            }
            await new Promise(r => setTimeout(r, 0));
        }

        console.log(`Heatmap: ${results.length} valid points computed`);
        if (results.length === 0) return;

        const durations = results.map(p => p.duration);
        const minDur = Math.min(...durations);
        const maxDur = Math.max(...durations);

        function durationColor(dur) {
            const t = maxDur > minDur ? (dur - minDur) / (maxDur - minDur) : 0.5;
            if (t < 0.25) return `hsl(${210 + t * 4 * (120 - 210)}, 70%, 55%)`;
            if (t < 0.5) return `hsl(${120 + (t - 0.25) * 4 * (60 - 120)}, 70%, 50%)`;
            if (t < 0.75) return `hsl(${60 + (t - 0.5) * 4 * (30 - 60)}, 80%, 50%)`;
            return `hsl(${30 + (t - 0.75) * 4 * (0 - 30)}, 80%, 50%)`;
        }

        results.forEach(p => {
            const color = durationColor(p.duration);
            const circle = L.circleMarker([p.lat, p.lon], {
                radius: 14,
                color: 'transparent',
                fillColor: color,
                fillOpacity: 0.5,
                weight: 0
            });
            circle.bindTooltip(`${Math.round(p.duration)}s`, { permanent: false, direction: 'top' });
            heatmapLayer.addLayer(circle);
        });

        heatmapLegend = document.createElement('div');
        heatmapLegend.className = 'heatmap-legend glass-panel';
        heatmapLegend.innerHTML = `
            <h4><i class="fa-solid fa-temperature-high"></i> Duración Totalidad</h4>
            <div class="heatmap-scale">
                <div class="heatmap-scale-bar"></div>
            </div>
            <div class="heatmap-scale-labels">
                <span>${Math.round(minDur)}s</span>
                <span>${Math.round(maxDur)}s</span>
            </div>
        `;
        document.querySelector('.ui-container').appendChild(heatmapLegend);
        heatmapLayer.addTo(map);
        console.log('Heatmap: Rendered successfully');
    }

    btnHeatmap.addEventListener('click', async () => {
        if (heatmapGenerating) return;
        heatmapVisible = !heatmapVisible;
        btnHeatmap.classList.toggle('active', heatmapVisible);

        if (heatmapVisible) {
            if (!heatmapLayer) {
                heatmapGenerating = true;
                btnHeatmap.style.opacity = '0.5';
                await generateHeatmapAsync();
                btnHeatmap.style.opacity = '1';
                heatmapGenerating = false;
            } else {
                heatmapLayer.addTo(map);
                if (heatmapLegend) heatmapLegend.style.display = '';
            }
        } else {
            if (heatmapLayer) map.removeLayer(heatmapLayer);
            if (heatmapLegend) heatmapLegend.style.display = 'none';
        }
    });

    // --- HEATMAP OF CLOUD COVER ---
    const btnCloudHeatmap = document.getElementById('btn-cloud-heatmap');
    let cloudHeatmapLayer = null;
    let cloudHeatmapLegend = null;
    let cloudHeatmapVisible = false;

    function generateCloudHeatmap() {
        if (typeof cloudHeatmapData === 'undefined' && typeof weatherForecastData === 'undefined') {
            console.warn('Cloud Heatmap: Data not loaded.');
            return;
        }

        cloudHeatmapLayer = L.layerGroup();

        function cloudColor(pct) {
            const t = Math.max(0, Math.min(100, pct)) / 100;
            if (t < 0.5) {
                const h = 130 - (t * 2 * 75);
                return `hsl(${h}, 75%, 55%)`;
            } else {
                const h = 55 - ((t - 0.5) * 2 * 45);
                const l = 55 - ((t - 0.5) * 2 * 10);
                return `hsl(${h}, 85%, ${l}%)`;
            }
        }

        function populateCloudLayer(mode, yearVal) {
            if (!cloudHeatmapLayer) return;
            cloudHeatmapLayer.clearLayers();

            if (mode === 'forecast' && window.weatherForecastData && window.weatherForecastData.points) {
                window.weatherForecastData.points.forEach(p => {
                    const color = cloudColor(p.c_total);
                    const circle = L.circleMarker([p.lat, p.lon], {
                        radius: 14,
                        color: 'transparent',
                        fillColor: color,
                        fillOpacity: 0.65,
                        weight: 0
                    });
                    const clearPct = 100 - p.c_total;
                    circle.bindTooltip(`⚡ Previsión Real: ${p.c_total}% nubes (${clearPct}% despejado)<br>Bajas: ${p.c_low}% | Medias: ${p.c_mid}% | Altas: ${p.c_high}%`, { permanent: false, direction: 'top' });
                    cloudHeatmapLayer.addLayer(circle);
                });
            } else if (typeof cloudHeatmapData !== 'undefined') {
                const minYear = window.EclipseConfig.heatmap.year_start;
                const maxYear = window.EclipseConfig.heatmap.year_end;
                const isAccumulated = yearVal < minYear;

                cloudHeatmapData.forEach(p => {
                    let basePct;
                    if (isAccumulated) {
                        basePct = p.accumulated !== undefined ? p.accumulated : p.cloudcover;
                    } else {
                        basePct = (p.years && p.years[yearVal] !== undefined) ? p.years[yearVal] : 0;
                    }
                    const color = cloudColor(basePct);
                    const circle = L.circleMarker([p.lat, p.lon], {
                        radius: 14,
                        color: 'transparent',
                        fillColor: color,
                        fillOpacity: 0.6,
                        weight: 0
                    });
                    const clearPct = 100 - basePct;
                    circle.bindTooltip(`📜 Histórico ${isAccumulated ? 'Promedio' : yearVal}: ${Math.round(basePct)}% nubes (${Math.round(clearPct)}% despejado)`, { permanent: false, direction: 'top' });
                    cloudHeatmapLayer.addLayer(circle);
                });
            }
        }

        populateCloudLayer(currentForecastMode, window.EclipseConfig.heatmap.year_start - 1);

        const minYear = window.EclipseConfig.heatmap.year_start;
        const maxYear = window.EclipseConfig.heatmap.year_end;

        cloudHeatmapLegend = document.createElement('div');
        cloudHeatmapLegend.className = 'heatmap-legend glass-panel';
        cloudHeatmapLegend.innerHTML = `
            <h4><i class="fa-solid fa-cloud"></i> Mapa de Nubosidad</h4>
            
            <div class="mode-toggle-pill" style="display: flex; background: rgba(0,0,0,0.3); border-radius: 12px; padding: 2px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.08);">
                <button id="map-mode-forecast" class="forecast-tab-btn ${currentForecastMode === 'forecast' ? 'active' : ''}" style="flex: 1; border: none; padding: 4px 6px; border-radius: 10px; font-size: 0.68rem; font-weight: 600; cursor: pointer;">
                    <i class="fa-solid fa-bolt"></i> Previsión Real
                </button>
                <button id="map-mode-historical" class="forecast-tab-btn ${currentForecastMode === 'historical' ? 'active' : ''}" style="flex: 1; border: none; padding: 4px 6px; border-radius: 10px; font-size: 0.68rem; font-weight: 600; cursor: pointer;">
                    <i class="fa-solid fa-clock-rotate-left"></i> Histórico
                </button>
            </div>

            <div class="heatmap-scale">
                <div class="cloud-scale-bar"></div>
            </div>
            <div class="heatmap-scale-labels">
                <span style="color: #2ecc71; font-weight: 600;">0% (Despejado)</span>
                <span style="color: #e74c3c; font-weight: 600;">100% (Cubierto)</span>
            </div>
            
            <div class="cloud-year-slider-container ${currentForecastMode === 'forecast' ? 'hidden' : ''}" id="map-historical-slider-box">
                <div class="cloud-year-label" id="cloud-year-display">Acumulado (${minYear}-${maxYear})</div>
                <input type="range" id="cloud-year-slider" class="cloud-year-slider" min="${minYear - 1}" max="${maxYear}" step="1" value="${minYear - 1}">
            </div>
            <div id="map-forecast-info-box" style="font-size: 0.65rem; color: #a4b0be; margin-top: 6px; text-align: center;" class="${currentForecastMode === 'historical' ? 'hidden' : ''}">
                <i class="fa-solid fa-check" style="color: #2ecc71;"></i> Previsión numérico-climática en vivo (12 Ago 18:00 UTC)
            </div>
        `;
        document.querySelector('.ui-container').appendChild(cloudHeatmapLegend);
        cloudHeatmapLayer.addTo(map);

        const btnMapFore = document.getElementById('map-mode-forecast');
        const btnMapHist = document.getElementById('map-mode-historical');
        const sliderBox = document.getElementById('map-historical-slider-box');
        const forecastInfoBox = document.getElementById('map-forecast-info-box');
        const yearSlider = document.getElementById('cloud-year-slider');
        const yearDisplay = document.getElementById('cloud-year-display');

        function updateMapLegendTabStyles(activeMode) {
            if (activeMode === 'forecast') {
                btnMapFore.classList.add('active');
                btnMapHist.classList.remove('active');
                btnMapFore.style.background = 'rgba(255, 204, 0, 0.2)';
                btnMapFore.style.color = '#ffcc00';
                btnMapHist.style.background = 'transparent';
                btnMapHist.style.color = '#a4b0be';
                if (sliderBox) sliderBox.classList.add('hidden');
                if (forecastInfoBox) forecastInfoBox.classList.remove('hidden');
            } else {
                btnMapHist.classList.add('active');
                btnMapFore.classList.remove('active');
                btnMapHist.style.background = 'rgba(255, 204, 0, 0.2)';
                btnMapHist.style.color = '#ffcc00';
                btnMapFore.style.background = 'transparent';
                btnMapFore.style.color = '#a4b0be';
                if (sliderBox) sliderBox.classList.remove('hidden');
                if (forecastInfoBox) forecastInfoBox.classList.add('hidden');
            }
        }

        updateMapLegendTabStyles(currentForecastMode);

        btnMapFore.addEventListener('click', () => {
            currentForecastMode = 'forecast';
            updateMapLegendTabStyles('forecast');
            populateCloudLayer('forecast', minYear - 1);
            // Sincronizar con el panel lateral si existe
            const panelTabFore = document.getElementById('tab-mode-forecast');
            if (panelTabFore) panelTabFore.click();
        });

        btnMapHist.addEventListener('click', () => {
            currentForecastMode = 'historical';
            updateMapLegendTabStyles('historical');
            const yearVal = yearSlider ? parseInt(yearSlider.value) : (minYear - 1);
            populateCloudLayer('historical', yearVal);
            // Sincronizar con el panel lateral si existe
            const panelTabHist = document.getElementById('tab-mode-historical');
            if (panelTabHist) panelTabHist.click();
        });

        if (yearSlider) {
            yearSlider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                const isAccumulated = val < minYear;
                if (yearDisplay) {
                    yearDisplay.textContent = isAccumulated ? `Acumulado (${minYear}-${maxYear})` : `Año ${val}`;
                }
                populateCloudLayer('historical', val);
            });
        }
    }

    btnCloudHeatmap.addEventListener('click', () => {
        cloudHeatmapVisible = !cloudHeatmapVisible;
        btnCloudHeatmap.classList.toggle('active', cloudHeatmapVisible);

        if (cloudHeatmapVisible) {
            if (!cloudHeatmapLayer) {
                generateCloudHeatmap();
            } else {
                cloudHeatmapLayer.addTo(map);
                if (cloudHeatmapLegend) cloudHeatmapLegend.style.display = '';
            }
        } else {
            if (cloudHeatmapLayer) map.removeLayer(cloudHeatmapLayer);
            if (cloudHeatmapLegend) cloudHeatmapLegend.style.display = 'none';
        }
    });

    // --- SIMULATIONS INTEGRATION ---
    const btnBeads = document.getElementById('btn-beads-sim');
    const btnHorizon3D = document.getElementById('btn-horizon-3d');
    const closeBeads = document.getElementById('close-beads');
    const closeHorizon3D = document.getElementById('close-horizon-3d');

    if (window.LimbSimulator) window.LimbSimulator.init();
    if (window.Horizon3D) window.Horizon3D.init();

    btnBeads.addEventListener('click', () => {
        if (window.LimbSimulator) window.LimbSimulator.show();
    });

    btnHorizon3D.addEventListener('click', () => {
        if (window.Horizon3D) {
            window.Horizon3D.show(lastLocation.lat, lastLocation.lng, lastLocation.alt, lastLocation.az);
        }
    });

    const btnGenPass = document.getElementById('btn-gen-pass');
    if (btnGenPass) {
        btnGenPass.addEventListener('click', () => {
            if (window.EclipseObservationCard) {
                const details = window.currentEclipseDetails || {};
                const locLat = (lastLocation && lastLocation.lat) ? lastLocation.lat : 42.0096;
                const locLng = (lastLocation && lastLocation.lng) ? lastLocation.lng : -4.5288;
                window.EclipseObservationCard.openObservationPass({
                    ...details,
                    name: (lastLocation && lastLocation.name) ? lastLocation.name : 'Ubicación Seleccionada',
                    lat: locLat,
                    lng: locLng,
                    elevation: (lastLocation && lastLocation.elevation) ? lastLocation.elevation : 250,
                    cloudPct: getEffectiveCloudPct(locLat, locLng, currentForecastMode),
                    sunAlt: (lastLocation && lastLocation.alt) ? lastLocation.alt : 10.5
                });
            }
        });
    }

    closeBeads.addEventListener('click', () => {
        if (window.LimbSimulator) window.LimbSimulator.hide();
    });

    closeHorizon3D.addEventListener('click', () => {
        if (window.Horizon3D) window.Horizon3D.hide();
    });

    // Baily's Beads Help Modal
    const btnBeadsHelp = document.getElementById('btn-beads-help');
    const beadsHelpModal = document.getElementById('beads-help-modal');
    const closeBeadsHelp = document.getElementById('close-beads-help');

    btnBeadsHelp.addEventListener('click', () => {
        beadsHelpModal.classList.remove('hidden');
    });

    closeBeadsHelp.addEventListener('click', () => {
        beadsHelpModal.classList.add('hidden');
    });

    // --- VERSION & CHANGELOG ---
    const versionBadge = document.getElementById('version-badge');
    const versionText = document.getElementById('version-text');
    const changelogModal = document.getElementById('changelog-modal');
    const changelogContent = document.getElementById('changelog-content');
    const closeChangelog = document.getElementById('close-changelog');

    // Mostrar versión desde config
    if (window.EclipseConfig && window.EclipseConfig.version) {
        versionText.textContent = `v${window.EclipseConfig.version}`;
    }

    async function loadAndRenderChangelog() {
        try {
            const response = await fetch('CHANGELOG.md');
            if (!response.ok) throw new Error('No se pudo cargar el archivo');
            const markdown = await response.text();
            
            const versions = [];
            const blocks = markdown.split(/\n##\s+/).slice(1);
            
            blocks.forEach(block => {
                const lines = block.split('\n');
                const headerMatch = lines[0].match(/\[(.*?)\]\s*—\s*(.*)/);
                if (!headerMatch) return;
                
                const version = headerMatch[1];
                const date = headerMatch[2];
                const sections = [];
                let currentSection = null;
                
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line.startsWith('### ')) {
                        currentSection = { title: line.replace('### ', ''), items: [] };
                        sections.push(currentSection);
                    } else if (line.startsWith('- ') && currentSection) {
                        currentSection.items.push(line.replace('- ', ''));
                    }
                }
                versions.push({ version, date, sections });
            });

            changelogContent.innerHTML = versions.map(v => `
                <div class="changelog-version">
                    <div class="changelog-version-header">
                        <span class="changelog-version-tag">v${v.version}</span>
                        <span class="changelog-version-date">${v.date}</span>
                    </div>
                    ${v.sections.map(s => `
                        <div class="changelog-section">
                            <div class="changelog-section-title">${s.title}</div>
                            <ul>${s.items.map(item => `<li>${item}</li>`).join('')}</ul>
                        </div>
                    `).join('')}
                </div>
            `).join('');
            
        } catch (e) {
            console.error('Error loading changelog:', e);
            changelogContent.innerHTML = '<p style="text-align:center; padding:2rem; opacity:0.6;">No se pudo cargar el historial de cambios dinámicamente.</p>';
        }
        
        changelogModal.classList.remove('hidden');
    }

    versionBadge.addEventListener('click', loadAndRenderChangelog);

    closeChangelog.addEventListener('click', () => {
        changelogModal.classList.add('hidden');
    });

});

