document.addEventListener("DOMContentLoaded", () => {
    
    // Elements
    const searchInput = document.getElementById("search-input");
    const searchResults = document.getElementById("search-results");
    const searchLoading = document.getElementById("search-loading");
    const btnGeolocation = document.getElementById("btn-geolocation");
    
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
            const name = pos.address.city || pos.address.town || pos.address.village || pos.address.municipality || pos.name;
            const context = pos.address.state || pos.address.region || pos.display_name.split(',').slice(1,3).join(',');

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
            
            if(data && data.address) {
                const name = data.address.city || data.address.town || data.address.village || data.address.municipality || data.name || "Ubicación Seleccionada";
                const context = data.address.state || data.address.country || "";
                selectLocation(lat, lng, name, context);
            } else {
                selectLocation(lat, lng, `Lat: ${lat.toFixed(3)}, Lng: ${lng.toFixed(3)}`, "España");
            }
        } catch(error) {
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
        
        currentMarker = L.marker([lat, lng], {icon: icon}).addTo(map);

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
        if(currentMarker) {
            map.removeLayer(currentMarker);
            currentMarker = null;
        }
    });

    closeIntroBtn.addEventListener('click', () => {
        introMessage.classList.add('hidden');
    });

    // --- ASTRONOMY CALCULATIONS ---
    function calculateEclipse(lat, lng, name, context) {
        if (!window.Astronomy) {
            console.error("Astronomy Engine no cargado.");
            return;
        }

        // Start search for the eclipse from beginning of Aug 2026
        const searchDate = new Date('2026-08-01T00:00:00Z');
        const observer = new window.Astronomy.Observer(lat, lng, 0);
        
        const eclipse = window.Astronomy.SearchLocalSolarEclipse(searchDate, observer);
        
        if (eclipse && eclipse.peak.time.date.getFullYear() === 2026) {
            renderEclipseInfo(eclipse, observer, name, context);
        } else {
            // Unlikely in ES but fallback just in case
            alert("No hay eclipse significativo calculable en esta fecha para esta ubicación.");
        }
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
            const diffMs = eclipse.total_end.time.date - eclipse.total_begin.time.date;
            phaseDurationObj = formatDuration(diffMs);
        }

        let totalDurationObj = { h: '--', m: '--' };
        if (eclipse.partial_begin && eclipse.partial_end) {
            const diffMs = eclipse.partial_end.time.date - eclipse.partial_begin.time.date;
            totalDurationObj = formatDurationHoursMinutes(diffMs);
        }
        
        // Sunset calculation
        const peakDate = eclipse.peak.time.date;
        const sunsetSearchStart = new Date(peakDate);
        sunsetSearchStart.setHours(0,0,0,0);
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

        // Show panel
        infoPanel.classList.remove('hidden');
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

});
