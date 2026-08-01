/**
 * Eclipse Solar España 2026 - Recomendador Inteligente por Radio de Kilómetros
 */
(function () {
    let finderMarkersGroup = null;

    // Municipios / Orígenes predefinidos comunes
    const KNOWN_ORIGINS = [
        { name: "Palencia", lat: 42.0096, lng: -4.5288 },
        { name: "Valladolid", lat: 41.6523, lng: -4.7245 },
        { name: "Burgos", lat: 42.3440, lng: -3.6969 },
        { name: "Oviedo", lat: 43.3619, lng: -5.8494 },
        { name: "A Coruña", lat: 43.3623, lng: -8.4115 },
        { name: "Santander", lat: 43.4623, lng: -3.8099 },
        { name: "León", lat: 42.5987, lng: -5.5671 },
        { name: "Soria", lat: 41.7640, lng: -2.4688 },
        { name: "Segovia", lat: 40.9429, lng: -4.1088 },
        { name: "Ávila", lat: 40.6565, lng: -4.6818 },
        { name: "Madrid", lat: 40.4168, lng: -3.7038 },
        { name: "Zaragoza", lat: 41.6561, lng: -0.8773 },
        { name: "Palma de Mallorca", lat: 39.5696, lng: 2.6502 }
    ];

    function initLocationFinderModal() {
        const modal = document.getElementById('modal-location-finder');
        const closeBtn = document.getElementById('close-location-finder');
        const openBtn = document.getElementById('btn-finder');

        const inputOrigin = document.getElementById('finder-origin-input');
        const sliderRadius = document.getElementById('finder-radius-slider');
        const valRadius = document.getElementById('finder-radius-val');
        const btnSearch = document.getElementById('finder-btn-search');

        if (openBtn && modal) {
            openBtn.addEventListener('click', () => {
                modal.classList.remove('hidden');

                // Si hay un municipio activo seleccionado en el mapa, ponerlo por defecto
                if (inputOrigin) {
                    if (window.lastLocation && window.lastLocation.name && !window.lastLocation.name.startsWith('Lat:')) {
                        inputOrigin.value = window.lastLocation.name;
                    } else if (!inputOrigin.value.trim()) {
                        inputOrigin.value = 'Palencia';
                    }
                }
                executeLocationSearch();
            });
        }

        if (closeBtn && modal) {
            closeBtn.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
        }

        if (sliderRadius && valRadius) {
            sliderRadius.addEventListener('input', (e) => {
                valRadius.textContent = `${e.target.value} km`;
            });
        }

        if (btnSearch) {
            btnSearch.addEventListener('click', () => {
                hideAutocomplete();
                executeLocationSearch();
            });
        }

        if (inputOrigin) {
            inputOrigin.addEventListener('input', (e) => {
                const val = e.target.value.trim();
                clearTimeout(autocompleteDebounce);
                if (val.length < 2) {
                    hideAutocomplete();
                    return;
                }
                autocompleteDebounce = setTimeout(() => {
                    showAutocompleteSuggestions(val);
                }, 200);
            });

            inputOrigin.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    hideAutocomplete();
                    executeLocationSearch();
                }
            });
        }

        document.addEventListener('click', (ev) => {
            const inputEl = document.getElementById('finder-origin-input');
            const dropEl = document.getElementById('finder-autocomplete-list');
            if (inputEl && dropEl && !inputEl.contains(ev.target) && !dropEl.contains(ev.target)) {
                hideAutocomplete();
            }
        });
    }

    let autocompleteDebounce = null;

    function hideAutocomplete() {
        const drop = document.getElementById('finder-autocomplete-list');
        if (drop) drop.classList.add('hidden');
    }

    async function showAutocompleteSuggestions(query) {
        const drop = document.getElementById('finder-autocomplete-list');
        if (!drop) return;

        const qLower = query.toLowerCase();
        const suggestions = [];

        // 1. Filtrar locales conocidos
        KNOWN_ORIGINS.forEach(o => {
            if (o.name.toLowerCase().includes(qLower)) {
                suggestions.push({ name: o.name, sub: 'Municipio', lat: o.lat, lng: o.lng });
            }
        });

        // 2. Filtrar eventos conocidos
        const eventsList = (typeof window.eclipseEvents !== 'undefined') ? window.eclipseEvents : [];
        eventsList.forEach(e => {
            if (e.town && e.town.toLowerCase().includes(qLower) && !suggestions.some(s => s.name.toLowerCase() === e.town.toLowerCase())) {
                suggestions.push({ name: e.town, sub: e.province || 'España', lat: e.lat, lng: e.lng });
            }
        });

        // 3. Buscar sugerencias online con Photon (sin lang=es para evitar HTTP 400 Bad Request)
        if (suggestions.length < 4) {
            try {
                const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.features) {
                        data.features.forEach(f => {
                            const p = f.properties;
                            const coords = f.geometry.coordinates;
                            const name = p.name || p.city || p.town || p.village;
                            const sub = p.state || p.county || p.country || 'España';
                            if (name && !suggestions.some(s => s.name.toLowerCase() === name.toLowerCase())) {
                                suggestions.push({ name: name, sub: sub, lat: coords[1], lng: coords[0] });
                            }
                        });
                    }
                }
            } catch (e) {
                console.warn('Autocomplete fetch error:', e);
            }
        }

        if (suggestions.length === 0) {
            hideAutocomplete();
            return;
        }

        let html = '';
        suggestions.slice(0, 6).forEach(s => {
            html += `<div class="finder-autocomplete-item" data-lat="${s.lat}" data-lng="${s.lng}" data-name="${s.name.replace(/"/g, '&quot;')}">
                <span>📍 <strong>${s.name}</strong></span>
                <span class="item-sub">${s.sub}</span>
            </div>`;
        });

        drop.innerHTML = html;
        drop.classList.remove('hidden');

        const items = drop.querySelectorAll('.finder-autocomplete-item');
        items.forEach(item => {
            item.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const name = item.getAttribute('data-name');
                const inputOrigin = document.getElementById('finder-origin-input');
                if (inputOrigin) inputOrigin.value = name;
                hideAutocomplete();
                executeLocationSearch();
            });
        });
    }

    function haversineKm(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    async function resolveOriginCoordinates(query) {
        const qLower = query.trim().toLowerCase();
        // 1. Buscar en tabla de conocidos
        const found = KNOWN_ORIGINS.find(o => o.name.toLowerCase() === qLower);
        if (found) return found;

        // 2. Buscar en eventos conocidos
        const eventsList = (typeof window.eclipseEvents !== 'undefined') ? window.eclipseEvents : [];
        const foundEv = eventsList.find(e => e.town && e.town.toLowerCase() === qLower);
        if (foundEv) return { name: foundEv.town, lat: foundEv.lat, lng: foundEv.lng };

        // 3. Si coincide con la ubicación actual seleccionada
        if (window.lastLocation && window.lastLocation.name && window.lastLocation.name.toLowerCase().includes(qLower)) {
            return { name: window.lastLocation.name, lat: window.lastLocation.lat, lng: window.lastLocation.lng };
        }

        // 4. Buscar vía API Geocoding Komoot Photon (sin lang=es para evitar 400 Bad Request)
        try {
            const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.features && data.features.length > 0) {
                    const coords = data.features[0].geometry.coordinates; // [lon, lat]
                    const props = data.features[0].properties;
                    const resolvedName = props.name || props.city || props.town || query;
                    return { name: resolvedName, lat: coords[1], lng: coords[0] };
                }
            }
        } catch (e) {
            console.warn('Geocoding origin error:', e);
        }

        // 5. Fallback con Nominatim
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=es`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.length > 0) {
                    return { name: data[0].display_name.split(',')[0], lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
                }
            }
        } catch (e) {
            console.warn('Nominatim fallback error:', e);
        }

        // Fallback por defecto si no se encuentra
        if (window.lastLocation && window.lastLocation.lat) {
            return { name: window.lastLocation.name || query, lat: window.lastLocation.lat, lng: window.lastLocation.lng };
        }
        return { name: "Palencia", lat: 42.0096, lng: -4.5288 };
    }

    async function resolveCandidateTown(cand) {
        if (cand.isEvent || cand.resolved) return cand;

        // Buscar coincidencia cercana con events.json
        const eventsList = (typeof window.eclipseEvents !== 'undefined') ? window.eclipseEvents : [];
        let nearestEvent = null;
        let minD = Infinity;
        eventsList.forEach(e => {
            const d = haversineKm(cand.lat, cand.lng, e.lat, e.lng);
            if (d < minD) {
                minD = d;
                nearestEvent = e;
            }
        });

        if (nearestEvent && minD <= 15) {
            cand.name = `Entorno de ${nearestEvent.town}`;
            cand.town = nearestEvent.town;
            cand.province = nearestEvent.province;
            cand.resolved = true;
            return cand;
        }

        // Geocodificación inversa con Photon
        try {
            const res = await fetch(`https://photon.komoot.io/reverse?lat=${cand.lat}&lon=${cand.lng}`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.features && data.features.length > 0) {
                    const props = data.features[0].properties;
                    const townName = props.city || props.town || props.village || props.locality || props.county || "Municipio";
                    const provName = props.state || props.county || "España";
                    cand.name = `Entorno de ${townName}`;
                    cand.town = townName;
                    cand.province = provName;
                    cand.resolved = true;
                    return cand;
                }
            }
        } catch (e) {
            console.warn('Reverse geocode candidate error:', e);
        }

        cand.name = `Zona Rural (${cand.lat.toFixed(2)}°, ${cand.lng.toFixed(2)}°)`;
        cand.town = 'Franja de Totalidad';
        return cand;
    }

    async function executeLocationSearch() {
        const container = document.getElementById('finder-results-container');
        if (container) {
            container.innerHTML = '<div style="text-align:center; padding: 2rem; color: #a4b0be;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top:0.5rem;">Buscando mejores destinos...</p></div>';
        }

        const inputEl = document.getElementById('finder-origin-input');
        const sliderEl = document.getElementById('finder-radius-slider');
        const priorityEl = document.getElementById('finder-priority');

        const originInputStr = (inputEl && inputEl.value) ? inputEl.value.trim() : 'Palencia';
        const maxRadiusKm = parseFloat((sliderEl && sliderEl.value) ? sliderEl.value : '75');
        const priority = (priorityEl && priorityEl.value) ? priorityEl.value : 'weather';

        // Determinar coordenadas de origen (asíncrono con geocodificación)
        const origin = await resolveOriginCoordinates(originInputStr);

        const candidates = [];

        // 1. Evaluar puntos de events.json
        const eventsList = (typeof window.eclipseEvents !== 'undefined') ? window.eclipseEvents : [];
        eventsList.forEach(e => {
            const dist = haversineKm(origin.lat, origin.lng, e.lat, e.lng);
            if (dist <= maxRadiusKm) {
                let cloudPct = 50;
                if (typeof window.getWeatherForecast === 'function') {
                    const fc = window.getWeatherForecast(e.lat, e.lng);
                    if (fc && fc.c_total !== null) cloudPct = fc.c_total;
                }
                candidates.push({
                    name: e.name,
                    town: e.town || e.province,
                    province: e.province,
                    lat: e.lat,
                    lng: e.lng,
                    distKm: Math.round(dist),
                    cloudPct: cloudPct,
                    isEvent: true,
                    type: e.category || 'Zona Pública',
                    url: e.url
                });
            }
        });

        // 2. Evaluar puntos de la matriz meteorológica
        const gridPoints = (typeof window.weatherForecastData !== 'undefined' && window.weatherForecastData.points) ? window.weatherForecastData.points : [];
        gridPoints.forEach(p => {
            const dist = haversineKm(origin.lat, origin.lng, p.lat, p.lon);
            if (dist <= maxRadiusKm && p.c_total !== null) {
                candidates.push({
                    name: `Punto Muestreo (${p.lat.toFixed(2)}, ${p.lon.toFixed(2)})`,
                    town: 'Buscando municipio...',
                    province: 'España',
                    lat: p.lat,
                    lng: p.lon,
                    distKm: Math.round(dist),
                    cloudPct: p.c_total,
                    isEvent: false,
                    type: 'Muestreo Meteorológico',
                    url: null
                });
            }
        });

        // Ordenar candidatos
        candidates.sort((a, b) => {
            if (priority === 'weather') {
                return a.cloudPct - b.cloudPct || a.distKm - b.distKm;
            } else if (priority === 'events') {
                if (a.isEvent && !b.isEvent) return -1;
                if (!a.isEvent && b.isEvent) return 1;
                return a.cloudPct - b.cloudPct;
            } else {
                return a.distKm - b.distKm;
            }
        });

        const top3 = candidates.slice(0, 3);

        // Resolver nombres de municipio para el Top 3
        for (let i = 0; i < top3.length; i++) {
            top3[i] = await resolveCandidateTown(top3[i]);
        }

        renderTopDestinations(origin, top3, maxRadiusKm);
        highlightTopDestinationsOnMap(top3);
    }

    function renderTopDestinations(origin, top3, maxRadiusKm) {
        const container = document.getElementById('finder-results-container');
        if (!container) return;

        if (top3.length === 0) {
            container.innerHTML = `
                <div class="finder-no-results">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    No se encontraron puntos en un radio de ${maxRadiusKm} km desde ${origin.name}. Pruebe a aumentar el radio de búsqueda.
                </div>
            `;
            return;
        }

        let html = `<div class="finder-origin-badge"><i class="fa-solid fa-location-dot"></i> Origen: <strong>${origin.name}</strong> (Radio: ${maxRadiusKm} km)</div>`;
        html += `<div class="finder-cards-grid">`;

        top3.forEach((dest, idx) => {
            const medalClass = idx === 0 ? 'gold' : (idx === 1 ? 'silver' : 'bronze');
            const medalIcon = idx === 0 ? '🥇 1º Opción Óptima' : (idx === 1 ? '🥈 2º Opción' : '🥉 3º Opción');
            const cloudBadgeColor = dest.cloudPct <= 30 ? '#2ecc71' : (dest.cloudPct <= 60 ? '#f1c40f' : '#e74c3c');

            html += `
                <div class="finder-card ${medalClass}">
                    <div class="finder-card-header">
                        <span class="finder-card-rank">${medalIcon}</span>
                        <span class="finder-card-dist"><i class="fa-solid fa-route"></i> a ${dest.distKm} km</span>
                    </div>
                    <div class="finder-card-title">${dest.name}</div>
                    <div class="finder-card-sub"><i class="fa-solid fa-map-pin"></i> ${dest.town} (${dest.province})</div>
                    
                    <div class="finder-card-meta">
                        <div class="finder-meta-item">
                            <span>Previsión Nubes:</span>
                            <strong style="color: ${cloudBadgeColor}">${dest.cloudPct}% nubes</strong>
                        </div>
                        <div class="finder-meta-item">
                            <span>Tipo:</span>
                            <strong>${dest.type}</strong>
                        </div>
                    </div>

                    <div class="finder-card-actions">
                        <button class="btn-select-finder" onclick="document.dispatchEvent(new CustomEvent('poi-calc', {detail: {lat: ${dest.lat}, lng: ${dest.lng}, name: '${dest.name.replace(/'/g, "\\'")}'}})); document.getElementById('modal-location-finder').classList.add('hidden');">
                            <i class="fa-solid fa-crosshairs"></i> Ver en el mapa
                        </button>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML = html;
    }

    function highlightTopDestinationsOnMap(top3) {
        if (typeof L === 'undefined') return;
        const targetMap = window.eclipseMap || (window.map && typeof window.map.addLayer === 'function' ? window.map : null);
        if (!targetMap) return;

        if (finderMarkersGroup) {
            targetMap.removeLayer(finderMarkersGroup);
        }
        finderMarkersGroup = L.layerGroup();

        top3.forEach((dest, idx) => {
            const starIcon = L.divIcon({
                className: '',
                html: `<div class="finder-map-star rank-${idx + 1}">${idx + 1}</div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });

            const marker = L.marker([dest.lat, dest.lng], { icon: starIcon })
                .bindPopup(`<strong>${idx + 1}º Destino Sugerido: ${dest.name}</strong><br>${dest.distKm} km desde tu origen (${dest.cloudPct}% nubes)`);

            finderMarkersGroup.addLayer(marker);
        });

        finderMarkersGroup.addTo(targetMap);
    }

    document.addEventListener('DOMContentLoaded', () => {
        initLocationFinderModal();
    });

    window.EclipseLocationFinder = {
        executeLocationSearch
    };
})();
