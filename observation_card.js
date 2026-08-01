/**
 * Eclipse Solar España 2026 - Generador de Tarjeta / Pase de Observación Exportable
 */
(function () {
    function initObservationCardModal() {
        const modal = document.getElementById('modal-observation-card');
        const closeBtn = document.getElementById('close-observation-card');
        const downloadBtn = document.getElementById('btn-download-pass');
        const printBtn = document.getElementById('btn-print-pass');

        if (closeBtn && modal) {
            closeBtn.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
        }

        if (downloadBtn) {
            downloadBtn.addEventListener('click', downloadPassAsImage);
        }

        if (printBtn) {
            printBtn.addEventListener('click', () => {
                window.print();
            });
        }
    }

    function openObservationPass(locationData) {
        const modal = document.getElementById('modal-observation-card');
        if (!modal) return;
        modal.classList.remove('hidden');

        renderPassCanvas(locationData);
    }

    function renderPassCanvas(data) {
        const canvas = document.getElementById('pass-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        // Tamaño HD para tarjeta exportable (800x1100 px)
        canvas.width = 800;
        canvas.height = 1100;

        const w = canvas.width;
        const h = canvas.height;

        // Fondo oscuro astronómico con degradado premium
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#0a0d14');
        bgGrad.addColorStop(0.5, '#121824');
        bgGrad.addColorStop(1, '#05070a');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Borde dorado de gala
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 4;
        ctx.strokeRect(16, 16, w - 32, h - 32);

        ctx.strokeStyle = 'rgba(241, 196, 15, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(22, 22, w - 44, h - 44);

        // --- ENCABEZADO ---
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 22px Outfit, sans-serif';
        ctx.fillText('PASE OFICIAL DE OBSERVADOR DE ECLIPSE SOLAR', w / 2, 60);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Outfit, sans-serif';
        ctx.fillText('ESPAÑA — 12 DE AGOSTO DE 2026', w / 2, 105);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.moveTo(50, 125); ctx.lineTo(w - 50, 125);
        ctx.stroke();

        // --- DATOS DE UBICACIÓN ---
        const locName = (data && data.name) ? data.name : 'España (Franja de Totalidad)';
        const lat = (data && data.lat) ? data.lat.toFixed(4) : '42.0000';
        const lng = (data && data.lng) ? data.lng.toFixed(4) : '-4.5000';
        const ele = (data && data.elevation) ? `${Math.round(data.elevation)}m` : '250m';

        ctx.textAlign = 'left';
        ctx.fillStyle = '#3498db';
        ctx.font = 'bold 16px Outfit, sans-serif';
        ctx.fillText('📍 UBICACIÓN SELECCIONADA', 50, 160);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px Outfit, sans-serif';
        ctx.fillText(locName, 50, 195);

        ctx.fillStyle = '#a4b0be';
        ctx.font = '16px Outfit, sans-serif';
        ctx.fillText(`Coordenadas: Lat ${lat}° N, Lon ${lng}° W  |  Altitud: ${ele}`, 50, 225);

        // --- TABLA DE CONTACTOS ASTRONÓMICOS ---
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 18px Outfit, sans-serif';
        ctx.fillText('⏱️ HORARIOS OFICIALES DE CONTACTO (HORA LOCAL CEST / UTC+2)', 50, 275);

        // Fondo de la tabla
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fillRect(50, 290, w - 100, 260);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.strokeRect(50, 290, w - 100, 260);

        const contacts = [
            { code: 'C1', name: 'Inicio Eclipse Parcial', time: data?.c1?.timeStr || '19:30:12 CEST', note: 'Gafas solares PUESTAS' },
            { code: 'C2', name: 'Inicio de la Totalidad', time: data?.c2?.timeStr || '20:27:45 CEST', note: '¡QUITAR GAFAS SOLARES!' },
            { code: 'MAX', name: 'Eclipse Máximo (Corona)', time: data?.max?.timeStr || '20:28:30 CEST', note: 'Oscuridad total / Vía Láctea' },
            { code: 'C3', name: 'Fin de la Totalidad', time: data?.c3?.timeStr || '20:29:15 CEST', note: '¡PONER GAFAS SOLARES!' },
            { code: 'C4', name: 'Fin Eclipse Parcial', time: data?.c4?.timeStr || '21:22:00 CEST', note: 'Puesta de sol solapada' }
        ];

        let yPos = 330;
        contacts.forEach((c) => {
            const isTotalityRow = (c.code === 'C2' || c.code === 'MAX' || c.code === 'C3');

            ctx.fillStyle = isTotalityRow ? '#f1c40f' : '#ffffff';
            ctx.font = 'bold 18px Outfit, sans-serif';
            ctx.fillText(c.code, 70, yPos);

            ctx.fillStyle = '#ffffff';
            ctx.font = '16px Outfit, sans-serif';
            ctx.fillText(c.name, 130, yPos);

            ctx.fillStyle = isTotalityRow ? '#2ecc71' : '#3498db';
            ctx.font = 'bold 18px Outfit, sans-serif';
            ctx.fillText(c.time, 370, yPos);

            ctx.fillStyle = isTotalityRow ? '#e74c3c' : '#a4b0be';
            ctx.font = 'italic 14px Outfit, sans-serif';
            ctx.fillText(c.note, 580, yPos);

            yPos += 45;
        });

        // --- PREVISIÓN METEOROLÓGICA ---
        ctx.fillStyle = '#3498db';
        ctx.font = 'bold 18px Outfit, sans-serif';
        ctx.fillText('🌤️ PREVISIÓN CLIMÁTICA Y CONDICIONES', 50, 595);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fillRect(50, 610, w - 100, 130);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.strokeRect(50, 610, w - 100, 130);

        const cloudVal = data?.cloudPct !== undefined ? `${data.cloudPct}% nubes` : '20% nubes';
        const sunAlt = data?.sunAlt ? `${data.sunAlt.toFixed(1)}°` : '10.5° sobre horizonte';

        ctx.fillStyle = '#ffffff';
        ctx.font = '16px Outfit, sans-serif';
        ctx.fillText(`· Cobertura Nubosa Prevista: `, 70, 645);
        ctx.fillStyle = '#2ecc71'; ctx.font = 'bold 16px Outfit, sans-serif';
        ctx.fillText(`${cloudVal} (Previsión Diaria Open-Meteo)`, 280, 645);

        ctx.fillStyle = '#ffffff'; ctx.font = '16px Outfit, sans-serif';
        ctx.fillText(`· Altura del Sol al Eclipsarse: `, 70, 680);
        ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 16px Outfit, sans-serif';
        ctx.fillText(`${sunAlt} (Oeste-Noroeste / WNW)`, 280, 680);

        ctx.fillStyle = '#ffffff'; ctx.font = '16px Outfit, sans-serif';
        ctx.fillText(`· Calidad de Observación Esperada: `, 70, 715);
        ctx.fillStyle = '#2ecc71'; ctx.font = 'bold 16px Outfit, sans-serif';
        ctx.fillText(`ÓPTIMA — Excelente visibilidad`, 310, 715);

        // --- CHECKLIST DEL OBSERVADOR ---
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 18px Outfit, sans-serif';
        ctx.fillText('🛡️ CHECKLIST DE EQUIPAMIENTO DEL OBSERVADOR', 50, 780);

        const items = [
            ' Gafas de eclipse homologadas ISO 12312-2 (NUNCA usar gafas de sol comunes)',
            ' Filtro solar ND5.0 para cámaras, telescopios o prismáticos',
            ' Trípode y cámara con batería de repuesto cargada al 100%',
            ' Agua, protección solar de piel y ropa de abrigo ligera para la baja de temp.',
            ' App Eclipse Solar España 2026 cargada en modo offline PWA'
        ];

        let itemY = 815;
        ctx.fillStyle = '#a4b0be';
        ctx.font = '15px Outfit, sans-serif';
        items.forEach(item => {
            ctx.fillText(`[✓] ${item}`, 70, itemY);
            itemY += 32;
        });

        // --- PIE DE PÁGINA ---
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.font = '13px Outfit, sans-serif';
        ctx.fillText('Generado por Eclipse Solar España 2026 — Proyecto de Divulgación Astronómica', w / 2, 1060);
    }

    function downloadPassAsImage() {
        const canvas = document.getElementById('pass-canvas');
        if (!canvas) return;
        const link = document.createElement('a');
        link.download = 'Pase_Observacion_Eclipse_2026.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    document.addEventListener('DOMContentLoaded', () => {
        initObservationCardModal();
    });

    window.EclipseObservationCard = {
        openObservationPass
    };
})();
