/**
 * Baily's Beads Simulator v2 — Scientific + Photorealistic
 * =========================================================
 * 
 * Usa perfil LOLA/SLDEM2015 con libración del eclipse 12-Ago-2026.
 * 
 * Perspectiva Visual (Alt-Azimut) para España al atardecer:
 * La luna entra desde el cuadrante inferior-derecho.
 */

window.LimbSimulator = (() => {
    let canvas, ctx, scrub, timeLabel, phaseLabel;
    let btnPlay;
    let limbData = [], limbNorm = [];
    let animId = null, playing = false;

    // Constantes visuales (Alt-Az) para el eclipse 2026 en España (~17:30 UTC)
    // El eclipse ocurre hacia el Oeste. El Norte Celeste está rotado respecto al cénit.
    const PARALLACTIC_ANGLE_DEG = 52; // Rotación del Norte (sentido horario desde Cénit)
    const CONTACT_V_DEG = 122;        // Ángulo de Vértice de entrada C1 (desde Cénit)
    const CONTACT_V_RAD = CONTACT_V_DEG * Math.PI / 180;
    const PARALLACTIC_RAD = PARALLACTIC_ANGLE_DEG * Math.PI / 180;
    const MOON_RATIO = 1.0386;      // Magnitud 2026
    const MEAN_SOLAR_R = 959.63;    // arcsec
    const VISUAL_SCALE = 5;
    const SMOOTH_WINDOW = 7;

    function init() {
        canvas = document.getElementById('beads-canvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        scrub = document.getElementById('beads-scrub');
        timeLabel = document.getElementById('beads-time-label');
        phaseLabel = document.getElementById('beads-phase-label');
        btnPlay = document.getElementById('btn-beads-play');

        // Setup HiDPI canvas
        setupHiDPI();

        // Load LOLA data
        if (window.LUNAR_LIMB_PROFILE && window.LUNAR_LIMB_PROFILE.data) {
            limbData = window.LUNAR_LIMB_PROFILE.data;
        } else {
            for (let i = 0; i < 720; i++) {
                const a = (i / 720) * Math.PI * 2;
                limbData.push(Math.sin(a * 7) * 0.5 + Math.sin(a * 13) * 0.3 + Math.sin(a * 29) * 0.15);
            }
        }

        // Normalize and smooth
        computeNormalized(VISUAL_SCALE);

        // Events
        if (scrub) {
            scrub.addEventListener('input', () => {
                render(parseFloat(scrub.value));
                updateLabels(parseFloat(scrub.value));
            });
        }
        if (btnPlay) {
            btnPlay.addEventListener('click', togglePlay);
        }
    }

    function setupHiDPI() {
        const dpr = window.devicePixelRatio || 1;
        const size = 800;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = canvas.style.width || '';
        canvas.style.height = canvas.style.height || '';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function computeNormalized(scale) {
        const raw = limbData.map(v => v / MEAN_SOLAR_R * scale);
        const half = Math.floor(SMOOTH_WINDOW / 2);
        limbNorm = raw.map((_, i) => {
            let s = 0;
            for (let k = -half; k <= half; k++) {
                s += raw[((i + k) % raw.length + raw.length) % raw.length];
            }
            return s / SMOOTH_WINDOW;
        });
    }

    function getLimbCorr(deg) {
        const n = limbNorm.length;
        const idx = ((deg % 360 + 360) % 360) / (360 / n);
        const i0 = Math.floor(idx) % n;
        const i1 = (i0 + 1) % n;
        const f = idx - Math.floor(idx);
        return limbNorm[i0] * (1 - f) + limbNorm[i1] * f;
    }

    function updateLabels(t) {
        const sec = Math.round((t - 0.5) * 40);
        timeLabel.textContent = `T${sec >= 0 ? '+' : ''}${sec}s`;
        if (phaseLabel) {
            const dt = Math.abs(t - 0.5);
            if (dt < 0.02) phaseLabel.textContent = '◉ TOTALIDAD';
            else if (t < 0.5 && dt < 0.15) phaseLabel.textContent = '◈ Perlas C2';
            else if (t > 0.5 && dt < 0.15) phaseLabel.textContent = '◈ Perlas C3';
            else phaseLabel.textContent = '◑ Parcial';
        }
    }

    function togglePlay() {
        playing = !playing;
        const icon = btnPlay.querySelector('i');
        if (icon) icon.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
        if (playing) animate();
        else if (animId) { cancelAnimationFrame(animId); animId = null; }
    }

    function animate() {
        if (!playing) return;
        let t = parseFloat(scrub.value) + 0.0012;
        if (t > 1) t = 0;
        scrub.value = t;
        render(t);
        updateLabels(t);
        animId = requestAnimationFrame(animate);
    }

    // ──────────────────────────────────────────────
    // RENDER
    // ──────────────────────────────────────────────
    function render(t) {
        const W = 800, H = 800;
        const cx = W / 2, cy = H / 2;
        const sunR = W * 0.32;
        const moonBaseR = sunR * MOON_RATIO;

        // Offset along Vertex Angle (Alt-Az perspective)
        // Cénit (Arriba) es -90° en canvas math.
        const startAngleCanvas = -Math.PI / 2 + CONTACT_V_RAD;
        const motionAngle = startAngleCanvas + Math.PI;

        const travel = (t - 0.5) * (sunR * 0.4);
        const offX = Math.cos(motionAngle) * travel;
        const offY = Math.sin(motionAngle) * travel;
        const moonCx = cx + offX;
        const moonCy = cy + offY;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        renderPhotorealistic(W, H, cx, cy, sunR, moonBaseR, moonCx, moonCy, t);
    }

    // ──────────────────────────────────────────────
    // PHOTOREALISTIC MODE
    // ──────────────────────────────────────────────
    function renderPhotorealistic(W, H, cx, cy, sunR, moonBaseR, moonCx, moonCy, t) {
        ctx.fillStyle = '#020204';
        ctx.fillRect(0, 0, W, H);

        const dt = Math.abs(t - 0.5);
        const nearTotality = dt < 0.2; // Performance gate
        const coronaStr = Math.max(0, 1 - dt * 6);

        // ── CORONA (only near totality) ──
        if (coronaStr > 0 && nearTotality) {
            drawCorona(cx, cy, sunR, coronaStr);
        }

        // ── CHROMOSPHERE ──
        if (dt < 0.08) {
            drawChromosphere(cx, cy, sunR, moonCx, moonCy, moonBaseR, dt);
        }

        // ── SUN DISK (toned down) ──
        const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunR);
        sg.addColorStop(0, '#fff8e1');
        sg.addColorStop(0.4, '#ffe082');
        sg.addColorStop(0.75, '#ffb300');
        sg.addColorStop(0.92, '#ef8c00');
        sg.addColorStop(1, '#c65100');
        ctx.beginPath();
        ctx.arc(cx, cy, sunR, 0, Math.PI * 2);
        ctx.fillStyle = sg;
        ctx.fill();

        // ── MOON DISK with LOLA profile ──
        drawMoonDisk(moonCx, moonCy, moonBaseR);

        // ── LUNAR LIMB PROFILE (visible outline) ──
        drawLimbProfileOutline(moonCx, moonCy, moonBaseR, cx, cy, sunR);

        // ── BAILY'S BEADS (skip when far from totality for performance) ──
        if (nearTotality) {
            const n = limbNorm.length;
            const beads = findBeads(n, moonBaseR, moonCx, moonCy, cx, cy, sunR);
            ctx.globalCompositeOperation = 'screen';

            let maxGap = 0, maxBx = cx, maxBy = cy, beadCount = 0;
            // Cap rendered beads for performance
            const maxRendered = 60;
            for (const b of beads) {
                if (beadCount >= maxRendered) break;
                const sz = Math.min(b.gap * 3.5, sunR * 0.06);
                if (sz < 0.5) continue;
                beadCount++;

                // Main bead glow
                const bg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, sz * 1.5);
                bg.addColorStop(0, 'rgba(255,255,255,0.95)');
                bg.addColorStop(0.15, 'rgba(255,250,230,0.8)');
                bg.addColorStop(0.4, 'rgba(255,220,120,0.4)');
                bg.addColorStop(0.7, 'rgba(255,180,50,0.1)');
                bg.addColorStop(1, 'rgba(255,160,0,0)');
                ctx.fillStyle = bg;
                ctx.beginPath();
                ctx.arc(b.x, b.y, sz * 1.5, 0, Math.PI * 2);
                ctx.fill();

                if (b.gap > maxGap) { maxGap = b.gap; maxBx = b.x; maxBy = b.y; }
            }
            ctx.globalCompositeOperation = 'source-over';

            // ── DIAMOND RING (reduced intensity) ──
            if (beadCount > 0 && beadCount < 12 && maxGap > 2) {
                drawDiamondRing(maxBx, maxBy, sunR, maxGap);
            }
        }

        // ── DATA LABEL ──
        if (window.LUNAR_LIMB_PROFILE) {
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.font = '10px monospace';
            ctx.textAlign = 'left';
            ctx.fillText('LOLA/SLDEM2015', 10, H - 12);
        }
    }

    function drawCorona(cx, cy, sunR, strength) {
        // Reduced ray count for performance (24 instead of 48)
        const nRays = 24;
        for (let r = 0; r < nRays; r++) {
            const a = (r / nRays) * Math.PI * 2 + 0.08;
            const eqFactor = 1 + 0.2 * Math.pow(Math.sin(a * 2), 2);
            const rayLen = sunR * (0.15 + 0.15 * Math.abs(Math.sin(r * 2.1 + 0.5))) * eqFactor;
            const rayW = sunR * (0.012 + 0.01 * Math.sin(r * 1.7));

            const x1 = cx + Math.cos(a) * sunR * 0.99;
            const y1 = cy + Math.sin(a) * sunR * 0.99;
            const x2 = cx + Math.cos(a) * (sunR + rayLen);
            const y2 = cy + Math.sin(a) * (sunR + rayLen);

            const g = ctx.createLinearGradient(x1, y1, x2, y2);
            g.addColorStop(0, `rgba(200,215,240,${0.18 * strength})`);
            g.addColorStop(0.5, `rgba(190,210,240,${0.05 * strength})`);
            g.addColorStop(1, 'rgba(190,210,240,0)');

            ctx.strokeStyle = g;
            ctx.lineWidth = rayW;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        // Subtle inner halo
        const hg = ctx.createRadialGradient(cx, cy, sunR * 0.95, cx, cy, sunR * 1.4);
        hg.addColorStop(0, `rgba(210,220,245,${0.2 * strength})`);
        hg.addColorStop(0.4, `rgba(200,215,240,${0.06 * strength})`);
        hg.addColorStop(1, 'rgba(200,215,240,0)');
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(cx, cy, sunR * 1.4, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawChromosphere(cx, cy, sunR, moonCx, moonCy, moonBaseR, dt) {
        const alpha = Math.max(0, 0.7 - dt * 8);
        if (alpha <= 0) return;

        ctx.save();
        // Clip to outside moon
        ctx.beginPath();
        ctx.rect(0, 0, 800, 800);
        ctx.arc(moonCx, moonCy, moonBaseR * 0.995, 0, Math.PI * 2, true);
        ctx.clip();

        // Thin red/pink arc
        ctx.beginPath();
        ctx.arc(cx, cy, sunR + 1, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 30, 70, ${alpha * 0.6})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Glow
        ctx.beginPath();
        ctx.arc(cx, cy, sunR + 1, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 50, 100, ${alpha * 0.25})`;
        ctx.lineWidth = 6;
        ctx.stroke();

        ctx.restore();
    }

    function drawMoonDisk(moonCx, moonCy, moonBaseR) {
        const n = limbNorm.length;
        const pts = [];
        for (let i = 0; i < n; i++) {
            const deg = (i / n) * 360;
            const rad = (i / n) * Math.PI * 2;
            const corr = getLimbCorr(deg);
            const r = moonBaseR * (1 + corr);
            // Mapeo: Cénit (-pi/2) + Paraláctico - ángulo lunar (antihorario)
            const radCanvas = -Math.PI / 2 + PARALLACTIC_RAD - rad;
            pts.push({ x: moonCx + Math.cos(radCanvas) * r, y: moonCy + Math.sin(radCanvas) * r });
        }

        // Smooth quadratic path
        ctx.beginPath();
        const fm = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        ctx.moveTo(fm.x, fm.y);
        for (let i = 1; i < n; i++) {
            const next = (i + 1) % n;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y,
                (pts[i].x + pts[next].x) / 2, (pts[i].y + pts[next].y) / 2);
        }
        ctx.quadraticCurveTo(pts[0].x, pts[0].y, fm.x, fm.y);
        ctx.closePath();

        // Subtle gradient on moon surface
        const mg = ctx.createRadialGradient(moonCx, moonCy, 0, moonCx, moonCy, moonBaseR);
        mg.addColorStop(0, '#0a0a0c');
        mg.addColorStop(0.7, '#050507');
        mg.addColorStop(1, '#000000');
        ctx.fillStyle = mg;
        ctx.fill();
    }

    // ── LUNAR LIMB PROFILE OUTLINE ──
    // Draws a subtle glowing outline showing the LOLA rugosity
    function drawLimbProfileOutline(moonCx, moonCy, moonBaseR, cx, cy, sunR) {
        const n = limbNorm.length;
        // Only draw the portion near the sun's edge (±90° from contact zone)
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < n; i++) {
            const deg = (i / n) * 360;
            const rad = (i / n) * Math.PI * 2;
            const corr = getLimbCorr(deg);
            const r = moonBaseR * (1 + corr);
            const radCanvas = -Math.PI / 2 + PARALLACTIC_RAD - rad;
            const px = moonCx + Math.cos(radCanvas) * r;
            const py = moonCy + Math.sin(radCanvas) * r;

            // Check proximity to sun edge
            const dx = px - cx, dy = py - cy;
            const distToSun = Math.sqrt(dx * dx + dy * dy);
            const nearEdge = Math.abs(distToSun - sunR) < sunR * 0.15;

            if (nearEdge) {
                if (!started) { ctx.moveTo(px, py); started = true; }
                else ctx.lineTo(px, py);
            } else {
                started = false;
            }
        }
        ctx.strokeStyle = 'rgba(200, 160, 80, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Also draw reference smooth circle near edge
        ctx.beginPath();
        ctx.arc(moonCx, moonCy, moonBaseR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(100, 170, 210, 0.15)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
    }

    function drawDiamondRing(bx, by, sunR, gap) {
        const intensity = Math.min(1, gap / 6) * 0.7; // Toned down
        const flareR = sunR * 0.25; // Smaller flare

        ctx.globalCompositeOperation = 'screen';

        // Main flare (reduced)
        const fg = ctx.createRadialGradient(bx, by, 0, bx, by, flareR);
        fg.addColorStop(0, `rgba(255,255,255,${0.7 * intensity})`);
        fg.addColorStop(0.06, `rgba(255,255,240,${0.35 * intensity})`);
        fg.addColorStop(0.2, `rgba(255,240,200,${0.08 * intensity})`);
        fg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(bx, by, flareR, 0, Math.PI * 2);
        ctx.fill();

        // Simple spikes (only if strong)
        if (intensity > 0.35) {
            ctx.save();
            ctx.translate(bx, by);
            for (let s = 0; s < 4; s++) {
                const angle = s * Math.PI / 2 + Math.PI / 4;
                const spikeLen = flareR * 0.5 * intensity;
                const sg = ctx.createLinearGradient(0, 0,
                    Math.cos(angle) * spikeLen, Math.sin(angle) * spikeLen);
                sg.addColorStop(0, `rgba(255,255,255,${0.25 * intensity})`);
                sg.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.strokeStyle = sg;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(angle) * spikeLen, Math.sin(angle) * spikeLen);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-Math.cos(angle) * spikeLen, -Math.sin(angle) * spikeLen);
                ctx.stroke();
            }
            ctx.restore();
        }

        ctx.globalCompositeOperation = 'source-over';
    }

    // ──────────────────────────────────────────────
    // BEAD DETECTION
    // ──────────────────────────────────────────────
    function findBeads(n, moonBaseR, moonCx, moonCy, cx, cy, sunR) {
        const beads = [];
        for (let i = 0; i < n; i++) {
            const deg = (i / n) * 360;
            const rad = (i / n) * Math.PI * 2;
            const corr = getLimbCorr(deg);
            const edgeR = moonBaseR * (1 + corr);
            const radCanvas = -Math.PI / 2 + PARALLACTIC_RAD - rad;
            const mx = moonCx + Math.cos(radCanvas) * edgeR;
            const my = moonCy + Math.sin(radCanvas) * edgeR;
            const dx = mx - cx, dy = my - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < sunR) {
                beads.push({ x: mx, y: my, gap: sunR - dist, angle: deg });
            }
        }
        return beads;
    }

    // ──────────────────────────────────────────────
    // PUBLIC API
    // ──────────────────────────────────────────────
    function show() {
        document.getElementById('beads-modal').classList.remove('hidden');
        setupHiDPI();
        computeNormalized(VISUAL_SCALE);
        render(0.5);
        updateLabels(0.5);
        if (scrub) scrub.value = 0.5;
    }

    function hide() {
        document.getElementById('beads-modal').classList.add('hidden');
        if (playing) togglePlay();
    }

    return { init, show, hide };
})();
