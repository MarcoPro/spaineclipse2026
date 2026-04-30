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

    // --- LEAFLET MAP INITIALIZATION ---
    // Madrid center as default
    const map = L.map('map', { zoomControl: false }).setView([40.4168, -3.7038], 6);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Standard OpenStreetMap tiles for better visibility of physical features
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        subdomains: 'abc',
        maxZoom: 19
    }).addTo(map);

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
            // Restrict to Spain for better relevance
            const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=es&format=json&addressdetails=1&limit=5`);
            const data = await response.json();

            displaySearchResults(data);
        } catch (error) {
            console.error("Error fetching locations:", error);
            // Hide loading on error
            searchLoading.classList.add('hidden');
        }
    }

    function displaySearchResults(results) {
        searchLoading.classList.add('hidden');
        searchResults.innerHTML = '';

        if (results.length === 0) {
            searchResults.innerHTML = '<div class="search-result-item"><span class="res-context">No se encontraron resultados</span></div>';
            searchResults.classList.remove('hidden');
            return;
        }

        results.forEach(pos => {
            const div = document.createElement('div');
            div.className = 'search-result-item';

            // Extract a nice name
            const name = pos.name || pos.address.city || pos.address.town || pos.address.village || pos.address.municipality;
            const context = pos.display_name.split(',').slice(1, 3).join(',') || pos.address.state || pos.address.region;

            div.innerHTML = `
                <span class="res-name">${name}</span>
                <span class="res-context">${context}</span>
            `;

            div.addEventListener('click', () => {
                selectLocation(parseFloat(pos.lat), parseFloat(pos.lon), name, context);
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
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`);
            const data = await response.json();
            searchLoading.classList.add('hidden');

            if (data && data.address) {
                const name = data.address.hamlet || data.address.city || data.address.town || data.address.village || data.address.municipality || "Ubicación Seleccionada";
                const context = data.address.state || data.address.country || "";
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
        if (currentMarker) {
            map.removeLayer(currentMarker);
            currentMarker = null;
        }
    });

    closeIntroBtn.addEventListener('click', () => {
        introMessage.classList.add('hidden');
    });

    // --- POINTS OF INTEREST ---
    const btnPois = document.getElementById('btn-pois');
    let poiLayerGroup = null;
    let poisVisible = false;

    const poiTypeLabels = {
        observatory: 'Observatorio',
        viewpoint: 'Mirador',
        planetarium: 'Planetario'
    };

    function createPOIMarkers() {
        if (typeof eclipsePOIs === 'undefined' || !eclipsePOIs.length) return;

        poiLayerGroup = L.layerGroup();

        eclipsePOIs.forEach((poi) => {
            const icon = L.divIcon({
                className: '',
                html: `<div class="poi-marker"><i class="fa-solid ${poi.icon}"></i></div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
                popupAnchor: [0, -20]
            });

            const typeLabel = poiTypeLabels[poi.type] || poi.type;
            const popupContent = `
                <div class="poi-popup-title">${poi.name}</div>
                <div class="poi-popup-type"><i class="fa-solid ${poi.icon}"></i> ${typeLabel}</div>
                <div class="poi-popup-desc">${poi.description}</div>
                <button class="poi-popup-btn" onclick="document.dispatchEvent(new CustomEvent('poi-calc', {detail: {lat: ${poi.lat}, lng: ${poi.lng}, name: '${poi.name.replace(/'/g, "\\'")}'}}))"">
                    <i class="fa-solid fa-calculator"></i> Ver datos del eclipse
                </button>
            `;

            const marker = L.marker([poi.lat, poi.lng], { icon })
                .bindPopup(popupContent, {
                    className: 'poi-popup',
                    maxWidth: 280
                });

            poiLayerGroup.addLayer(marker);
        });
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
    function calculateEclipse(lat, lng, name, context) {
        if (!window.Astronomy) {
            console.error("Astronomy Engine no cargado.");
            return;
        }

        // Start search for the eclipse from beginning of Aug 2026
        const searchDate = new Date('2026-08-01T00:00:00Z');
        const observer = new window.Astronomy.Observer(lat, lng, 800);

        const eclipse = window.Astronomy.SearchLocalSolarEclipse(searchDate, observer);

        if (eclipse && eclipse.peak.time.date.getFullYear() === 2026) {
            renderEclipseInfo(eclipse, observer, name, context);
        } else {
            // Unlikely in ES but fallback just in case
            alert("No hay eclipse significativo calculable en esta fecha para esta ubicación.");
        }
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

    function renderEclipseInfo(eclipse, observer, name, context) {
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

        // Calculate durations
        let phaseDurationObj = { m: '--', s: '--' };
        if (isLocallyTotal && eclipse.total_begin && eclipse.total_end) {
            let diffMs = eclipse.total_end.time.date - eclipse.total_begin.time.date;

            // --- CORRECCIÓN GEOMÉTRICA DE DURACIÓN EN LOS LÍMITES ---
            // Astronomy Engine no conoce nuestra corrección L2 del limbo lunar y da ~10s extra en el borde.
            // Ajustamos la duración para que caiga matemáticamente a 0 justo en la frontera de nuestro polígono.
            if (shadowCenterCoords.length > 0 && totalityPolygon) {
                let minDistToCenter = Infinity;
                let closestCenterIdx = 0;
                for (let i = 0; i < shadowCenterCoords.length; i++) {
                    const c = shadowCenterCoords[i]; // [lng, lat]
                    const dist = haversineDist(observer.latitude, observer.longitude, c[1], c[0]);
                    if (dist < minDistToCenter) {
                        minDistToCenter = dist;
                        closestCenterIdx = i;
                    }
                }

                const cLat = shadowCenterCoords[closestCenterIdx][1];
                const cLng = shadowCenterCoords[closestCenterIdx][0];
                let minDistToEdge = Infinity;
                // Check distance to boundary
                for (let i = 0; i < totalityPolygon.length; i++) {
                    const p = totalityPolygon[i]; // [lng, lat]
                    const dist = haversineDist(cLat, cLng, p[1], p[0]);
                    if (dist < minDistToEdge) {
                        minDistToEdge = dist;
                    }
                }

                const d = minDistToCenter;
                const R = minDistToEdge;

                if (d >= R) {
                    diffMs = 0;
                } else {
                    // Para NO recortar segundos en el interior de la franja,
                    // conservamos el 100% de la duración de Astronomy Engine casi hasta el final.
                    // Solo forzamos la caída a 0 en el último 5% de distancia hacia el límite.
                    const threshold = 0.987;
                    const ratio = d / R;
                    if (ratio > threshold) {
                        // Transición lineal de 1 a 0 en ese último 5%
                        let fade = 1 - ((ratio - threshold) / (1 - threshold));
                        fade = Math.min(3, fade);
                        diffMs = diffMs * fade;
                    }
                    // Si ratio <= 0.95, diffMs se queda intacto.
                }
            }

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
        document.getElementById('eclipse-type').textContent = `Fase ${eclipseTypeStr}`;

        document.getElementById('obscuration-value').textContent = obscurationPercent;

        // Contact times
        document.getElementById('time-c1').textContent = timeC1;
        document.getElementById('time-max').textContent = timePeak;
        document.getElementById('time-c4').textContent = timeC4;

        // C2/C3: only show for total eclipses
        const stepC2 = document.getElementById('step-c2');
        const stepC3 = document.getElementById('step-c3');
        if (isLocallyTotal) {
            document.getElementById('time-c2').textContent = timeC2;
            document.getElementById('time-c3').textContent = timeC3;
            stepC2.classList.remove('hidden');
            stepC3.classList.remove('hidden');
        } else {
            stepC2.classList.add('hidden');
            stepC3.classList.add('hidden');
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

        // --- SUN POSITION AT PEAK ---
        if (eclipse.peak && window.Astronomy) {
            const peakTime = eclipse.peak.time;
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
        fetchWeather(observer.latitude, observer.longitude);

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

    // --- WEATHER FETCH (Open-Meteo Historical API) ---
    async function fetchWeather(lat, lng) {
        const weatherEl = document.getElementById('weather-info');
        const cloudsEl = document.getElementById('weather-clouds');
        const sourceEl = document.getElementById('weather-source');
        const iconEl = document.getElementById('weather-icon');

        // Reset
        weatherEl.classList.add('hidden');

        try {
            // Use Open-Meteo Historical API for cloud cover from 1 year before the eclipse
            // (real forecast won't be available until ~2 weeks before)
            const url = `https://archive-api.open-meteo.com/v1/archive?` +
                `latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
                `&start_date=2025-08-12&end_date=2025-08-12` +
                `&hourly=cloudcover`;

            const response = await fetch(url);
            const data = await response.json();

            if (data && data.hourly && data.hourly.cloudcover) {
                // Eclipse over Spain is around 18:00 UTC (index 18 in the hourly array)
                const pct = Math.round(data.hourly.cloudcover[18]);
                if (pct !== undefined && !isNaN(pct)) {
                    cloudsEl.textContent = `${pct}%`;
                    sourceEl.textContent = `Histórico 12 Agosto 2025 (18:00 UTC)`;

                    // Color code
                    iconEl.className = 'fa-solid ';
                    if (pct <= 30) {
                        iconEl.className += 'fa-sun weather-good';
                    } else if (pct <= 60) {
                        iconEl.className += 'fa-cloud-sun weather-ok';
                    } else {
                        iconEl.className += 'fa-cloud weather-bad';
                    }

                    weatherEl.classList.remove('hidden');
                }
            }
        } catch (err) {
            console.warn('Weather data unavailable:', err);
            // Silently fail — weather is supplementary info
        }
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
                    const observer = new Astronomy.Observer(pt.lat, pt.lon, 0);
                    const eclipse = Astronomy.SearchLocalSolarEclipse(searchDate, observer);
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
        if (typeof cloudHeatmapData === 'undefined') {
            console.warn('Cloud Heatmap: Data not loaded. Make sure cloud_heatmap.js is included.');
            return;
        }

        cloudHeatmapLayer = L.layerGroup();

        function cloudColor(pct) {
            // 0-30% Green, 30-60% Yellow/Orange, 60-100% Gray/Red
            if (pct <= 20) return '#4cd964';
            if (pct <= 40) return '#8bd964';
            if (pct <= 60) return '#ffcc00';
            if (pct <= 80) return '#ff9900';
            return '#8e8e93';
        }

        cloudHeatmapData.forEach(p => {
            const color = cloudColor(p.cloudcover);
            const circle = L.circleMarker([p.lat, p.lon], {
                radius: 14,
                color: 'transparent',
                fillColor: color,
                fillOpacity: 0.6,
                weight: 0
            });
            circle.bindTooltip(`Nubes: ${Math.round(p.cloudcover)}%`, { permanent: false, direction: 'top' });
            cloudHeatmapLayer.addLayer(circle);
        });

        cloudHeatmapLegend = document.createElement('div');
        cloudHeatmapLegend.className = 'heatmap-legend glass-panel';
        cloudHeatmapLegend.innerHTML = `
            <h4><i class="fa-solid fa-cloud"></i> Nubosidad Promedio</h4>
            <div class="heatmap-scale">
                <div class="cloud-scale-bar"></div>
            </div>
            <div class="heatmap-scale-labels">
                <span>0%</span>
                <span>100%</span>
            </div>
            <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 5px; text-align: center;">Promedio 12 Ago (2015-2025)</div>
        `;
        document.querySelector('.ui-container').appendChild(cloudHeatmapLegend);
        cloudHeatmapLayer.addTo(map);
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

});

