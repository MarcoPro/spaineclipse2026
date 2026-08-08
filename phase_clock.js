/**
 * Eclipse Solar España 2026 - Módulo de Reloj de Fases en Tiempo Real & Alertas Sonoras (Día D)
 * Incluye Modo Test (Simulación Acelerada y Pruebas Individuales por Fase),
 * Selección Inteligente de Voces HD (Google/Apple/Microsoft Naturales)
 * y Preavisos de Seguridad Adaptativos no Solapados (Totality vs Parcialidad)
 */
(function () {
    let countdownInterval = null;
    let voiceEnabled = true;
    let soundEnabled = true;
    let spokenAlerts = {}; // Registro para no repetir alertas en el mismo contacto

    // Estado de Simulación / Modo Test
    let isSimulating = false;
    let simSpeed = 10; // Multiplicador por defecto 10x
    let simCurrentDate = null;
    let simLastTickTimestamp = 0;
    let isAudioUnlocked = false;

    // Gestión de Voces HD / Sintetizador de Voz
    let availableVoices = [];
    let selectedVoiceURI = null;

    // Contactos por defecto para el Día del Eclipse (12 de agosto de 2026 en UTC / España)
    const DEFAULT_CONTACTS = {
        isTotality: true,
        c1Date: new Date(Date.UTC(2026, 7, 12, 17, 30, 0)),  // 19:30 CEST
        c2Date: new Date(Date.UTC(2026, 7, 12, 18, 27, 0)),  // 20:27 CEST
        maxDate: new Date(Date.UTC(2026, 7, 12, 18, 27, 45)),// 20:27:45 CEST
        c3Date: new Date(Date.UTC(2026, 7, 12, 18, 28, 30)), // 20:28:30 CEST
        c4Date: new Date(Date.UTC(2026, 7, 12, 19, 22, 0))   // 21:22 CEST
    };

    // Cargar y filtrar voces del sistema operativo / navegador
    function loadVoices() {
        if (!('speechSynthesis' in window)) return;
        availableVoices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('es'));

        const voiceSelect = document.getElementById('select-voice-engine');
        if (voiceSelect) {
            voiceSelect.innerHTML = '';
            if (availableVoices.length === 0) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'Auto (Voz del sistema)';
                voiceSelect.appendChild(opt);
            } else {
                const autoOpt = document.createElement('option');
                autoOpt.value = '';
                autoOpt.textContent = '⚡ Auto (Voz HD recomendada)';
                voiceSelect.appendChild(autoOpt);

                availableVoices.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v.voiceURI;
                    const isNatural = /natural|enhanced|premium|neural|google|apple|microsoft/i.test(v.name);
                    let shortName = v.name.replace(/español|spanish/gi, 'Es').replace(/\(es.*?\)/gi, '').trim();
                    if (shortName.length > 28) shortName = shortName.substring(0, 26) + '…';
                    opt.textContent = `${shortName}${isNatural ? ' ✨ HD' : ''}`;
                    voiceSelect.appendChild(opt);
                });

                if (selectedVoiceURI) {
                    voiceSelect.value = selectedVoiceURI;
                }
            }
        }
    }

    if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    // Seleccionar automáticamente la voz en español de mayor fidelidad humana
    function getBestVoice() {
        if (!('speechSynthesis' in window)) return null;
        const voices = window.speechSynthesis.getVoices();

        if (selectedVoiceURI) {
            const found = voices.find(v => v.voiceURI === selectedVoiceURI);
            if (found) return found;
        }

        const spanishVoices = voices.filter(v => v.lang.startsWith('es'));
        if (spanishVoices.length === 0) return null;

        const scored = spanishVoices.map(v => {
            let score = 0;
            const name = v.name.toLowerCase();

            if (/natural|enhanced|premium|neural/i.test(name)) score += 100;
            if (/google/i.test(name)) score += 50;
            if (/microsoft/i.test(name)) score += 40;
            if (/monica|jorge|paulina|alvaro|elvira|diego|helena/i.test(name)) score += 30;
            if (v.lang === 'es-ES') score += 20;

            return { voice: v, score };
        });

        scored.sort((a, b) => b.score - a.score);
        return scored[0] ? scored[0].voice : spanishVoices[0];
    }

    // Desbloqueo de Audio/Voz para navegadores móviles (Android Chrome/Safari iOS)
    function unlockMobileAudio() {
        if (isAudioUnlocked) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                const ctx = new AudioContext();
                if (ctx.state === 'suspended') {
                    ctx.resume();
                }
            }
            if ('speechSynthesis' in window) {
                window.speechSynthesis.resume();
                const dummyUtterance = new SpeechSynthesisUtterance('');
                dummyUtterance.volume = 0.01;
                window.speechSynthesis.speak(dummyUtterance);
                loadVoices();
            }
            isAudioUnlocked = true;
        } catch (e) {
            console.warn('Mobile audio unlock warning:', e);
        }
    }

    // Definición del diccionario de alertas de voz y beeps (Tiempos no solapados)
    function getAlertDefinitions(isTotality) {
        return {
            'c1_pre_3m': {
                name: 'Preaviso C1 (3 min)',
                freq: 880,
                duration: 0.4,
                wave: 'sine',
                text: isTotality
                    ? "Preaviso: En 3 minutos comienza el eclipse parcial C1. Usa gafas de eclipse homologadas y coloca los filtros en las cámaras."
                    : "Preaviso: En 3 minutos comienza el eclipse parcial C1. Usa gafas de eclipse homologadas y mantén los filtros en cámaras y telescopios."
            },
            'c1_start': {
                name: 'C1 - Inicio Parcial',
                freq: 1000,
                duration: 0.5,
                wave: 'sine',
                text: isTotality
                    ? "¡Inicio del eclipse parcial C1! Mantén puestas las gafas solares y los filtros en las cámaras."
                    : "¡Inicio del eclipse parcial! Es obligatorio usar gafas solares y filtros en las cámaras en todo momento."
            },
            'c2_pre_1m': {
                name: 'Preaviso C2 (1 min)',
                freq: 900,
                duration: 0.4,
                wave: 'sine',
                text: isTotality
                    ? "Preaviso: En 1 minuto comienza la totalidad C2. Prepárate para retirar las gafas y los filtros solo al iniciar la totalidad."
                    : null
            },
            'c2_30s': {
                name: 'Preaviso C2 (30 seg)',
                freq: 1200,
                duration: 0.4,
                wave: 'sine',
                text: isTotality
                    ? "Atención: 30 segundos para la totalidad. Prepárate para quitarte las gafas solares y los filtros de las cámaras."
                    : null
            },
            'c2_start': {
                name: 'C2 - Inicio Totalidad',
                freq: 1500,
                duration: 0.6,
                wave: 'square',
                text: isTotality
                    ? "¡Inicio de la totalidad C2! Ya puedes quitarte las gafas solares y retirar los filtros de las cámaras para observar la corona solar a simple vista."
                    : null
            },
            'max_start': {
                name: 'Eclipse Máximo',
                freq: 1100,
                duration: 0.5,
                wave: 'sine',
                text: isTotality
                    ? "Eclipse máximo alcanzado. Disfruta de la corona solar a simple vista."
                    : "Eclipse máximo alcanzado. Mantén puestas las gafas solares y los filtros de cámara en todo momento."
            },
            'c3_30s': {
                name: 'Preaviso C3 (30 seg)',
                freq: 1000,
                duration: 0.3,
                wave: 'sine',
                text: isTotality
                    ? "Atención: 30 segundos para el fin de la totalidad. Prepárate para volver a ponerte las gafas solares y colocar los filtros."
                    : null
            },
            'c3_10s': {
                name: 'Preaviso C3 (10 seg)',
                freq: 1100,
                duration: 0.3,
                wave: 'sine',
                text: isTotality
                    ? "¡Atención! En 10 segundos finaliza la totalidad. Ponte las gafas solares y coloca inmediatamente los filtros en las cámaras."
                    : null
            },
            'c3_start': {
                name: 'C3 - Fin Totalidad',
                freq: 1400,
                duration: 0.6,
                wave: 'square',
                text: isTotality
                    ? "¡Fin de la totalidad C3! Ponte las gafas solares inmediatamente y vuelve a colocar los filtros en las cámaras."
                    : null
            },
            'c4_pre_3m': {
                name: 'Preaviso C4 (3 min)',
                freq: 880,
                duration: 0.4,
                wave: 'sine',
                text: isTotality
                    ? "Preaviso: En 3 minutos finaliza el eclipse parcial C4. Mantén puestas las gafas solares hasta el final."
                    : "Preaviso: En 3 minutos finaliza el eclipse parcial C4. Mantén puestas las gafas solares."
            },
            'c4_start': {
                name: 'C4 - Fin Eclipse',
                freq: 800,
                duration: 0.5,
                wave: 'sine',
                text: isTotality
                    ? "El eclipse ha finalizado por completo C4. Ya puedes retirar las gafas solares y guardar el equipo."
                    : "El eclipse parcial ha finalizado C4. Ya puedes retirar las gafas solares y guardar el equipo."
            }
        };
    }

    // Web Audio API Synthesizer para beeps limpios
    function playBeep(freq = 880, duration = 0.2, type = 'sine') {
        if (!soundEnabled) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            if (ctx.state === 'suspended') ctx.resume();
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
        if (!text) return;
        updateAlertSubtitle(text);
        if (!voiceEnabled || !('speechSynthesis' in window)) return;
        try {
            window.speechSynthesis.cancel(); // Cancelar locuciones previas
            const utterance = new SpeechSynthesisUtterance(text);
            
            const bestVoice = getBestVoice();
            if (bestVoice) {
                utterance.voice = bestVoice;
                utterance.lang = bestVoice.lang;
            } else {
                utterance.lang = 'es-ES';
            }

            // Calibración de cadencia humana (0.94 es más pausado y natural)
            utterance.rate = 0.94;
            utterance.pitch = 1.0;
            
            window.speechSynthesis.speak(utterance);
        } catch (e) {
            console.warn('Speech synthesis error:', e);
        }
    }

    function updateAlertSubtitle(text) {
        const subtitleEl = document.getElementById('clock-alert-subtitle');
        if (subtitleEl) {
            subtitleEl.innerHTML = `<i class="fa-solid fa-bullhorn"></i> <strong>Aviso Activo:</strong> "${text}"`;
            subtitleEl.classList.add('active');
            setTimeout(() => {
                subtitleEl.classList.remove('active');
            }, 9000);
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

    function triggerTestAlert(alertKey) {
        unlockMobileAudio();
        const details = getActiveEclipseDetails();
        const alerts = getAlertDefinitions(details.isTotality);
        const def = alerts[alertKey];
        if (def && def.text) {
            playBeep(def.freq, def.duration, def.wave);
            speakText(def.text);
        }
    }

    function getActiveEclipseDetails() {
        if (window.currentEclipseDetails && window.currentEclipseDetails.c1Date) {
            return window.currentEclipseDetails;
        }
        return DEFAULT_CONTACTS;
    }

    function initPhaseClockModal() {
        const modal = document.getElementById('modal-phase-clock');
        const closeBtn = document.getElementById('close-phase-clock');
        const openBtn = document.getElementById('btn-phase-clock');
        const testAudioBtn = document.getElementById('btn-test-audio');
        const toggleVoiceBtn = document.getElementById('btn-toggle-voice');

        const toggleSimBtn = document.getElementById('btn-toggle-sim');
        const resetSimBtn = document.getElementById('btn-reset-sim');
        const simSpeedSelect = document.getElementById('sim-speed-select');
        const simJumpSelect = document.getElementById('sim-jump-select');
        const voiceEngineSelect = document.getElementById('select-voice-engine');

        loadVoices();

        const bindClick = (el, fn) => {
            if (!el) return;
            const handler = (e) => {
                if (e.type === 'touchstart') {
                    el._touchFired = true;
                } else if (e.type === 'click' && el._touchFired) {
                    el._touchFired = false;
                    return;
                }
                unlockMobileAudio();
                fn(e);
            };
            el.addEventListener('click', handler);
            el.addEventListener('touchstart', handler, { passive: true });
        };

        if (openBtn && modal) {
            bindClick(openBtn, () => {
                if (typeof window.closeAllModals === 'function') window.closeAllModals();
                modal.classList.remove('hidden');
                loadVoices();
                updatePhaseClock();
            });
        }

        if (closeBtn && modal) {
            bindClick(closeBtn, () => {
                modal.classList.add('hidden');
            });
        }

        if (testAudioBtn) {
            bindClick(testAudioBtn, () => {
                triggerTestAlert('c2_start');
            });
        }

        if (toggleVoiceBtn) {
            bindClick(toggleVoiceBtn, () => {
                voiceEnabled = !voiceEnabled;
                soundEnabled = voiceEnabled;
                toggleVoiceBtn.classList.toggle('active', voiceEnabled);
                toggleVoiceBtn.innerHTML = voiceEnabled ?
                    '<i class="fa-solid fa-volume-high"></i> Voz Activa' :
                    '<i class="fa-solid fa-volume-xmark"></i> Voz Silenciada';
            });
        }

        if (voiceEngineSelect) {
            voiceEngineSelect.addEventListener('change', (e) => {
                selectedVoiceURI = e.target.value;
                triggerTestAlert('c2_start');
            });
        }

        // Controladores de Simulación
        if (toggleSimBtn) {
            bindClick(toggleSimBtn, () => {
                if (isSimulating) {
                    stopSimulation();
                } else {
                    startSimulation();
                }
            });
        }

        if (resetSimBtn) {
            bindClick(resetSimBtn, () => {
                stopSimulation();
            });
        }

        if (simSpeedSelect) {
            simSpeedSelect.addEventListener('change', (e) => {
                simSpeed = parseFloat(e.target.value) || 10;
                const statusBadge = document.getElementById('sim-status-badge');
                if (statusBadge && isSimulating) {
                    statusBadge.textContent = `MODO TEST ACTIVO (${simSpeed}X)`;
                }
            });
        }

        if (simJumpSelect) {
            simJumpSelect.addEventListener('change', (e) => {
                unlockMobileAudio();
                const targetKey = e.target.value;
                if (targetKey) {
                    jumpToSimulationTarget(targetKey);
                    e.target.value = '';
                }
            });
        }

        // Botones de Prueba Rápida Individual
        const testButtons = document.querySelectorAll('.btn-test-phase');
        testButtons.forEach(btn => {
            bindClick(btn, () => {
                const alertKey = btn.getAttribute('data-alert');
                if (alertKey) {
                    triggerTestAlert(alertKey);
                }
            });
        });
    }

    function startSimulation() {
        unlockMobileAudio();
        const details = getActiveEclipseDetails();
        isSimulating = true;
        spokenAlerts = {}; // Resetear registro de alertas para probar libremente
        simLastTickTimestamp = performance.now();

        // Iniciar simulación por defecto 3.5 minutos antes de C1
        const c1Time = details.c1Date ? details.c1Date.getTime() : DEFAULT_CONTACTS.c1Date.getTime();
        simCurrentDate = new Date(c1Time - 3.5 * 60 * 1000);

        updateSimulationUI(true);
        speakText(`Simulador del Día del Eclipse iniciado a velocidad ${simSpeed}X.`);
    }

    function stopSimulation() {
        isSimulating = false;
        simCurrentDate = null;
        spokenAlerts = {};
        updateSimulationUI(false);
        const subtitleEl = document.getElementById('clock-alert-subtitle');
        if (subtitleEl) subtitleEl.innerHTML = '';
        updatePhaseClock();
    }

    function jumpToSimulationTarget(targetKey) {
        unlockMobileAudio();
        const details = getActiveEclipseDetails();
        spokenAlerts = {}; // Permitir volver a escuchar alertas al saltar

        let targetDate = null;
        const c1Date = details.c1Date || DEFAULT_CONTACTS.c1Date;
        const c2Date = details.c2Date || DEFAULT_CONTACTS.c2Date;
        const maxDate = details.maxDate || DEFAULT_CONTACTS.maxDate;
        const c3Date = details.c3Date || DEFAULT_CONTACTS.c3Date;
        const c4Date = details.c4Date || DEFAULT_CONTACTS.c4Date;

        if (targetKey === 'pre_c1' && c1Date) {
            targetDate = new Date(c1Date.getTime() - 3.5 * 60 * 1000);
        } else if (targetKey === 'pre_c2' && c2Date) {
            targetDate = new Date(c2Date.getTime() - 75 * 1000); // -1 min 15s
        } else if (targetKey === 'c2_30s' && c2Date) {
            targetDate = new Date(c2Date.getTime() - 40 * 1000); // -40s
        } else if (targetKey === 'max' && maxDate) {
            targetDate = new Date(maxDate.getTime() - 15 * 1000); // -15s
        } else if (targetKey === 'c3_30s' && c3Date) {
            targetDate = new Date(c3Date.getTime() - 40 * 1000); // -40s
        } else if (targetKey === 'c3_10s' && c3Date) {
            targetDate = new Date(c3Date.getTime() - 20 * 1000); // -20s
        } else if (targetKey === 'pre_c4' && c4Date) {
            targetDate = new Date(c4Date.getTime() - 3.5 * 60 * 1000);
        }

        if (targetDate) {
            if (!isSimulating) {
                isSimulating = true;
                simLastTickTimestamp = performance.now();
                updateSimulationUI(true);
            }
            simCurrentDate = targetDate;
            updatePhaseClock();
        }
    }

    function updateSimulationUI(active) {
        const toggleBtn = document.getElementById('btn-toggle-sim');
        const statusBadge = document.getElementById('sim-status-badge');
        if (toggleBtn) {
            toggleBtn.classList.toggle('active', active);
            toggleBtn.innerHTML = active
                ? '<i class="fa-solid fa-pause"></i> Pausar Simulación'
                : '<i class="fa-solid fa-play"></i> Iniciar Simulación Día D';
        }
        if (statusBadge) {
            statusBadge.classList.toggle('active', active);
            statusBadge.textContent = active ? `MODO TEST ACTIVO (${simSpeed}X)` : 'MODO REAL';
        }
    }

    function updatePhaseClock() {
        const realNow = new Date();
        let now = realNow;

        if (isSimulating) {
            const currentPerf = performance.now();
            const elapsedRealMs = currentPerf - simLastTickTimestamp;
            simLastTickTimestamp = currentPerf;

            if (simCurrentDate) {
                simCurrentDate = new Date(simCurrentDate.getTime() + (elapsedRealMs * simSpeed));
                now = simCurrentDate;
            }
        }

        const details = getActiveEclipseDetails();
        const eclipseTarget = details.c1Date || DEFAULT_CONTACTS.c1Date;
        const diffMs = eclipseTarget.getTime() - now.getTime();
        const diff = formatTimeDifference(diffMs);

        const daysEl = document.getElementById('clock-days');
        const hoursEl = document.getElementById('clock-hours');
        const minsEl = document.getElementById('clock-mins');
        const secsEl = document.getElementById('clock-secs');
        const simClockDisplay = document.getElementById('sim-virtual-clock');

        if (daysEl) daysEl.textContent = String(diff.days).padStart(2, '0');
        if (hoursEl) hoursEl.textContent = String(diff.hours).padStart(2, '0');
        if (minsEl) minsEl.textContent = String(diff.minutes).padStart(2, '0');
        if (secsEl) secsEl.textContent = String(diff.seconds).padStart(2, '0');

        if (simClockDisplay && isSimulating) {
            const simTimeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            simClockDisplay.textContent = `Hora Simulada: ${simTimeStr}`;
        } else if (simClockDisplay) {
            simClockDisplay.textContent = '';
        }

        // Renderear contactos y evaluar alertas
        renderContactTimes(details, now);
    }

    function renderContactTimes(details, now) {
        const c1El = document.getElementById('clock-c1-time');
        const c2El = document.getElementById('clock-c2-time');
        const maxEl = document.getElementById('clock-max-time');
        const c3El = document.getElementById('clock-c3-time');
        const c4El = document.getElementById('clock-c4-time');
        const phaseStatus = document.getElementById('clock-phase-status');

        const isTotality = details.isTotality;

        if (phaseStatus) {
            if (!isTotality) {
                phaseStatus.innerHTML = '<span class="status-partial"><i class="fa-solid fa-sun"></i> Eclipse Parcial en esta ubicación</span>';
            } else {
                phaseStatus.innerHTML = '<span class="status-totality"><i class="fa-solid fa-moon"></i> Eclipse Total (Totalidad Garantizada)</span>';
            }
        }

        if (c1El && (details.c1 || details.c1Date)) c1El.textContent = (details.c1 && details.c1.timeStr) ? details.c1.timeStr : (details.c1Date ? details.c1Date.toLocaleTimeString('es-ES') : '--:--:--');
        if (c2El) c2El.textContent = isTotality ? ((details.c2 && details.c2.timeStr) ? details.c2.timeStr : (details.c2Date ? details.c2Date.toLocaleTimeString('es-ES') : '--:--:--')) : 'N/A';
        if (maxEl && (details.max || details.maxDate)) maxEl.textContent = (details.max && details.max.timeStr) ? details.max.timeStr : (details.maxDate ? details.maxDate.toLocaleTimeString('es-ES') : '--:--:--');
        if (c3El) c3El.textContent = isTotality ? ((details.c3 && details.c3.timeStr) ? details.c3.timeStr : (details.c3Date ? details.c3Date.toLocaleTimeString('es-ES') : '--:--:--')) : 'N/A';
        if (c4El && (details.c4 || details.c4Date)) c4El.textContent = (details.c4 && details.c4.timeStr) ? details.c4.timeStr : (details.c4Date ? details.c4Date.toLocaleTimeString('es-ES') : '--:--:--');

        // Evaluador de Alertas Sonoras y Locución
        checkAndExecuteAlerts(details, now);
    }

    function checkAndExecuteAlerts(details, now) {
        const alertsDef = getAlertDefinitions(details.isTotality);

        const checkAlert = (key, targetDate, secondsMin, secondsMax) => {
            if (!targetDate || spokenAlerts[key]) return;
            const secToTarget = (targetDate.getTime() - now.getTime()) / 1000;

            if (secToTarget <= secondsMax && secToTarget >= secondsMin) {
                spokenAlerts[key] = true;
                const def = alertsDef[key];
                if (def && def.text) {
                    playBeep(def.freq, def.duration, def.wave);
                    speakText(def.text);
                }
            }
        };

        const c1Date = details.c1Date || DEFAULT_CONTACTS.c1Date;
        const c2Date = details.isTotality ? (details.c2Date || DEFAULT_CONTACTS.c2Date) : null;
        const maxDate = details.maxDate || DEFAULT_CONTACTS.maxDate;
        const c3Date = details.isTotality ? (details.c3Date || DEFAULT_CONTACTS.c3Date) : null;
        const c4Date = details.c4Date || DEFAULT_CONTACTS.c4Date;

        // C1 (Parcial Inicio)
        checkAlert('c1_pre_3m', c1Date, 170, 190);  // ~3 min antes
        checkAlert('c1_start', c1Date, -10, 5);     // Inicio C1

        // C2 (Totalidad Inicio - sólo si hay totalidad)
        if (details.isTotality && c2Date) {
            checkAlert('c2_pre_1m', c2Date, 55, 70);   // ~1 min antes
            checkAlert('c2_30s', c2Date, 20, 35);      // 30s antes
            checkAlert('c2_start', c2Date, -10, 5);    // Inicio C2 Totalidad
        }

        // MAX
        checkAlert('max_start', maxDate, -10, 5);

        // C3 (Totalidad Fin - sólo si hay totalidad)
        if (details.isTotality && c3Date) {
            checkAlert('c3_30s', c3Date, 25, 40);       // 30s antes del fin
            checkAlert('c3_10s', c3Date, 5, 15);       // 10s antes del fin
            checkAlert('c3_start', c3Date, -10, 5);    // Fin C3 Totalidad
        }

        // C4 (Parcial Fin)
        checkAlert('c4_pre_3m', c4Date, 170, 190);
        checkAlert('c4_start', c4Date, -10, 5);
    }

    // Inicialización resiliente para escritorio y móviles (Android / iOS)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initPhaseClockModal();
            countdownInterval = setInterval(updatePhaseClock, 100);
        });
    } else {
        initPhaseClockModal();
        countdownInterval = setInterval(updatePhaseClock, 100);
    }

    window.EclipsePhaseClock = {
        playBeep,
        speakText,
        updatePhaseClock,
        triggerTestAlert,
        startSimulation,
        stopSimulation
    };
})();
