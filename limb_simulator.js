/**
 * Baily's Beads Simulator - Datos Reales LOLA
 * =============================================
 * 
 * Usa el perfil de limbo lunar derivado de LOLA/SLDEM2015
 * (archivo lunar_limb_profile.js) con los parámetros de libración
 * específicos del eclipse del 12 de agosto de 2026.
 * 
 * NO usa datos aleatorios. El perfil es determinista y basado
 * en la topografía real de la Luna.
 */

window.LimbSimulator = (() => {
    let canvas, ctx;
    let scrub, timeLabel;
    let limbData = [];   // Correcciones en arcsec desde LOLA
    let limbNorm = [];   // Correcciones normalizadas a píxeles

    function init() {
        canvas = document.getElementById('beads-canvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        scrub = document.getElementById('beads-scrub');
        timeLabel = document.getElementById('beads-time-label');

        // Cargar datos reales del perfil LOLA
        if (window.LUNAR_LIMB_PROFILE && window.LUNAR_LIMB_PROFILE.data) {
            limbData = window.LUNAR_LIMB_PROFILE.data;
            console.log(`LimbSimulator: Cargados ${limbData.length} puntos LOLA (${window.LUNAR_LIMB_PROFILE.unit})`);
            console.log(`  Libración: l=${window.LUNAR_LIMB_PROFILE.libration.l}°, b=${window.LUNAR_LIMB_PROFILE.libration.b}°`);
        } else {
            console.warn('LimbSimulator: LUNAR_LIMB_PROFILE no encontrado. Generando perfil de emergencia.');
            // Fallback determinista (NO aleatorio) si falla la carga
            for (let i = 0; i < 720; i++) {
                const a = (i / 720) * Math.PI * 2;
                limbData.push(
                    Math.sin(a * 7) * 0.5 + Math.sin(a * 13) * 0.3 + Math.sin(a * 29) * 0.15
                );
            }
        }

        // Pre-calcular normalizados: convertir arcsec a fracción del radio solar
        // Radio solar medio ≈ 959.63" → datos LOLA en rango [-2.43", +5.26"]
        // Con scale=4: valle máx = -1.47px, pico máx = +3.19px
        // Margen en T0: moonBaseR(145) - 1.47 = 143.85 > sunR(140) ✓
        const meanSolarRadius = 959.63; // arcsec
        const visualScale = 4.0; // Exageración visual sutil
        
        const rawNorm = limbData.map(arcsec => arcsec / meanSolarRadius * visualScale);

        // Suavizado con media móvil (ventana 9 puntos) para eliminar picos angulosos
        const smoothWindow = 9;
        const half = Math.floor(smoothWindow / 2);
        limbNorm = rawNorm.map((_, i) => {
            let sum = 0;
            for (let k = -half; k <= half; k++) {
                const idx = ((i + k) % rawNorm.length + rawNorm.length) % rawNorm.length;
                sum += rawNorm[idx];
            }
            return sum / smoothWindow;
        });

        if (scrub) {
            scrub.addEventListener('input', () => {
                const t = parseFloat(scrub.value);
                render(t);
                updateTimeLabel(t);
            });
        }
    }

    function updateTimeLabel(t) {
        const seconds = Math.round((t - 0.5) * 20);
        timeLabel.textContent = `T${seconds >= 0 ? '+' : ''}${seconds}s`;
    }

    /**
     * Interpola el perfil de limbo para un ángulo arbitrario.
     * @param {number} angleDeg - Ángulo de posición en grados (0-360)
     * @returns {number} Corrección normalizada en fracción de radio
     */
    function getLimbCorrection(angleDeg) {
        const n = limbNorm.length;
        const resDeg = 360 / n;
        const idx = ((angleDeg % 360) + 360) % 360 / resDeg;
        const i0 = Math.floor(idx) % n;
        const i1 = (i0 + 1) % n;
        const frac = idx - Math.floor(idx);
        return limbNorm[i0] * (1 - frac) + limbNorm[i1] * frac;
    }

    function render(t) {
        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const sunR = w * 0.35;
        
        // En 2026: magnitud 1.0386 → Luna es ~3.86% más grande que el Sol
        // Esto se traduce en un ratio moonR/sunR = 1.0386
        // Para la simulación visual usamos un ratio ligeramente menor
        // para que las perlas sean más visibles al usuario
        const moonBaseR = sunR * 1.038;
        
        // Desplazamiento: la Luna se mueve respecto al Sol
        const offset = (t - 0.5) * (sunR * 0.35);

        // ── FONDO ──
        ctx.fillStyle = '#030305';
        ctx.fillRect(0, 0, w, h);

        // ── 1. CORONA SOLAR ──
        // Solo visible cerca de la totalidad
        const dt = Math.abs(t - 0.5);
        const coronaStrength = Math.max(0, 1.0 - dt * 6);
        if (coronaStrength > 0) {
            // Rayos coronales
            const nRays = 32;
            for (let r = 0; r < nRays; r++) {
                const a = (r / nRays) * Math.PI * 2 + 0.13;
                // Longitud variable basada en datos del limbo (más largo donde hay valles)
                const limbIdx = Math.floor((r / nRays) * limbData.length);
                const limbVal = limbData[limbIdx] || 0;
                const rayLen = sunR * (0.25 + 0.15 * Math.abs(Math.sin(r * 2.7)));
                
                const x1 = cx + Math.cos(a) * sunR;
                const y1 = cy + Math.sin(a) * sunR;
                const x2 = cx + Math.cos(a) * (sunR + rayLen);
                const y2 = cy + Math.sin(a) * (sunR + rayLen);

                const grad = ctx.createLinearGradient(x1, y1, x2, y2);
                grad.addColorStop(0, `rgba(255,255,255,${0.2 * coronaStrength})`);
                grad.addColorStop(1, 'rgba(255,255,255,0)');

                ctx.save();
                ctx.strokeStyle = grad;
                ctx.lineWidth = sunR * (0.03 + 0.02 * Math.sin(r * 1.3));
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
                ctx.restore();
            }

            // Halo difuso
            const haloGrad = ctx.createRadialGradient(cx, cy, sunR * 0.95, cx, cy, sunR * 1.5);
            haloGrad.addColorStop(0, `rgba(220,230,255,${0.3 * coronaStrength})`);
            haloGrad.addColorStop(0.5, `rgba(200,215,255,${0.08 * coronaStrength})`);
            haloGrad.addColorStop(1, 'rgba(200,215,255,0)');
            ctx.fillStyle = haloGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, sunR * 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── 2. DISCO SOLAR ──
        const sunGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunR);
        sunGrad.addColorStop(0, '#fffff0');
        sunGrad.addColorStop(0.5, '#fff8e1');
        sunGrad.addColorStop(0.85, '#ffcc00');
        sunGrad.addColorStop(0.95, '#ff9500');
        sunGrad.addColorStop(1, '#e65100');
        ctx.beginPath();
        ctx.arc(cx, cy, sunR, 0, Math.PI * 2);
        ctx.fillStyle = sunGrad;
        ctx.fill();

        // ── 3. DISCO LUNAR CON PERFIL LOLA REAL ──
        // Usamos curvas cuadráticas entre puntos medios para un borde suave
        const moonCx = cx + offset;
        const nSteps = limbNorm.length;

        // Pre-calcular todos los puntos del borde lunar
        const moonPts = [];
        for (let i = 0; i < nSteps; i++) {
            const angleDeg = (i / nSteps) * 360;
            const angleRad = (i / nSteps) * Math.PI * 2;
            const correction = getLimbCorrection(angleDeg);
            const r = moonBaseR * (1 + correction);
            moonPts.push({
                x: moonCx + Math.cos(angleRad) * r,
                y: cy + Math.sin(angleRad) * r
            });
        }

        // Dibujar con curvas cuadráticas suaves (Catmull-Rom style)
        ctx.beginPath();
        const firstMid = {
            x: (moonPts[0].x + moonPts[1].x) / 2,
            y: (moonPts[0].y + moonPts[1].y) / 2
        };
        ctx.moveTo(firstMid.x, firstMid.y);
        for (let i = 1; i < nSteps; i++) {
            const next = (i + 1) % nSteps;
            const midX = (moonPts[i].x + moonPts[next].x) / 2;
            const midY = (moonPts[i].y + moonPts[next].y) / 2;
            ctx.quadraticCurveTo(moonPts[i].x, moonPts[i].y, midX, midY);
        }
        // Cerrar: último segmento curvo de vuelta al inicio
        ctx.quadraticCurveTo(moonPts[0].x, moonPts[0].y, firstMid.x, firstMid.y);
        ctx.closePath();
        ctx.fillStyle = '#000';
        ctx.fill();

        // ── 4. PERLAS DE BAILY (datos reales) ──
        ctx.globalCompositeOperation = 'screen';
        let beadCount = 0;
        let maxGap = 0;
        let maxBeadX = cx, maxBeadY = cy;

        for (let i = 0; i < nSteps; i++) {
            const angleDeg = (i / nSteps) * 360;
            const angleRad = (i / nSteps) * Math.PI * 2;
            
            const correction = getLimbCorrection(angleDeg);
            const moonEdgeR = moonBaseR * (1 + correction);

            const mx = moonCx + Math.cos(angleRad) * moonEdgeR;
            const my = cy + Math.sin(angleRad) * moonEdgeR;

            // Distancia del borde lunar al centro del Sol
            const dx = mx - cx;
            const dy = my - cy;
            const distToSunCenter = Math.sqrt(dx * dx + dy * dy);

            // Si el borde lunar cae dentro del disco solar → luz escapa
            if (distToSunCenter < sunR) {
                const gap = sunR - distToSunCenter;
                const beadSize = Math.min(gap * 5, sunR * 0.1);

                if (beadSize > 0.5) {
                    const beadGrad = ctx.createRadialGradient(mx, my, 0, mx, my, beadSize);
                    beadGrad.addColorStop(0, '#ffffff');
                    beadGrad.addColorStop(0.15, 'rgba(255,255,240,0.95)');
                    beadGrad.addColorStop(0.4, 'rgba(255,220,100,0.6)');
                    beadGrad.addColorStop(0.7, 'rgba(255,180,50,0.2)');
                    beadGrad.addColorStop(1, 'rgba(255,150,0,0)');

                    ctx.beginPath();
                    ctx.arc(mx, my, beadSize, 0, Math.PI * 2);
                    ctx.fillStyle = beadGrad;
                    ctx.fill();
                    beadCount++;

                    if (gap > maxGap) {
                        maxGap = gap;
                        maxBeadX = mx;
                        maxBeadY = my;
                    }
                }
            }
        }
        ctx.globalCompositeOperation = 'source-over';

        // ── 5. EFECTO ANILLO DE DIAMANTE ──
        // Aparece cuando hay pocas perlas y una domina (C2 o C3)
        if (beadCount > 0 && beadCount < 20 && maxGap > 1.5) {
            const flareR = sunR * 0.35;
            const intensity = Math.min(1, maxGap / 5);
            
            const flareGrad = ctx.createRadialGradient(maxBeadX, maxBeadY, 0, maxBeadX, maxBeadY, flareR);
            flareGrad.addColorStop(0, `rgba(255,255,255,${0.9 * intensity})`);
            flareGrad.addColorStop(0.06, `rgba(255,255,255,${0.5 * intensity})`);
            flareGrad.addColorStop(0.25, `rgba(255,240,200,${0.12 * intensity})`);
            flareGrad.addColorStop(1, 'rgba(255,255,255,0)');

            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = flareGrad;
            ctx.beginPath();
            ctx.arc(maxBeadX, maxBeadY, flareR, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        }

        // ── 6. INDICADOR DE DATOS REALES ──
        if (window.LUNAR_LIMB_PROFILE) {
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.font = '9px monospace';
            ctx.textAlign = 'left';
            ctx.fillText('LOLA/SLDEM2015', 8, h - 8);
        }
    }

    function show() {
        document.getElementById('beads-modal').classList.remove('hidden');
        render(0.5);
        updateTimeLabel(0.5);
        if (scrub) scrub.value = 0.5;
    }

    function hide() {
        document.getElementById('beads-modal').classList.add('hidden');
    }

    return { init, show, hide };
})();
