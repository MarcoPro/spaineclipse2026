/**
 * Eclipse Solar España 2026 - Recomendador Inteligente por Radio de Kilómetros
 */
(function () {
    let finderMarkersGroup = null;

    // Municipios y ciudades comunes enriquecidas en España
    const KNOWN_ORIGINS = [
        { name: "Palencia", lat: 42.0096, lng: -4.5288, province: "Palencia" },
        { name: "Valladolid", lat: 41.6523, lng: -4.7245, province: "Valladolid" },
        { name: "Burgos", lat: 42.3440, lng: -3.6969, province: "Burgos" },
        { name: "Arévalo", lat: 41.0625, lng: -4.7208, province: "Ávila" },
        { name: "Medina del Campo", lat: 41.3142, lng: -4.9145, province: "Valladolid" },
        { name: "Aranda de Duero", lat: 41.6704, lng: -3.6892, province: "Burgos" },
        { name: "Guardo", lat: 42.7885, lng: -4.8436, province: "Palencia" },
        { name: "Aguilar de Campoo", lat: 42.7933, lng: -4.2608, province: "Palencia" },
        { name: "Paredes de Nava", lat: 42.1558, lng: -4.6942, province: "Palencia" },
        { name: "Osorno la Mayor", lat: 42.4108, lng: -4.3608, province: "Palencia" },
        { name: "Frómista", lat: 42.2675, lng: -4.4069, province: "Palencia" },
        { name: "Saldaña", lat: 42.5208, lng: -4.7408, province: "Palencia" },
        { name: "Cervera de Pisuerga", lat: 42.8647, lng: -4.4986, province: "Palencia" },
        { name: "Peñaranda de Bracamonte", lat: 40.9017, lng: -5.2008, province: "Salamanca" },
        { name: "Salamanca", lat: 40.9688, lng: -5.6639, province: "Salamanca" },
        { name: "Zamora", lat: 41.5063, lng: -5.7446, province: "Zamora" },
        { name: "Toro", lat: 41.5236, lng: -5.3944, province: "Zamora" },
        { name: "Benavente", lat: 42.0028, lng: -5.6783, province: "Zamora" },
        { name: "León", lat: 42.5987, lng: -5.5671, province: "León" },
        { name: "Ponferrada", lat: 42.5466, lng: -6.5908, province: "León" },
        { name: "Astorga", lat: 42.4578, lng: -6.0561, province: "León" },
        { name: "Soria", lat: 41.7640, lng: -2.4688, province: "Soria" },
        { name: "El Burgo de Osma", lat: 41.5861, lng: -3.0678, province: "Soria" },
        { name: "Segovia", lat: 40.9429, lng: -4.1088, province: "Segovia" },
        { name: "Cuéllar", lat: 41.4014, lng: -4.3153, province: "Segovia" },
        { name: "Ávila", lat: 40.6565, lng: -4.6818, province: "Ávila" },
        { name: "Oviedo", lat: 43.3619, lng: -5.8494, province: "Asturias" },
        { name: "Gijón", lat: 43.5322, lng: -5.6611, province: "Asturias" },
        { name: "Avilés", lat: 43.5547, lng: -5.9248, province: "Asturias" },
        { name: "Santander", lat: 43.4623, lng: -3.8099, province: "Cantabria" },
        { name: "Torrelavega", lat: 43.3494, lng: -4.0478, province: "Cantabria" },
        { name: "A Coruña", lat: 43.3623, lng: -8.4115, province: "A Coruña" },
        { name: "Santiago de Compostela", lat: 42.8782, lng: -8.5448, province: "A Coruña" },
        { name: "Lugo", lat: 43.0097, lng: -7.5568, province: "Lugo" },
        { name: "Ourense", lat: 42.3364, lng: -7.8636, province: "Ourense" },
        { name: "Madrid", lat: 40.4168, lng: -3.7038, province: "Madrid" },
        { name: "Zaragoza", lat: 41.6561, lng: -0.8773, province: "Zaragoza" },
        { name: "Teruel", lat: 40.3456, lng: -1.1072, province: "Teruel" },
        { name: "Logroño", lat: 42.4650, lng: -2.4456, province: "La Rioja" }
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

        // Manejar interacción visual de los chips de criterios múltiples
        const chipLabels = document.querySelectorAll('.chip-item');
        chipLabels.forEach(chip => {
            const cb = chip.querySelector('input[type="checkbox"]');
            if (cb) {
                cb.addEventListener('change', () => {
                    if (cb.checked) chip.classList.add('active');
                    else chip.classList.remove('active');
                });
            }
        });

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

        // 3. Buscar sugerencias online con Photon
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

        // 4. Buscar vía API Geocoding Komoot Photon
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

    function sanitizeTownName(rawName) {
        if (!rawName) return null;
        let s = rawName.trim();
        if (/^(finca|caser[ií]o|dehesa|pol[ií]gono|parcela|carretera|autov[ií]a|monte|paraje|camino)/i.test(s)) {
            return null;
        }
        return s;
    }

    async function resolveCandidateTown(cand) {
        if (cand.isEvent || cand.resolved) return cand;

        // 1. Buscar coincidencia geográfica con municipios conocidos o eventos (dentro de 18 km)
        let nearestKnown = null;
        let minD = Infinity;

        KNOWN_ORIGINS.forEach(o => {
            const d = haversineKm(cand.lat, cand.lng, o.lat, o.lng);
            if (d < minD) {
                minD = d;
                nearestKnown = { town: o.name, province: o.province || 'España' };
            }
        });

        const eventsList = (typeof window.eclipseEvents !== 'undefined') ? window.eclipseEvents : [];
        eventsList.forEach(e => {
            const d = haversineKm(cand.lat, cand.lng, e.lat, e.lng);
            if (d < minD) {
                minD = d;
                nearestKnown = { town: e.town || e.name, province: e.province || 'España' };
            }
        });

        if (nearestKnown && minD <= 18) {
            cand.name = `Entorno de ${nearestKnown.town}`;
            cand.town = nearestKnown.town;
            cand.province = nearestKnown.province;
            cand.resolved = true;
            return cand;
        }

        // 2. Geocodificación inversa municipal oficial con Nominatim (zoom=12)
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${cand.lat}&lon=${cand.lon || cand.lng}&format=json&zoom=12`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.address) {
                    const addr = data.address;
                    let townName = sanitizeTownName(addr.municipality) ||
                                   sanitizeTownName(addr.city) ||
                                   sanitizeTownName(addr.town) ||
                                   sanitizeTownName(addr.village) ||
                                   sanitizeTownName(addr.county);
                    let provName = addr.state || addr.county || "España";
                    if (townName) {
                        cand.name = `Entorno de ${townName}`;
                        cand.town = townName;
                        cand.province = provName;
                        cand.resolved = true;
                        return cand;
                    }
                }
            }
        } catch (e) {
            console.warn('Nominatim reverse geocode candidate error:', e);
        }

        cand.name = `Zona Rural (${cand.lat.toFixed(2)}°, ${cand.lng.toFixed(2)}°)`;
        cand.town = 'Franja de Totalidad';
        return cand;
    }

    async function executeLocationSearch() {
        const container = document.getElementById('finder-results-container');
        if (container) {
            container.innerHTML = '<div style="text-align:center; padding: 2rem; color: #a4b0be;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top:0.5rem;">Calculando evaluación multicriterio...</p></div>';
        }

        const inputEl = document.getElementById('finder-origin-input');
        const sliderEl = document.getElementById('finder-radius-slider');

        const originInputStr = (inputEl && inputEl.value) ? inputEl.value.trim() : 'Palencia';
        const maxRadiusKm = parseFloat((sliderEl && sliderEl.value) ? sliderEl.value : '75');

        // Leer criterios múltiples activos
        const elW = document.getElementById('crit-weather');
        const elD = document.getElementById('crit-duration');
        const elE = document.getElementById('crit-events');
        const elS = document.getElementById('crit-sun');
        const elK = document.getElementById('crit-distance');

        const useWeather = elW ? elW.checked : true;
        const useDuration = elD ? elD.checked : true;
        const useEvents = elE ? elE.checked : true;
        const useSun = elS ? elS.checked : false;
        const useDistance = elK ? elK.checked : false;

        // Determinar coordenadas de origen
        const origin = await resolveOriginCoordinates(originInputStr);

        const candidates = [];

        // Evaluar candidatos combinando events.json y matriz weatherForecastData
        const rawPoints = [];
        const eventsList = (typeof window.eclipseEvents !== 'undefined') ? window.eclipseEvents : [];
        eventsList.forEach(e => {
            rawPoints.push({
                name: e.name, town: e.town || e.province, province: e.province,
                lat: e.lat, lng: e.lng, isEvent: true, type: e.category || 'Zona Pública', url: e.url
            });
        });

        const gridPoints = (typeof window.weatherForecastData !== 'undefined' && window.weatherForecastData.points) ? window.weatherForecastData.points : [];
        gridPoints.forEach(p => {
            if (p.c_total !== null) {
                rawPoints.push({
                    name: `Punto Muestreo (${p.lat.toFixed(2)}, ${p.lon.toFixed(2)})`,
                    town: 'Buscando municipio...', province: 'España',
                    lat: p.lat, lng: p.lon, isEvent: false, type: 'Muestreo Meteorológico', url: null
                });
            }
        });

        rawPoints.forEach(pt => {
            const dist = haversineKm(origin.lat, origin.lng, pt.lat, pt.lng);
            if (dist <= maxRadiusKm) {
                // Nubes
                let cloudPct = 50;
                if (typeof window.getWeatherForecast === 'function') {
                    const fc = window.getWeatherForecast(pt.lat, pt.lng);
                    if (fc && fc.c_total !== null) cloudPct = fc.c_total;
                }

                // Duración de totalidad
                let durationSec = 90;
                if (window.BesselianCalculator) {
                    const ecl = window.BesselianCalculator.calculateLocalCircumstances(pt.lat, pt.lng, 250);
                    if (ecl && ecl.total_duration) durationSec = Math.round(ecl.total_duration);
                }

                // Altura solar
                let sunAlt = 10.5;
                if (window.Astronomy) {
                    const obs = new window.Astronomy.Observer(pt.lat, pt.lng, 250);
                    const equ = window.Astronomy.Equator('Sun', new Date('2026-08-12T18:28:00Z'), obs, true, true);
                    const hor = window.Astronomy.Horizon(new Date('2026-08-12T18:28:00Z'), obs, equ.ra, equ.dec, 'normal');
                    if (hor && hor.altitude) sunAlt = hor.altitude;
                }

                // Cálculo de puntuación ponderada multicriterio (0 - 100%)
                let totalScore = 0;
                let totalWeight = 0;

                if (useWeather) {
                    const wScore = Math.max(0, 100 - cloudPct);
                    totalScore += wScore * 4.0;
                    totalWeight += 4.0;
                }
                if (useDuration) {
                    const dScore = Math.min(100, (durationSec / 104) * 100);
                    totalScore += dScore * 3.0;
                    totalWeight += 3.0;
                }
                if (useEvents) {
                    const evScore = pt.isEvent ? 100 : 0;
                    totalScore += evScore * 3.0;
                    totalWeight += 3.0;
                }
                if (useSun) {
                    const sScore = Math.min(100, (Math.max(0, sunAlt) / 14) * 100);
                    totalScore += sScore * 2.0;
                    totalWeight += 2.0;
                }
                if (useDistance) {
                    const distRatio = Math.max(0, 1 - (dist / maxRadiusKm));
                    totalScore += distRatio * 100 * 2.0;
                    totalWeight += 2.0;
                }

                const matchPct = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 50;

                candidates.push({
                    ...pt,
                    distKm: Math.round(dist),
                    cloudPct,
                    durationSec,
                    sunAlt,
                    matchPct
                });
            }
        });

        // Ordenar candidatos por porcentaje de afinidad multicriterio
        candidates.sort((a, b) => b.matchPct - a.matchPct || a.distKm - b.distKm);

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
                <div class="finder-no-results" style="text-align:center; padding:1.5rem; color:#a4b0be;">
                    <i class="fa-solid fa-circle-exclamation fa-2x" style="color:#f1c40f;"></i>
                    <p style="margin-top:0.5rem;">No se encontraron puntos en un radio de ${maxRadiusKm} km desde ${origin.name}. Pruebe a aumentar el radio de búsqueda.</p>
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
                        <span class="finder-card-dist" style="color: #2ecc71; font-weight:700;">🎯 ${dest.matchPct}% Coincidencia</span>
                    </div>
                    <div class="finder-card-title">${dest.name}</div>
                    <div class="finder-card-sub"><i class="fa-solid fa-map-pin"></i> ${dest.town} (${dest.province}) | <i class="fa-solid fa-route"></i> a ${dest.distKm} km</div>
                    
                    <div class="finder-card-meta" style="flex-wrap: wrap; gap: 4px;">
                        <div class="finder-meta-item">
                            <span>Nubes:</span>
                            <strong style="color: ${cloudBadgeColor}">${dest.cloudPct}%</strong>
                        </div>
                        <div class="finder-meta-item">
                            <span>Duración:</span>
                            <strong style="color: #f1c40f;">${dest.durationSec}s</strong>
                        </div>
                        <div class="finder-meta-item">
                            <span>Sol:</span>
                            <strong style="color: #3498db;">${dest.sunAlt.toFixed(1)}°</strong>
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
