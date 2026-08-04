/**
 * 3D Horizon Simulator - v2.1 Optimized for Mobile & iOS Safari
 * 
 * Renders a realistic 3D terrain around the observer location with:
 *  - Smooth terrain using bilinear interpolation + IDW
 *  - Adaptive mesh resolution (lightweight for iOS / Android mobile devices)
 *  - Camera auto-oriented toward the sun on open
 *  - Robust error handling and spinner cleanup
 */

window.Horizon3D = (() => {
    let scene, camera, renderer, container;
    let terrainMesh, sunMesh, sunGlow, pathLine, observerPin;
    let isInitialized = false;
    let animFrame = null;

    // Orbit controls state
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    let orbitAngle = { theta: 0, phi: Math.PI / 4 };
    let orbitRadius = 50;
    let lookTarget = new THREE.Vector3(0, 0, 0);

    // Store sun direction for camera init
    let sunTheta = 0;

    function initScene() {
        container = document.getElementById('horizon-3d-container');
        if (!container) return false;

        const oldCanvas = container.querySelector('canvas');
        if (oldCanvas) oldCanvas.remove();

        const w = container.clientWidth || container.offsetWidth || 300;
        const h = container.clientHeight || container.offsetHeight || 300;
        if (w === 0 || h === 0) return false;

        scene = new THREE.Scene();

        // Sky gradient background
        scene.background = new THREE.Color(0x1a2a4a);
        scene.fog = new THREE.FogExp2(0x1a2a4a, 0.005);

        camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 800);

        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        } catch (e) {
            console.warn('WebGL initialization fallback:', e);
            renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
        }

        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = false;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        container.appendChild(renderer.domElement);

        // --- LIGHTING ---
        const ambient = new THREE.AmbientLight(0xb0c4de, 0.8);
        scene.add(ambient);

        const hemi = new THREE.HemisphereLight(0x87CEEB, 0x556B2F, 0.7);
        scene.add(hemi);

        const dirLight = new THREE.DirectionalLight(0xfff5e0, 1.2);
        dirLight.position.set(20, 40, 20);
        dirLight.name = 'sunLight';
        scene.add(dirLight);

        const fillLight = new THREE.DirectionalLight(0x8899bb, 0.4);
        fillLight.position.set(-20, 10, -20);
        scene.add(fillLight);

        // Mouse/touch orbit controls
        renderer.domElement.addEventListener('mousedown', onMouseDown);
        renderer.domElement.addEventListener('mousemove', onMouseMove);
        renderer.domElement.addEventListener('mouseup', onMouseUp);
        renderer.domElement.addEventListener('mouseleave', onMouseUp);
        renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
        renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
        renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
        renderer.domElement.addEventListener('touchend', onMouseUp);

        window.addEventListener('resize', onWindowResize);
        isInitialized = true;
        return true;
    }

    function updateCameraPosition() {
        if (!camera) return;
        camera.position.set(
            lookTarget.x + orbitRadius * Math.sin(orbitAngle.phi) * Math.cos(orbitAngle.theta),
            lookTarget.y + orbitRadius * Math.cos(orbitAngle.phi),
            lookTarget.z + orbitRadius * Math.sin(orbitAngle.phi) * Math.sin(orbitAngle.theta)
        );
        camera.lookAt(lookTarget);
    }

    function onMouseDown(e) {
        isDragging = true;
        prevMouse = { x: e.clientX, y: e.clientY };
    }
    function onMouseMove(e) {
        if (!isDragging) return;
        const dx = e.clientX - prevMouse.x;
        const dy = e.clientY - prevMouse.y;
        orbitAngle.theta -= dx * 0.008;
        orbitAngle.phi = Math.max(0.15, Math.min(Math.PI / 2.2, orbitAngle.phi + dy * 0.008));
        prevMouse = { x: e.clientX, y: e.clientY };
        updateCameraPosition();
    }
    function onMouseUp() { isDragging = false; }
    function onWheel(e) {
        e.preventDefault();
        orbitRadius = Math.max(5, Math.min(120, orbitRadius + e.deltaY * 0.05));
        updateCameraPosition();
    }
    let prevPinchDist = 0;

    function getPinchDistance(e) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function onTouchStart(e) {
        if (e.touches.length === 1) {
            isDragging = true;
            prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2) {
            isDragging = false;
            prevPinchDist = getPinchDistance(e);
        }
    }
    function onTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1 && isDragging) {
            const dx = e.touches[0].clientX - prevMouse.x;
            const dy = e.touches[0].clientY - prevMouse.y;
            orbitAngle.theta -= dx * 0.008;
            orbitAngle.phi = Math.max(0.15, Math.min(Math.PI / 2.2, orbitAngle.phi + dy * 0.008));
            prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            updateCameraPosition();
        } else if (e.touches.length === 2) {
            const dist = getPinchDistance(e);
            const delta = prevPinchDist - dist;
            orbitRadius = Math.max(5, Math.min(120, orbitRadius + delta * 0.2));
            prevPinchDist = dist;
            updateCameraPosition();
        }
    }

    function onWindowResize() {
        if (!container || !renderer || !camera) return;
        const w = container.clientWidth || container.offsetWidth;
        const h = container.clientHeight || container.offsetHeight;
        if (w === 0 || h === 0) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }

    function pseudoNoise(x, z) {
        const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
        return n - Math.floor(n);
    }

    function valueNoise(x, z) {
        const xi = Math.floor(x);
        const zi = Math.floor(z);
        const xf = x - xi;
        const zf = z - zi;

        const v00 = pseudoNoise(xi, zi);
        const v10 = pseudoNoise(xi + 1, zi);
        const v01 = pseudoNoise(xi, zi + 1);
        const v11 = pseudoNoise(xi + 1, zi + 1);

        const ux = xf * xf * (3 - 2 * xf);
        const uz = zf * zf * (3 - 2 * zf);

        return v00 * (1 - ux) * (1 - uz) +
               v10 * ux * (1 - uz) +
               v01 * (1 - ux) * uz +
               v11 * ux * uz;
    }

    function fractalNoise(x, z) {
        let val = 0;
        let amp = 0.5;
        let freq = 0.8;
        for (let i = 0; i < 3; i++) {
            val += valueNoise(x * freq, z * freq) * amp;
            freq *= 2.1;
            amp *= 0.45;
        }
        return val;
    }

    function getInterpolatedElevation(lat, lng, customData = null) {
        const data = customData || window.topographyData || (typeof topographyData !== 'undefined' ? topographyData : null);
        if (!data || data.length === 0) return 0;

        let BL = null, BR = null, TL = null, TR = null;
        let dBL = Infinity, dBR = Infinity, dTL = Infinity, dTR = Infinity;
        
        for (const pt of data) {
            const ptLat = pt.lat !== undefined ? pt.lat : pt[0];
            const ptLng = pt.lng !== undefined ? pt.lng : pt[1];
            const ptAlt = pt.alt !== undefined ? pt.alt : pt[2];

            const dSq = (lat - ptLat) ** 2 + (lng - ptLng) ** 2;
            
            if (ptLat <= lat && ptLng <= lng && dSq < dBL) { BL = {lat: ptLat, lng: ptLng, alt: ptAlt}; dBL = dSq; }
            if (ptLat <= lat && ptLng >= lng && dSq < dBR) { BR = {lat: ptLat, lng: ptLng, alt: ptAlt}; dBR = dSq; }
            if (ptLat >= lat && ptLng <= lng && dSq < dTL) { TL = {lat: ptLat, lng: ptLng, alt: ptAlt}; dTL = dSq; }
            if (ptLat >= lat && ptLng >= lng && dSq < dTR) { TR = {lat: ptLat, lng: ptLng, alt: ptAlt}; dTR = dSq; }
        }

        if (BL && BR && TL && TR) {
            if (dBL < 1e-12) return BL.alt;
            if (dBR < 1e-12) return BR.alt;
            if (dTL < 1e-12) return TL.alt;
            if (dTR < 1e-12) return TR.alt;

            const dx = BR.lng - BL.lng;
            const dy = TL.lat - BL.lat;

            if (dx > 1e-8 && dy > 1e-8) {
                const u = (lng - BL.lng) / dx;
                const v = (lat - BL.lat) / dy;
                const botElev = BL.alt * (1 - u) + BR.alt * u;
                const topElev = TL.alt * (1 - u) + TR.alt * u;
                return botElev * (1 - v) + topElev * v;
            } else if (dx > 1e-8) {
                const u = (lng - BL.lng) / dx;
                return BL.alt * (1 - u) + BR.alt * u;
            } else if (dy > 1e-8) {
                const v = (lat - BL.lat) / dy;
                return BL.alt * (1 - v) + TL.alt * v;
            }
        }

        let weightSum = 0;
        let elevSum = 0;
        const smoothing = 0.00015;
        const searchRadiusSq = 0.15 * 0.15;
        for (const pt of data) {
            const ptLat = pt.lat !== undefined ? pt.lat : pt[0];
            const ptLng = pt.lng !== undefined ? pt.lng : pt[1];
            const ptAlt = pt.alt !== undefined ? pt.alt : pt[2];
            const dSq = (lat - ptLat) ** 2 + (lng - ptLng) ** 2;
            if (dSq < searchRadiusSq) {
                const w = 1 / (dSq + smoothing);
                elevSum += ptAlt * w;
                weightSum += w;
            }
        }
        
        return weightSum > 0 ? elevSum / weightSum : 0;
    }

    function generateTerrain(lat, lng) {
        if (terrainMesh) { scene.remove(terrainMesh); terrainMesh.geometry.dispose(); terrainMesh.material.dispose(); }
        if (sunMesh) scene.remove(sunMesh);
        if (sunGlow) scene.remove(sunGlow);
        if (pathLine) { scene.remove(pathLine); pathLine.geometry.dispose(); pathLine.material.dispose(); }
        if (observerPin) scene.remove(observerPin);

        // Parametrización adaptativa según potencia de dispositivo (Móvil vs Escritorio)
        const isMobile = window.innerWidth <= 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const RADIUS_KM = 12;
        const TOTAL_KM = RADIUS_KM * 2; 
        const gridSize = isMobile ? 80 : 120; // 80x80 en móviles para evitar bloqueo de CPU y GPU en iOS
        const terrainSpan = 120;

        const kmPerDegLat = 111.32;
        const kmPerDegLng = 111.32 * Math.cos(lat * Math.PI / 180);
        const geoSpanLat = TOTAL_KM / kmPerDegLat;
        const geoSpanLng = TOTAL_KM / kmPerDegLng;

        const geometry = new THREE.PlaneGeometry(terrainSpan, terrainSpan, gridSize - 1, gridSize - 1);
        const vertices = geometry.attributes.position.array;

        const globalData = window.topographyData || (typeof topographyData !== 'undefined' ? topographyData : null);
        let localData = globalData;

        if (globalData && globalData.length > 0) {
            const margin = 0.08; // ~8km padding alrededor de la rejilla local
            const minLat = lat - geoSpanLat/2 - margin;
            const maxLat = lat + geoSpanLat/2 + margin;
            const minLng = lng - geoSpanLng/2 - margin;
            const maxLng = lng + geoSpanLng/2 + margin;
            
            localData = globalData.filter(pt => {
                const ptLat = pt.lat !== undefined ? pt.lat : pt[0];
                const ptLng = pt.lng !== undefined ? pt.lng : pt[1];
                return ptLat >= minLat && ptLat <= maxLat && ptLng >= minLng && ptLng <= maxLng;
            });
        }

        const baseElevations = [];
        for (let i = 0; i < vertices.length; i += 3) {
            const lx = vertices[i];
            const lz = vertices[i + 1];
            const geoLat = lat + (lz / terrainSpan) * geoSpanLat;
            const geoLng = lng + (lx / terrainSpan) * geoSpanLng;
            baseElevations.push(getInterpolatedElevation(geoLat, geoLng, localData));
        }

        const observerElev = getInterpolatedElevation(lat, lng, localData);
        const minElev = Math.min(...baseElevations);
        const maxElev = Math.max(...baseElevations);
        const elevRange = maxElev - minElev;

        let altScale = 0.03;
        if (elevRange < 100) altScale = 0.10;
        else if (elevRange < 500) altScale = 0.06;
        else if (elevRange > 2000) altScale = 0.024;

        const finalElevations = [];
        for (let i = 0; i < vertices.length; i += 3) {
            const idx = i / 3;
            const lx = vertices[i];
            const lz = vertices[i + 1];
            const baseAlt = baseElevations[idx];
            const roughness = Math.min(1, baseAlt / 1000);
            const noise = (fractalNoise(lx * 0.4, lz * 0.4) - 0.5) * (5 + roughness * 15);
            
            const finalAlt = baseAlt + noise;
            finalElevations.push(finalAlt);
            vertices[i + 2] = (finalAlt - observerElev) * altScale;
        }

        geometry.computeVertexNormals();

        const colors = [];
        const colorWater = new THREE.Color(0x2d5a3f);
        const colorLow = new THREE.Color(0x3a7d44);
        const colorMid = new THREE.Color(0x6b8e4e);
        const colorHigh = new THREE.Color(0x8b7355);
        const colorPeak = new THREE.Color(0xc4b99a);
        const colorSnow = new THREE.Color(0xd4d0c8);

        for (let i = 0; i < vertices.length; i += 3) {
            const idx = i / 3;
            const absElev = finalElevations[idx];
            const color = new THREE.Color();

            if (absElev < 100) {
                color.copy(colorWater);
            } else if (absElev < 400) {
                color.lerpColors(colorLow, colorMid, (absElev - 100) / 300);
            } else if (absElev < 800) {
                color.lerpColors(colorMid, colorHigh, (absElev - 400) / 400);
            } else if (absElev < 1500) {
                color.lerpColors(colorHigh, colorPeak, (absElev - 800) / 700);
            } else {
                color.lerpColors(colorPeak, colorSnow, Math.min(1, (absElev - 1500) / 1000));
            }

            colors.push(color.r, color.g, color.b);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.MeshLambertMaterial({
            vertexColors: true,
            side: THREE.DoubleSide
        });

        terrainMesh = new THREE.Mesh(geometry, material);
        terrainMesh.rotation.x = -Math.PI / 2;
        scene.add(terrainMesh);

        // Marker
        const pinGroup = new THREE.Group();
        const poleGeom = new THREE.CylinderGeometry(0.08, 0.08, 2, 8);
        const poleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const pole = new THREE.Mesh(poleGeom, poleMat);
        pole.position.y = 1;
        pinGroup.add(pole);

        const headGeom = new THREE.SphereGeometry(0.5, 16, 16);
        const headMat = new THREE.MeshBasicMaterial({ color: 0xe74c3c });
        const head = new THREE.Mesh(headGeom, headMat);
        head.position.y = 2.3;
        pinGroup.add(head);

        pinGroup.position.set(0, 0, 0);
        observerPin = pinGroup;
        scene.add(observerPin);

        lookTarget.set(0, 2, 0);

        // Sun
        const sunGeom = new THREE.SphereGeometry(2.5, 32, 32);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
        sunMesh = new THREE.Mesh(sunGeom, sunMat);
        scene.add(sunMesh);

        // Glow
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = 128;
        glowCanvas.height = 128;
        const gCtx = glowCanvas.getContext('2d');
        const gradient = gCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(255, 220, 80, 0.9)');
        gradient.addColorStop(0.3, 'rgba(255, 200, 50, 0.4)');
        gradient.addColorStop(0.6, 'rgba(255, 180, 30, 0.1)');
        gradient.addColorStop(1, 'rgba(255, 180, 30, 0)');
        gCtx.fillStyle = gradient;
        gCtx.fillRect(0, 0, 128, 128);

        const glowTexture = new THREE.CanvasTexture(glowCanvas);
        const glowMaterial = new THREE.SpriteMaterial({
            map: glowTexture,
            transparent: true,
            blending: THREE.AdditiveBlending
        });
        sunGlow = new THREE.Sprite(glowMaterial);
        sunGlow.scale.set(18, 18, 1);
        scene.add(sunGlow);

        // Arc
        const arcPoints = [];
        const arcRadius = 60;
        for (let i = 0; i <= 60; i++) {
            const t = (i / 60);
            const angle = Math.PI * t;
            arcPoints.push(new THREE.Vector3(
                arcRadius * Math.cos(angle),
                arcRadius * 0.65 * Math.sin(angle),
                0
            ));
        }
        const pathGeom = new THREE.BufferGeometry().setFromPoints(arcPoints);
        const pathMat = new THREE.LineBasicMaterial({
            color: 0xffcc44,
            transparent: true,
            opacity: 0.15
        });
        pathLine = new THREE.Line(pathGeom, pathMat);
        scene.add(pathLine);

        const ringGeom = new THREE.RingGeometry(terrainSpan / 2 - 0.5, terrainSpan / 2, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x334455,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.2
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -0.1;
        scene.add(ring);
    }

    function updateSunPosition(alt, az) {
        if (!sunMesh) return;

        const altRad = alt * (Math.PI / 180);
        const azRad = az * (Math.PI / 180); 

        const radius = 60; 
        const x = radius * Math.cos(altRad) * Math.sin(azRad);
        const y = radius * Math.sin(altRad); 
        const z = -radius * Math.cos(altRad) * Math.cos(azRad);

        sunMesh.position.set(x, Math.max(0, y), z);
        if (sunGlow) sunGlow.position.copy(sunMesh.position);

        if (pathLine) {
            pathLine.rotation.y = azRad;
        }

        scene.traverse(child => {
            if (child.name === 'sunLight') {
                child.position.copy(sunMesh.position);
            }
        });

        sunTheta = Math.atan2(z, x);
    }

    function animate() {
        animFrame = requestAnimationFrame(animate);
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }

    function render3D(lat, lng, alt, az) {
        if (!isInitialized) {
            const ok = initScene();
            if (!ok) return false;
        } else {
            onWindowResize();
        }

        generateTerrain(lat, lng);
        updateSunPosition(alt, az);

        orbitAngle = {
            theta: sunTheta + Math.PI,
            phi: Math.PI / 2.3
        };
        orbitRadius = 25;
        
        const sunDirX = Math.cos(sunTheta);
        const sunDirZ = Math.sin(sunTheta);
        lookTarget.set(sunDirX * 15, 1, sunDirZ * 15);
        
        updateCameraPosition();

        if (animFrame) cancelAnimationFrame(animFrame);
        animate();
        return true;
    }

    function show(lat, lng, alt, az) {
        const modal = document.getElementById('horizon-3d-modal');
        const loadingEl = document.getElementById('horizon-3d-loading');

        if (!modal) return;
        modal.classList.remove('hidden');

        if (loadingEl) loadingEl.classList.remove('hidden');

        setTimeout(() => {
            try {
                const ok = render3D(lat, lng, alt, az);
                if (!ok) {
                    // Reintento si el modal no se había renderizado completamente en el DOM
                    setTimeout(() => {
                        try {
                            render3D(lat, lng, alt, az);
                        } catch (e2) {
                            console.error('Reintento Horizon3D falló:', e2);
                        } finally {
                            if (loadingEl) loadingEl.classList.add('hidden');
                        }
                    }, 120);
                } else {
                    if (loadingEl) loadingEl.classList.add('hidden');
                }
            } catch (err) {
                console.error('Error generando vista 3D:', err);
                if (loadingEl) loadingEl.classList.add('hidden');
            }
        }, 60);
    }

    function hide() {
        const modal = document.getElementById('horizon-3d-modal');
        if (modal) modal.classList.add('hidden');
        if (animFrame) {
            cancelAnimationFrame(animFrame);
            animFrame = null;
        }
    }

    function init() {}

    return { init, show, hide };
})();
