/**
 * Eclipse Solar España 2026 - Calculador & Simulador de Encuadre Fotográfico Solar
 */
(function () {
    const SENSOR_FACTORS = {
        'full_frame': { name: 'Full Frame (35mm)', crop: 1.0, width: 36, height: 24 },
        'apsc_canon': { name: 'APS-C (Canon 1.6x)', crop: 1.6, width: 22.3, height: 14.9 },
        'apsc_nikon': { name: 'APS-C (Nikon/Sony 1.5x)', crop: 1.5, width: 23.5, height: 15.6 },
        'm43': { name: 'Micro 4/3 (2.0x)', crop: 2.0, width: 17.3, height: 13.0 },
        'phone': { name: 'Smartphone (1/2.55")', crop: 5.5, width: 5.76, height: 4.29 }
    };

    function initAstrophotoModal() {
        const modal = document.getElementById('modal-astrophoto');
        const closeBtn = document.getElementById('close-astrophoto');
        const openBtn = document.getElementById('btn-astrophoto');

        const selectSensor = document.getElementById('photo-sensor-type');
        const inputFocal = document.getElementById('photo-focal-length');
        const sliderFocal = document.getElementById('photo-focal-slider');

        if (openBtn && modal) {
            openBtn.addEventListener('click', () => {
                if (typeof window.closeAllModals === 'function') window.closeAllModals();
                modal.classList.remove('hidden');
                drawFramingSimulation();
            });
        }

        if (closeBtn && modal) {
            closeBtn.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
        }

        if (selectSensor) {
            selectSensor.addEventListener('change', drawFramingSimulation);
        }

        if (inputFocal && sliderFocal) {
            inputFocal.addEventListener('input', (e) => {
                sliderFocal.value = e.target.value;
                drawFramingSimulation();
            });
            sliderFocal.addEventListener('input', (e) => {
                inputFocal.value = e.target.value;
                drawFramingSimulation();
            });
        }
    }

    function drawFramingSimulation() {
        const canvas = document.getElementById('photo-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        const sensorKey = document.getElementById('photo-sensor-type')?.value || 'full_frame';
        const focal = parseFloat(document.getElementById('photo-focal-length')?.value || '400');
        const sensor = SENSOR_FACTORS[sensorKey] || SENSOR_FACTORS['full_frame'];

        // Diámetro angular aparente del Sol (aprox 0.53° = 0.00925 rad)
        const sunAngularSizeRad = 0.00925;
        // Diámetro en mm sobre el sensor = Focal (mm) * tan(0.53°) = Focal * 0.00925
        const sunImageSizeMM = focal * sunAngularSizeRad;

        // Tamaño del campo de visión (FOV) en grados
        const fovHorizontalDeg = (2 * Math.atan(sensor.width / (2 * focal)) * (180 / Math.PI)).toFixed(2);
        const fovVerticalDeg = (2 * Math.atan(sensor.height / (2 * focal)) * (180 / Math.PI)).toFixed(2);

        // Limpiar canvas
        ctx.clearRect(0, 0, width, height);

        // Fondo del visor de la cámara
        ctx.fillStyle = '#0a0d14';
        ctx.fillRect(0, 0, width, height);

        // Dibujar rejilla de tercios (grid de visor)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(width / 3, 0); ctx.lineTo(width / 3, height);
        ctx.moveTo((2 * width) / 3, 0); ctx.lineTo((2 * width) / 3, height);
        ctx.moveTo(0, height / 3); ctx.lineTo(width, height / 3);
        ctx.moveTo(0, (2 * height) / 3); ctx.lineTo(width, (2 * height) / 3);
        ctx.stroke();

        // Escalar milímetros a píxeles dentro del marco del canvas (manteniendo proporción del sensor)
        const scaleX = (width * 0.85) / sensor.width;
        const scaleY = (height * 0.85) / sensor.height;
        const scale = Math.min(scaleX, scaleY);

        const frameW = sensor.width * scale;
        const frameH = sensor.height * scale;
        const frameX = (width - frameW) / 2;
        const frameY = (height - frameH) / 2;

        // Dibujar marco del sensor
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 2;
        ctx.strokeRect(frameX, frameY, frameW, frameH);

        // Etiqueta del sensor
        ctx.fillStyle = '#3498db';
        ctx.font = '11px Outfit, sans-serif';
        ctx.fillText(`${sensor.name} [FOV: ${fovHorizontalDeg}° x ${fovVerticalDeg}°]`, frameX + 6, frameY + 16);

        // Centro del encuadre
        const centerX = width / 2;
        const centerY = height / 2;

        const sunRadiusPx = (sunImageSizeMM * scale) / 2;

        // Dibujar resplandor / extensión de la corona solar (aprox 2.5 radios solares)
        const coronaRadiusPx = sunRadiusPx * 2.5;
        const coronaGrad = ctx.createRadialGradient(centerX, centerY, sunRadiusPx * 0.9, centerX, centerY, coronaRadiusPx);
        coronaGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        coronaGrad.addColorStop(0.3, 'rgba(241, 196, 15, 0.4)');
        coronaGrad.addColorStop(0.7, 'rgba(52, 152, 219, 0.15)');
        coronaGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = coronaGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, coronaRadiusPx, 0, Math.PI * 2);
        ctx.fill();

        // Dibujar disco solar / eclipsado
        ctx.fillStyle = '#111111';
        ctx.beginPath();
        ctx.arc(centerX, centerY, Math.max(2, sunRadiusPx), 0, Math.PI * 2);
        ctx.fill();

        // Anillo de luz en la silueta de la Luna
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(centerX, centerY, Math.max(2, sunRadiusPx), 0, Math.PI * 2);
        ctx.stroke();

        // Actualizar estadísticas de texto en la interfaz
        const infoSize = document.getElementById('photo-info-size');
        const infoFov = document.getElementById('photo-info-fov');
        const infoRecommend = document.getElementById('photo-info-recommend');

        if (infoSize) infoSize.textContent = `${sunImageSizeMM.toFixed(2)} mm en sensor`;
        if (infoFov) infoFov.textContent = `${fovHorizontalDeg}° x ${fovVerticalDeg}°`;
        if (infoRecommend) {
            const equivFocal = Math.round(focal * sensor.crop);
            if (equivFocal < 150) {
                infoRecommend.textContent = 'Ideal para paisaje panorámico (Sol pequeño en el encuadre).';
            } else if (equivFocal <= 500) {
                infoRecommend.textContent = 'Encuadre perfecto (Captura la corona solar completa).';
            } else {
                infoRecommend.textContent = 'Detalle de prominencias y Perlas de Baily (Sol grande).';
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        initAstrophotoModal();
    });

    window.EclipseAstrophoto = {
        drawFramingSimulation
    };
})();
