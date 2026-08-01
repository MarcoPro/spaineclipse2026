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
        const selectPriority = document.getElementById('finder-priority');

        if (openBtn && modal) {
            openBtn.addEventListener('click', () => {
                modal.classList.remove('hidden');
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
            btnSearch.addEventListener('click', executeLocationSearch);
        }
    }

    function haversineKm(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radio terrestre en km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function executeLocationSearch() {
        const originInputStr = document.getElementById('finder-origin-input')?.value.trim() || 'Palencia';
        const maxRadiusKm = parseFloat(document.getElementById('finder-radius-slider')?.value || '75');
        const priority = document.getElementById('finder-priority')?.value || 'weather';

        // Determinar coordenadas de origen
        let origin = KNOWN_ORIGINS.find(o => o.name.toLowerCase() === originInputStr.toLowerCase());

        if (!origin && window.lastLocation) {
            origin = { name: window.lastLocation.name || 'Mi Ubicación', lat: window.lastLocation.lat, lng: window.lastLocation.lng };
        } else if (!origin) {
            origin = { name: "Palencia", lat: 42.0096, lng: -4.5288 };
        }

        const candidates = [];

        // 1. Evaluar puntos de events.json
        const eventsList = (typeof window.eclipseEvents !== 'undefined') ? window.eclipseEvents : [];
        eventsList.forEach(e => {
            const dist = haversineKm(origin.lat, origin.lng, e.lat, e.lng);
            if (dist <= maxRadiusKm) {
                // Obtener previsión del punto
                let cloudPct = 50;
                let durationSec = 100;
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

        // 2. Evaluar puntos de la matriz meteorológica si no hay suficientes
        const gridPoints = (typeof window.weatherForecastData !== 'undefined' && window.weatherForecastData.points) ? window.weatherForecastData.points : [];
        gridPoints.forEach(p => {
            const dist = haversineKm(origin.lat, origin.lng, p.lat, p.lon);
            if (dist <= maxRadiusKm && p.c_total !== null) {
                candidates.push({
                    name: `Punto Astronómico (${p.lat.toFixed(2)}, ${p.lon.toFixed(2)})`,
                    town: 'Franja de Totalidad',
                    province: 'Castilla / Norte',
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

        // Ordenar candidatos según la prioridad elegida
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
        if (typeof L === 'undefined' || !window.map) return;

        if (finderMarkersGroup) {
            window.map.removeLayer(finderMarkersGroup);
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

        finderMarkersGroup.addTo(window.map);
    }

    document.addEventListener('DOMContentLoaded', () => {
        initLocationFinderModal();
    });

    window.EclipseLocationFinder = {
        executeLocationSearch
    };
})();
