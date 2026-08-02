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

        // Tamaño de alta resolución adaptado exactamente a la proporción DIN A4 (1200x1697 px / 1:1.4142)
        canvas.width = 1200;
        canvas.height = 1697;

        const w = canvas.width;
        const h = canvas.height;

        // Fondo oscuro astronómico con degradado premium
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#06080e');
        bgGrad.addColorStop(0.5, '#101622');
        bgGrad.addColorStop(1, '#030407');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Borde dorado de gala doble
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 6;
        ctx.strokeRect(24, 24, w - 48, h - 48);

        ctx.strokeStyle = 'rgba(241, 196, 15, 0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(34, 34, w - 68, h - 68);

        // --- ENCABEZADO ---
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 30px Outfit, sans-serif';
        ctx.fillText('PASE OFICIAL DE OBSERVADOR DE ECLIPSE SOLAR', w / 2, 95);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 50px Outfit, sans-serif';
        ctx.fillText('ESPAÑA — 12 DE AGOSTO DE 2026', w / 2, 160);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(80, 195); ctx.lineTo(w - 80, 195);
        ctx.stroke();

        // --- DATOS DE UBICACIÓN ---
        const locName = (data && data.name) ? data.name : 'España (Franja de Totalidad)';
        const lat = (data && data.lat) ? data.lat.toFixed(4) : '42.0000';
        const lng = (data && data.lng) ? data.lng.toFixed(4) : '-4.5000';
        const ele = (data && data.elevation) ? `${Math.round(data.elevation)}m` : '250m';

        ctx.textAlign = 'left';
        ctx.fillStyle = '#3498db';
        ctx.font = 'bold 24px Outfit, sans-serif';
        ctx.fillText('📍 UBICACIÓN SELECCIONADA', 80, 250);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 42px Outfit, sans-serif';
        ctx.fillText(locName, 80, 305);

        ctx.fillStyle = '#a4b0be';
        ctx.font = '24px Outfit, sans-serif';
        ctx.fillText(`Coordenadas: Lat ${lat}° N, Lon ${lng}° W  |  Altitud: ${ele}`, 80, 350);

        // --- TABLA DE CONTACTOS ASTRONÓMICOS ---
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 26px Outfit, sans-serif';
        ctx.fillText('⏱️ HORARIOS OFICIALES DE CONTACTO (HORA LOCAL CEST / UTC+2)', 80, 420);

        // Fondo de la tabla
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fillRect(80, 445, w - 160, 400);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.strokeRect(80, 445, w - 160, 400);

        const timeFmt = new Intl.DateTimeFormat('es-ES', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Madrid'
        });

        function getFormattedContactTime(cObj) {
            if (!cObj) return '--:--:-- CEST';
            if (typeof cObj === 'string') return cObj.includes('CEST') ? cObj : `${cObj} CEST`;
            if (cObj.timeStr && cObj.timeStr !== '--:--:--') {
                return cObj.timeStr.includes('CEST') ? cObj.timeStr : `${cObj.timeStr} CEST`;
            }
            if (cObj.date) {
                return `${timeFmt.format(cObj.date)} CEST`;
            }
            return '--:--:-- CEST';
        }

        const isTotal = Boolean(data && data.isTotality);

        const contacts = [
            { code: 'C1', name: 'Inicio Eclipse Parcial', time: getFormattedContactTime(data?.c1), note: 'Gafas solares PUESTAS' },
            { code: 'C2', name: 'Inicio de la Totalidad', time: isTotal ? getFormattedContactTime(data?.c2) : 'No aplica (Parcial)', note: '¡QUITAR GAFAS SOLARES!' },
            { code: 'MAX', name: 'Eclipse Máximo (Corona)', time: getFormattedContactTime(data?.max), note: 'Oscuridad total / Vía Láctea' },
            { code: 'C3', name: 'Fin de la Totalidad', time: isTotal ? getFormattedContactTime(data?.c3) : 'No aplica (Parcial)', note: '¡PONER GAFAS SOLARES!' },
            { code: 'C4', name: 'Fin Eclipse Parcial', time: getFormattedContactTime(data?.c4), note: 'Puesta de sol solapada' }
        ];

        let yPos = 505;
        contacts.forEach((c) => {
            const isTotalityRow = (c.code === 'C2' || c.code === 'MAX' || c.code === 'C3');

            ctx.fillStyle = isTotalityRow ? '#f1c40f' : '#ffffff';
            ctx.font = 'bold 26px Outfit, sans-serif';
            ctx.fillText(c.code, 110, yPos);

            ctx.fillStyle = '#ffffff';
            ctx.font = '24px Outfit, sans-serif';
            ctx.fillText(c.name, 200, yPos);

            ctx.fillStyle = isTotalityRow ? '#2ecc71' : '#3498db';
            ctx.font = 'bold 26px Outfit, sans-serif';
            ctx.fillText(c.time, 560, yPos);

            ctx.fillStyle = isTotalityRow ? '#e74c3c' : '#a4b0be';
            ctx.font = 'italic 21px Outfit, sans-serif';
            ctx.fillText(c.note, 860, yPos);

            yPos += 70;
        });

        // --- PREVISIÓN METEOROLÓGICA ---
        ctx.fillStyle = '#3498db';
        ctx.font = 'bold 26px Outfit, sans-serif';
        ctx.fillText('🌤️ PREVISIÓN CLIMÁTICA Y CONDICIONES', 80, 915);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fillRect(80, 940, w - 160, 200);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.strokeRect(80, 940, w - 160, 200);

        const cloudVal = data?.cloudPct !== undefined && data?.cloudPct !== null ? `${data.cloudPct}% nubes` : '20% nubes';
        const sunAlt = data?.sunAlt ? `${data.sunAlt.toFixed(1)}°` : '10.5° sobre horizonte';

        ctx.fillStyle = '#ffffff'; ctx.font = '24px Outfit, sans-serif';
        ctx.fillText(`· Cobertura Nubosa Prevista: `, 110, 995);
        ctx.fillStyle = '#2ecc71'; ctx.font = 'bold 24px Outfit, sans-serif';
        ctx.fillText(`${cloudVal} (Previsión Diaria Open-Meteo)`, 420, 995);

        ctx.fillStyle = '#ffffff'; ctx.font = '24px Outfit, sans-serif';
        ctx.fillText(`· Altura del Sol al Eclipsarse: `, 110, 1050);
        ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 24px Outfit, sans-serif';
        ctx.fillText(`${sunAlt} (Oeste-Noroeste / WNW)`, 420, 1050);

        ctx.fillStyle = '#ffffff'; ctx.font = '24px Outfit, sans-serif';
        ctx.fillText(`· Calidad de Observación Esperada: `, 110, 1105);
        ctx.fillStyle = '#2ecc71'; ctx.font = 'bold 24px Outfit, sans-serif';
        ctx.fillText(`ÓPTIMA — Excelente visibilidad`, 480, 1105);

        // --- CHECKLIST DEL OBSERVADOR ---
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 26px Outfit, sans-serif';
        ctx.fillText('🛡️ CHECKLIST DE EQUIPAMIENTO DEL OBSERVADOR', 80, 1200);

        const items = [
            ' Gafas de eclipse homologadas ISO 12312-2 (NUNCA usar gafas de sol comunes)',
            ' Filtro solar ND5.0 para cámaras, telescopios o prismáticos',
            ' Trípode y cámara con batería de repuesto cargada al 100%',
            ' Agua, protección solar de piel y ropa de abrigo ligera para el bajón térmico',
            ' App Eclipse Solar España 2026 cargada en modo offline PWA'
        ];

        let itemY = 1255;
        ctx.fillStyle = '#a4b0be';
        ctx.font = '22px Outfit, sans-serif';
        items.forEach(item => {
            ctx.fillText(`[✓] ${item}`, 110, itemY);
            itemY += 50;
        });

        // --- PIE DE PÁGINA ---
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '20px Outfit, sans-serif';
        ctx.fillText('Generado por Eclipse Solar España 2026 — Proyecto de Divulgación Astronómica', w / 2, 1630);
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
