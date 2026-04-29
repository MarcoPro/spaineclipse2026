window.BesselianCalculator = (function() {
    // Elementos Besselianos NASA/Espenak - Total Solar Eclipse 2026-08-12
    const T0 = 18.0;
    const DELTA_T = 69.11; // Segundos (ajustado según IERS)
    
    const X_COEFFS = [0.475593, 0.5189288, -0.0000773, -0.0000088];
    const Y_COEFFS = [0.771161, -0.2301664, -0.0001245, 0.0000037];
    const D_COEFFS = [14.79667, -0.012065, -0.000003];
    const L1_COEFFS = [0.537954, 0.0000940, -0.0000121];
    const L2_COEFFS = [-0.008142, 0.0000935, -0.0000121];
    const MU_COEFFS = [88.74776, 15.003093];
    
    // Corrección para el limbo lunar
    // Un valor de 0.00008 ajusta la duración reduciéndola exactamente ~4 segundos,
    // calibrando con las referencias sin recortar la franja drásticamente.
    const L2_CORRECTION = 0.00005;
    
    const TAN_F1 = 0.0046141;
    const TAN_F2 = 0.0045911;

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
        const l2 = evalPoly(L2_COEFFS, t) - L2_CORRECTION;
        
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
        const ut_hours = 18.0 + t - (DELTA_T / 3600.0);
        const ms = ut_hours * 3600000;
        const baseDate = new Date('2026-08-12T00:00:00Z');
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
            
            // Barrido matemático (Brute-force scan).
            // Dado que evaluamos simple aritmética, 0.1 segundos de resolución = 216,000 iteraciones
            // Tarda menos de 5ms en JavaScript. Perfectamente viable para cálculos de UI rápidos.
            const dt = 0.1 / 3600.0; // Pasos de 0.1 segundos
            
            let is_partial = false;
            let is_total = false;
            
            for (let t = -3.0; t <= 3.0; t += dt) {
                const { m, l1_zeta, l2_zeta } = getShadowState(t, obs);
                
                if (m < min_m) {
                    min_m = m;
                    peak_t = t;
                }
                
                // Contactos parciales (C1, C4)
                if (m < l1_zeta) {
                    if (!is_partial) {
                        C1 = t;
                        is_partial = true;
                    }
                    C4 = t; // actualizamos continuamente hasta que deje de ser parcial
                }
                
                // Contactos totales (C2, C3)
                if (m < Math.abs(l2_zeta)) {
                    if (!is_total) {
                        C2 = t;
                        is_total = true;
                    }
                    C3 = t;
                }
            }
            
            // Calculo de magnitud / obscuration en el pico
            let obscuration = 0;
            if (peak_t !== null) {
                const { m, l1_zeta, l2_zeta } = getShadowState(peak_t, obs);
                if (m < Math.abs(l2_zeta) && l2_zeta < 0) {
                    obscuration = 1.0;
                } else if (m < l1_zeta) {
                    // Magnitud de eclipse (fracción del diámetro cubierto)
                    obscuration = (l1_zeta - m) / (l1_zeta + l2_zeta);
                    if (obscuration > 1.0) obscuration = 1.0;
                    if (obscuration < 0.0) obscuration = 0.0;
                }
            }
            
            return {
                partial_begin: C1 ? { time: { date: tToDate(C1) } } : null,
                total_begin: C2 ? { time: { date: tToDate(C2) } } : null,
                peak: peak_t ? { time: { date: tToDate(peak_t) } } : null,
                total_end: C3 ? { time: { date: tToDate(C3) } } : null,
                partial_end: C4 ? { time: { date: tToDate(C4) } } : null,
                obscuration: obscuration
            };
        }
    };
})();
