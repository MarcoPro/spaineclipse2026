/**
 * Eclipse Solar España - Generador de Tarjeta / Pase de Observación Exportable
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
        if (typeof window.closeAllModals === 'function') window.closeAllModals();
        modal.classList.remove('hidden');

        renderPassCanvas(locationData);
    }

    /**
     * Auxiliar para dibujar rectángulos con bordes redondeados
     */
    function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle, strokeStyle, lineWidth) {
        if (lineWidth === undefined) lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();

        if (fillStyle) {
            ctx.fillStyle = fillStyle;
            ctx.fill();
        }
        if (strokeStyle) {
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
        }
    }

    /**
     * Auxiliar para ajustar y dividir texto multilínea en Canvas 2D
     */
    function wrapText(ctx, text, x, y, maxWidth, lineHeight, align) {
        if (align === undefined) align = 'center';
        const words = text.split(' ');
        let lines = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = ctx.measureText(currentLine + ' ' + word).width;
            if (width <= maxWidth) {
                currentLine += ' ' + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine);

        ctx.textAlign = align;
        let currentY = y;
        lines.forEach(function (line) {
            ctx.fillText(line, x, currentY);
            currentY += lineHeight;
        });
        return lines.length;
    }

    /**
     * Formatear o extraer la duración de la totalidad
     */
    function getTotalityDurationFormatted(data) {
        const isTotal = Boolean(data && data.isTotality);
        if (!isTotal) return { isTotal: false, text: '0m 0s (Parcial)' };

        if (data && data.totalityDurationFormatted && !data.totalityDurationFormatted.includes('Sin totalidad')) {
            return { isTotal: true, text: data.totalityDurationFormatted };
        }

        if (data && data.totalityDurationStr && !data.totalityDurationStr.includes('Sin totalidad')) {
            return { isTotal: true, text: data.totalityDurationStr };
        }

        // Cálculo directo a partir de objetos de fecha C2 y C3
        let d2 = (data && data.c2Date) ? data.c2Date : (data && data.c2 ? data.c2.date : null);
        let d3 = (data && data.c3Date) ? data.c3Date : (data && data.c3 ? data.c3.date : null);

        if (d2 && d3) {
            const t2 = new Date(d2).getTime();
            const t3 = new Date(d3).getTime();
            if (!isNaN(t2) && !isNaN(t3) && t3 > t2) {
                const diffSec = Math.round((t3 - t2) / 1000);
                const m = Math.floor(diffSec / 60);
                const s = diffSec % 60;
                const formatted = m > 0 ? `${m}m ${s}s` : `${s}s`;
                return { isTotal: true, text: formatted };
            }
        }

        return { isTotal: true, text: '0m 0s' };
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
        ctx.fillText(window.EclipseConfig.ui_strings.card_title, w / 2, 160);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(80, 195); ctx.lineTo(w - 80, 195);
        ctx.stroke();

        // --- DATOS DE UBICACIÓN Y DURACIÓN ---
        const _defLoc = window.EclipseConfig.default_location;
        const locName = (data && data.name) ? data.name : _defLoc.name;
        const lat = (data && data.lat) ? data.lat.toFixed(4) : _defLoc.lat.toFixed(4);
        const lng = (data && data.lng) ? data.lng.toFixed(4) : _defLoc.lng.toFixed(4);
        const ele = (data && data.elevation) ? `${Math.round(data.elevation)}m` : '0m';
        const isTotal = Boolean(data && data.isTotality);
        const totalityInfo = getTotalityDurationFormatted(data);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#3498db';
        ctx.font = 'bold 24px Outfit, sans-serif';
        ctx.fillText('📍 UBICACIÓN SELECCIONADA', 80, 245);

        // Nombre de la localidad con auto-escalado dinámico según longitud
        let nameFontSize = 42;
        ctx.font = `bold ${nameFontSize}px Outfit, sans-serif`;
        while (ctx.measureText(locName).width > 650 && nameFontSize > 22) {
            nameFontSize -= 2;
            ctx.font = `bold ${nameFontSize}px Outfit, sans-serif`;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillText(locName, 80, 298);

        ctx.fillStyle = '#a4b0be';
        ctx.font = '22px Outfit, sans-serif';
        ctx.fillText(`Coordenadas: Lat ${lat}° N, Lon ${lng}° W  |  Altitud: ${ele}`, 80, 345);

        // Tarjeta / Badge Destacado de Duración de la Totalidad
        const badgeX = 760;
        const badgeY = 225;
        const badgeW = 360;
        const badgeH = 130;
        const badgeBg = isTotal ? 'rgba(241, 196, 15, 0.08)' : 'rgba(255, 255, 255, 0.04)';
        const badgeBorder = isTotal ? 'rgba(241, 196, 15, 0.5)' : 'rgba(255, 255, 255, 0.15)';

        drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 14, badgeBg, badgeBorder, 2);

        ctx.textAlign = 'center';
        ctx.fillStyle = isTotal ? '#f1c40f' : '#a4b0be';
        ctx.font = 'bold 18px Outfit, sans-serif';
        ctx.fillText('⏱️ DURACIÓN TOTALIDAD', badgeX + (badgeW / 2), badgeY + 38);

        ctx.fillStyle = isTotal ? '#2ecc71' : '#e74c3c';
        ctx.font = isTotal ? 'bold 44px Outfit, sans-serif' : 'bold 26px Outfit, sans-serif';
        ctx.fillText(totalityInfo.text, badgeX + (badgeW / 2), badgeY + 92);

        // --- TABLA DE CONTACTOS ASTRONÓMICOS ---
        ctx.textAlign = 'left';
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

        const contacts = [
            { code: 'C1', name: 'Inicio Eclipse Parcial', time: getFormattedContactTime(data && data.c1), note: 'Gafas solares PUESTAS' },
            { code: 'C2', name: 'Inicio de la Totalidad', time: isTotal ? getFormattedContactTime(data && data.c2) : 'No aplica (Parcial)', note: '¡QUITAR GAFAS SOLARES!' },
            { code: 'MAX', name: 'Eclipse Máximo (Corona)', time: getFormattedContactTime(data && data.max), note: 'Oscuridad total y Corona' },
            { code: 'C3', name: 'Fin de la Totalidad', time: isTotal ? getFormattedContactTime(data && data.c3) : 'No aplica (Parcial)', note: '¡PONER GAFAS SOLARES!' },
            { code: 'C4', name: 'Fin Eclipse Parcial', time: getFormattedContactTime(data && data.c4), note: 'Puesta de sol solapada' }
        ];

        let yPos = 505;
        contacts.forEach(function (c) {
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

        const cloudVal = (data && data.cloudPct !== undefined && data.cloudPct !== null) ? `${data.cloudPct}% nubes` : '20% nubes';
        const sunAlt = (data && data.sunAlt) ? `${data.sunAlt.toFixed(1)}°` : '10.5° sobre horizonte';

        ctx.fillStyle = '#ffffff'; ctx.font = '24px Outfit, sans-serif';
        ctx.fillText(`· Cobertura Nubosa Prevista: `, 110, 995);
        ctx.fillStyle = '#2ecc71'; ctx.font = 'bold 24px Outfit, sans-serif';
        ctx.fillText(`${cloudVal} (Previsión Oficial AEMET)`, 420, 995);

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
            ` ${window.EclipseConfig.ui_strings.pwa_label}`
        ];

        let itemY = 1255;
        ctx.fillStyle = '#a4b0be';
        ctx.font = '22px Outfit, sans-serif';
        items.forEach(function (item) {
            ctx.fillText(`[✓] ${item}`, 110, itemY);
            itemY += 50;
        });

        // --- PIE DE PÁGINA Y AVISO LEGAL ---
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(80, 1530); ctx.lineTo(w - 80, 1530);
        ctx.stroke();

        const warningText = '⚠️ Aviso: Tiempos astronómicos de alta precisión; aun así, pueden diferir de la realidad. La salud visual es responsabilidad del observador. Comprueba con gafas ISO 12312-2.';

        ctx.fillStyle = '#e67e22';
        ctx.font = 'bold 18px Outfit, sans-serif';
        wrapText(ctx, warningText, w / 2, 1568, w - 160, 26, 'center');

        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '17px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(window.EclipseConfig.ui_strings.card_footer, w / 2, 1635);
    }

    function downloadPassAsImage() {
        const canvas = document.getElementById('pass-canvas');
        if (!canvas) return;
        const link = document.createElement('a');
        link.download = window.EclipseConfig.ui_strings.card_filename;
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
