/**
 * Eclipse Solar España 2026 - Módulo de Reloj de Fases en Tiempo Real & Alertas Sonoras (Día D)
 */
(function () {
    let countdownInterval = null;
    let voiceEnabled = true;
    let soundEnabled = true;
    let spokenAlerts = {}; // Registro para no repetir alertas en el mismo contacto

    const ECLIPSE_TARGET_UTC = new Date(Date.UTC(2026, 7, 12, 17, 30, 0)); // 12 de agosto de 2026 17:30 UTC

    // Web Audio API Synthesizer para beeps limpios
    function playBeep(freq = 880, duration = 0.2, type = 'sine') {
        if (!soundEnabled) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + duration);
        } catch (e) {
            console.warn('Audio play error:', e);
        }
    }

    // Web Speech API para locución de voz en español
    function speakText(text) {
        if (!voiceEnabled || !('speechSynthesis' in window)) return;
        try {
            window.speechSynthesis.cancel(); // Cancelar locuciones previas
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'es-ES';
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            window.speechSynthesis.speak(utterance);
        } catch (e) {
            console.warn('Speech synthesis error:', e);
        }
    }

    function formatTimeDifference(ms) {
        if (ms <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
        const seconds = Math.floor((ms / 1000) % 60);
        const minutes = Math.floor((ms / (1000 * 60)) % 60);
        const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
        const days = Math.floor(ms / (1000 * 60 * 60 * 24));
        return { days, hours, minutes, seconds, isPast: false };
    }

    function initPhaseClockModal() {
        const modal = document.getElementById('modal-phase-clock');
        const closeBtn = document.getElementById('close-phase-clock');
        const openBtn = document.getElementById('btn-phase-clock');
        const testAudioBtn = document.getElementById('btn-test-audio');
        const toggleVoiceBtn = document.getElementById('btn-toggle-voice');

        if (openBtn && modal) {
            openBtn.addEventListener('click', () => {
                modal.classList.remove('hidden');
                updatePhaseClock();
            });
        }

        if (closeBtn && modal) {
            closeBtn.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
        }

        if (testAudioBtn) {
            testAudioBtn.addEventListener('click', () => {
                playBeep(880, 0.3);
                speakText("Prueba de audio del eclipse. Alerta sonora activada.");
            });
        }

        if (toggleVoiceBtn) {
            toggleVoiceBtn.addEventListener('click', () => {
                voiceEnabled = !voiceEnabled;
                soundEnabled = voiceEnabled;
                toggleVoiceBtn.classList.toggle('active', voiceEnabled);
                toggleVoiceBtn.innerHTML = voiceEnabled ?
                    '<i class="fa-solid fa-volume-high"></i> Voz Activa' :
                    '<i class="fa-solid fa-volume-xmark"></i> Voz Silenciada';
            });
        }
    }

    function updatePhaseClock() {
        const now = new Date();
        const diffMs = ECLIPSE_TARGET_UTC.getTime() - now.getTime();
        const diff = formatTimeDifference(diffMs);

        const daysEl = document.getElementById('clock-days');
        const hoursEl = document.getElementById('clock-hours');
        const minsEl = document.getElementById('clock-mins');
        const secsEl = document.getElementById('clock-secs');

        if (daysEl) daysEl.textContent = String(diff.days).padStart(2, '0');
        if (hoursEl) hoursEl.textContent = String(diff.hours).padStart(2, '0');
        if (minsEl) minsEl.textContent = String(diff.minutes).padStart(2, '0');
        if (secsEl) secsEl.textContent = String(diff.seconds).padStart(2, '0');

        // Obtener contactos astronómicos del lugar activo si existen
        if (window.currentEclipseDetails) {
            renderContactTimes(window.currentEclipseDetails, now);
        }
    }

    function renderContactTimes(details, now) {
        const c1El = document.getElementById('clock-c1-time');
        const c2El = document.getElementById('clock-c2-time');
        const maxEl = document.getElementById('clock-max-time');
        const c3El = document.getElementById('clock-c3-time');
        const c4El = document.getElementById('clock-c4-time');
        const phaseStatus = document.getElementById('clock-phase-status');

        if (!details.isTotality) {
            if (phaseStatus) {
                phaseStatus.innerHTML = '<span class="status-partial"><i class="fa-solid fa-sun"></i> Eclipse Parcial en esta ubicación</span>';
            }
        } else {
            if (phaseStatus) {
                phaseStatus.innerHTML = '<span class="status-totality"><i class="fa-solid fa-moon"></i> Eclipse Total (Totalidad Garantizada)</span>';
            }
        }

        if (c1El && details.c1) c1El.textContent = details.c1.timeStr || '--:--:--';
        if (c2El && details.c2) c2El.textContent = details.c2.timeStr || 'N/A';
        if (maxEl && details.max) maxEl.textContent = details.max.timeStr || '--:--:--';
        if (c3El && details.c3) c3El.textContent = details.c3.timeStr || 'N/A';
        if (c4El && details.c4) c4El.textContent = details.c4.timeStr || '--:--:--';

        // Comprobar alertas si estamos en el día del eclipse (12 de agosto de 2026)
        if (details.c2Date && details.c3Date) {
            const secToC2 = (details.c2Date.getTime() - now.getTime()) / 1000;
            const secToC3 = (details.c3Date.getTime() - now.getTime()) / 1000;

            // 30 segundos antes de C2
            if (secToC2 > 0 && secToC2 <= 30 && !spokenAlerts['c2_30s']) {
                spokenAlerts['c2_30s'] = true;
                playBeep(1200, 0.4);
                speakText("Atención: 30 segundos para la totalidad. Prepárate para quitarte las gafas solares.");
            }
            // En C2 (Inicio de Totalidad)
            if (secToC2 <= 0 && secToC2 >= -5 && !spokenAlerts['c2_start']) {
                spokenAlerts['c2_start'] = true;
                playBeep(1500, 0.6, 'square');
                speakText("¡Inicio de la totalidad! Quítate las gafas solares ahora.");
            }
            // 10 segundos antes de C3
            if (secToC3 > 0 && secToC3 <= 10 && !spokenAlerts['c3_10s']) {
                spokenAlerts['c3_10s'] = true;
                playBeep(1000, 0.3);
                speakText("Atención: 10 segundos para el fin de la totalidad. Vuelve a ponerte las gafas solares.");
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        initPhaseClockModal();
        countdownInterval = setInterval(updatePhaseClock, 1000);
    });

    window.EclipsePhaseClock = {
        playBeep,
        speakText,
        updatePhaseClock
    };
})();
