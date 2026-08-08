window.BesselianCalculator = (function() {
    // Leemos la configuración inyectada por config.js
    const BC = window.EclipseConfig.besselian;

    const T0 = BC.T0;
    const DELTA_T = BC.DELTA_T;
    
    const X_COEFFS = BC.X_COEFFS;
    const Y_COEFFS = BC.Y_COEFFS;
    const D_COEFFS = BC.D_COEFFS;
    const L1_COEFFS = BC.L1_COEFFS;
    const L2_COEFFS = BC.L2_COEFFS;
    const MU_COEFFS = BC.MU_COEFFS;
    
    const L2_CORRECTION_BASE = BC.limb_correction.frontend.base;
    const L2_CORRECTION_SLOPE = BC.limb_correction.frontend.slope;
    
    const TAN_F1 = 0.00461410;
    const TAN_F2 = 0.00459110;

    // Constantes de la Tierra (WGS84)
    const FLATTENING = 1.0 / 298.257223563;
    const A_M = 6378137.0; // Radio ecuatorial en metros

    function evalPoly(coeffs, t) {
        let sum = 0;
        let tPower = 1;
        for (let i = 0; i < coeffs.length; i++) {
            sum += coeffs[i] * tPower;
            tPower *= t;
        }
        return sum;
    }

    function getObserverCoordinates(lat_deg, lon_deg, height_m) {
        const lat = lat_deg * Math.PI / 180.0;
        const u = Math.atan((1.0 - FLATTENING) * Math.tan(lat));
        const rho_sin_phi = (1.0 - FLATTENING) * Math.sin(u) + (height_m / A_M) * Math.sin(lat);
        const rho_cos_phi = Math.cos(u) + (height_m / A_M) * Math.cos(lat);
        return { rho_sin_phi, rho_cos_phi, lon_deg };
    }

    function getShadowState(t, obs) {
        const x = evalPoly(X_COEFFS, t);
        const y = evalPoly(Y_COEFFS, t);
        const d = evalPoly(D_COEFFS, t) * Math.PI / 180.0;
        const l1 = evalPoly(L1_COEFFS, t);
        
        const l2_corr = L2_CORRECTION_BASE + L2_CORRECTION_SLOPE * t;
        const l2 = evalPoly(L2_COEFFS, t) - l2_corr;
        
        const mu_corr = -DELTA_T * MU_COEFFS[1] / 3600.0;
        const mu = evalPoly(MU_COEFFS, t) + mu_corr; // en grados
        
        // H = Hour angle = mu + lon (si la longitud es positiva al Este)
        const H = (mu + obs.lon_deg) * Math.PI / 180.0;
        
        // Proyección al plano fundamental
        const xi = obs.rho_cos_phi * Math.sin(H);
        const eta = obs.rho_sin_phi * Math.cos(d) - obs.rho_cos_phi * Math.sin(d) * Math.cos(H);
        const zeta = obs.rho_sin_phi * Math.sin(d) + obs.rho_cos_phi * Math.cos(d) * Math.cos(H);
        
        // Distancia
        const u = x - xi;
        const v = y - eta;
        const m = Math.sqrt(u*u + v*v);
        
        // Radios de penumbra y umbra en el plano del observador
        const l1_zeta = l1 - zeta * TAN_F1;
        const l2_zeta = l2 - zeta * TAN_F2;
        
        return { m, l1_zeta, l2_zeta };
    }

    function tToDate(t) {
        if (t === null) return null;
        // t está en horas desde T0 (18.0) en Tiempo Dinámico Terrestre (TDT).
        // UT = TDT - DELTA_T
        const ut_hours = BC.T0 + t - (DELTA_T / 3600.0);
        const ms = ut_hours * 3600000;
        const baseDate = new Date(`${BC.eclipse_date}T00:00:00Z`);
        return new Date(baseDate.getTime() + ms);
    }

    return {
        /**
         * Calcula las circunstancias locales (C1-C4)
         * Devolverá un objeto compatible con lo que esperaba app.js de Astronomy Engine
         */
        calculateLocalCircumstances: function(lat, lon, height = 0) {
            const obs = getObserverCoordinates(lat, lon, height);
            
            let C1 = null;
            let C2 = null;
            let peak_t = null;
            let C3 = null;
            let C4 = null;
            
            let min_m = Infinity;
            
            // 1. Barrido grueso a pasos de 5 segundos (4,320 iteraciones en lugar de 216,000)
            const dt_coarse = 5.0 / 3600.0;
            
            let is_partial = false;
            let is_total = false;
            
            let c1_coarse_idx = null, c2_coarse_idx = null, c3_coarse_idx = null, c4_coarse_idx = null;

            let t_arr = [];
            let i = 0;
            for (let t = -3.0; t <= 3.0; t += dt_coarse) {
                t_arr.push(t);
                const { m, l1_zeta, l2_zeta } = getShadowState(t, obs);
                
                if (m < min_m) {
                    min_m = m;
                    peak_t = t;
                }
                
                // Contactos parciales (C1, C4)
                if (m < l1_zeta) {
                    if (!is_partial) {
                        c1_coarse_idx = i;
                        is_partial = true;
                    }
                    c4_coarse_idx = i;
                }
                
                // Contactos totales (C2, C3)
                if (m < Math.abs(l2_zeta)) {
                    if (!is_total) {
                        c2_coarse_idx = i;
                        is_total = true;
                    }
                    c3_coarse_idx = i;
                }
                i++;
            }

            // Función auxiliar de búsqueda binaria para refinar los instantes de contacto con precisión sub-segundo (<0.01s)
            function refineContactTime(tStart, tEnd, checkFn) {
                let low = tStart;
                let high = tEnd;
                for (let step = 0; step < 12; step++) {
                    const mid = (low + high) / 2;
                    if (checkFn(getShadowState(mid, obs))) {
                        high = mid;
                    } else {
                        low = mid;
                    }
                }
                return (low + high) / 2;
            }

            if (c1_coarse_idx !== null) {
                const t0 = c1_coarse_idx > 0 ? t_arr[c1_coarse_idx - 1] : t_arr[c1_coarse_idx];
                const t1 = t_arr[c1_coarse_idx];
                C1 = refineContactTime(t0, t1, (state) => state.m < state.l1_zeta);
            }

            if (c4_coarse_idx !== null) {
                const t0 = t_arr[c4_coarse_idx];
                const t1 = c4_coarse_idx < t_arr.length - 1 ? t_arr[c4_coarse_idx + 1] : t_arr[c4_coarse_idx];
                C4 = refineContactTime(t0, t1, (state) => state.m >= state.l1_zeta);
            }

            if (c2_coarse_idx !== null) {
                const t0 = c2_coarse_idx > 0 ? t_arr[c2_coarse_idx - 1] : t_arr[c2_coarse_idx];
                const t1 = t_arr[c2_coarse_idx];
                C2 = refineContactTime(t0, t1, (state) => state.m < Math.abs(state.l2_zeta));
            }

            if (c3_coarse_idx !== null) {
                const t0 = t_arr[c3_coarse_idx];
                const t1 = c3_coarse_idx < t_arr.length - 1 ? t_arr[c3_coarse_idx + 1] : t_arr[c3_coarse_idx];
                C3 = refineContactTime(t0, t1, (state) => state.m >= Math.abs(state.l2_zeta));
            }
            
            // Cálculo de magnitud / obscuration en el pico refinado
            let obscuration = 0;
            if (peak_t !== null) {
                const { m, l1_zeta, l2_zeta } = getShadowState(peak_t, obs);
                if (m < Math.abs(l2_zeta) && l2_zeta < 0) {
                    obscuration = 1.0;
                } else if (m < l1_zeta) {
                    obscuration = (l1_zeta - m) / (l1_zeta + l2_zeta);
                    if (obscuration > 1.0) obscuration = 1.0;
                    if (obscuration < 0.0) obscuration = 0.0;
                }
            }
            
            return {
                partial_begin: C1 !== null ? { time: { date: tToDate(C1) } } : null,
                total_begin: C2 !== null ? { time: { date: tToDate(C2) } } : null,
                peak: peak_t !== null ? { time: { date: tToDate(peak_t) } } : null,
                total_end: C3 !== null ? { time: { date: tToDate(C3) } } : null,
                partial_end: C4 !== null ? { time: { date: tToDate(C4) } } : null,
                obscuration: obscuration
            };
        }
    };
})();
