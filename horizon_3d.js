/**
 * 3D Horizon Simulator - v2.0 Complete Rewrite
 * 
 * Renders a realistic 3D terrain around the observer location with:
 *  - Smooth terrain using bilinear interpolation (no Minecraft blocks)
 *  - Proportional elevation scaling (flat = flat, mountains = mountains)
 *  - Camera auto-oriented toward the sun on open
 *  - Realistic sun altitude rendering
 *  - Bright, natural lighting
 *  - Smooth mesh with vertex normals
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

        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w === 0 || h === 0) return false;

        scene = new THREE.Scene();

        // Sky gradient background - much brighter
        scene.background = new THREE.Color(0x1a2a4a);
        scene.fog = new THREE.FogExp2(0x1a2a4a, 0.005);

        camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 800);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = false;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        container.appendChild(renderer.domElement);

        // --- LIGHTING - much brighter and more natural ---
        // Strong ambient for base visibility
        const ambient = new THREE.AmbientLight(0xb0c4de, 0.8);
        scene.add(ambient);

        // Hemisphere light for sky/ground contrast
        const hemi = new THREE.HemisphereLight(0x87CEEB, 0x556B2F, 0.7);
        scene.add(hemi);

        // Main directional (will be repositioned to sun)
        const dirLight = new THREE.DirectionalLight(0xfff5e0, 1.2);
        dirLight.position.set(20, 40, 20);
        dirLight.name = 'sunLight';
        scene.add(dirLight);

        // Fill light from opposite side
        const fillLight = new THREE.DirectionalLight(0x8899bb, 0.4);
        fillLight.position.set(-20, 10, -20);
        scene.add(fillLight);

        // Mouse/touch orbit controls
        renderer.domElement.addEventListener('mousedown', onMouseDown);
        renderer.domElement.addEventListener('mousemove', onMouseMove);
        renderer.domElement.addEventListener('mouseup', onMouseUp);
        renderer.domElement.addEventListener('mouseleave', onMouseUp);
        renderer.domElement.addEventListener('wheel', onWheel, { passive: true });
        renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });
        renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: true });
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

    // --- Mouse orbit handlers ---
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
        orbitRadius = Math.max(15, Math.min(120, orbitRadius + e.deltaY * 0.05));
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
            orbitRadius = Math.max(15, Math.min(120, orbitRadius + delta * 0.2));
            prevPinchDist = dist;
            updateCameraPosition();
        }
    }

    function onWindowResize() {
        if (!container || !renderer) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w === 0 || h === 0) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }

    /**
     * Procedural noise for micro-topography detail.
     * Simple deterministic fractal noise.
     */
    function pseudoNoise(x, z) {
        // Simple hash-based noise
        const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
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

        // Smoothstep interpolation
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

    /**
     * Get elevation using Inverse Distance Weighting (IDW) for better
     * handling of sparse topography data compared to bilinear.
     */
    function getInterpolatedElevation(lat, lng) {
        const data = window.topographyData || (typeof topographyData !== 'undefined' ? topographyData : null);
        if (!data || data.length === 0) return 0;

        // Find N nearest points within a search radius
        const maxPoints = 8;
        const searchRadiusSq = 0.15 * 0.15; // ~15km radius in degrees squared
        const neighbors = [];

        for (const pt of data) {
            const dLat = lat - pt.lat;
            const dLng = lng - pt.lng;
            const dSq = dLat * dLat + dLng * dLng;
            if (dSq < searchRadiusSq) {
                neighbors.push({ alt: pt.alt, dSq: dSq });
            }
        }

        if (neighbors.length === 0) return 0;

        // Sort by distance and take top N
        neighbors.sort((a, b) => a.dSq - b.dSq);
        const activePoints = neighbors.slice(0, maxPoints);

        // Check if we are exactly on a point
        if (activePoints[0].dSq < 0.000001) return activePoints[0].alt;

        // Calculate IDW (power = 2)
        let weightSum = 0;
        let elevSum = 0;
        for (const p of activePoints) {
            const w = 1 / p.dSq;
            elevSum += p.alt * w;
            weightSum += w;
        }

        return elevSum / weightSum;
    }

    /**
     * Simple nearest-neighbor elevation lookup.
     */
    function getElevation(lat, lng) {
        const data = window.topographyData || (typeof topographyData !== 'undefined' ? topographyData : null);
        if (!data || data.length === 0) return 0;
        let nearest = null;
        let minDist = Infinity;
        for (const pt of data) {
            const dLat = lat - pt.lat;
            const dLng = lng - pt.lng;
            const dist = dLat * dLat + dLng * dLng;
            if (dist < minDist) {
                minDist = dist;
                nearest = pt;
            }
        }
        return nearest ? nearest.alt : 0;
    }

    function generateTerrain(lat, lng) {
        // Clear previous meshes
        if (terrainMesh) { scene.remove(terrainMesh); terrainMesh.geometry.dispose(); terrainMesh.material.dispose(); }
        if (sunMesh) scene.remove(sunMesh);
        if (sunGlow) scene.remove(sunGlow);
        if (pathLine) { scene.remove(pathLine); pathLine.geometry.dispose(); pathLine.material.dispose(); }
        if (observerPin) scene.remove(observerPin);

        // --- Terrain grid parameters ---
        // Cover 20km radius (40km total) to match the radar profile
        const RADIUS_KM = 20;
        const TOTAL_KM = RADIUS_KM * 2; 
        const gridSize = 100; 
        const terrainSpan = 120; // Larger span for panoramic feel

        const kmPerDegLat = 111.32;
        const kmPerDegLng = 111.32 * Math.cos(lat * Math.PI / 180);
        const geoSpanLat = TOTAL_KM / kmPerDegLat;
        const geoSpanLng = TOTAL_KM / kmPerDegLng;

        const geometry = new THREE.PlaneGeometry(terrainSpan, terrainSpan, gridSize - 1, gridSize - 1);
        const vertices = geometry.attributes.position.array;

        // Sample elevations
        const baseElevations = [];
        for (let i = 0; i < vertices.length; i += 3) {
            const lx = vertices[i];
            const lz = vertices[i + 1];
            // North is negative Z, East is positive X
            const geoLat = lat - (lz / terrainSpan) * geoSpanLat;
            const geoLng = lng + (lx / terrainSpan) * geoSpanLng;
            baseElevations.push(getInterpolatedElevation(geoLat, geoLng));
        }

        const observerElev = getInterpolatedElevation(lat, lng);
        const minElev = Math.min(...baseElevations);
        const maxElev = Math.max(...baseElevations);
        const elevRange = maxElev - minElev;

        // Vertical scaling - more dramatic to resemble a profile
        let altScale = 0.015;
        if (elevRange < 100) altScale = 0.05; // Boost flat/low areas
        else if (elevRange < 500) altScale = 0.03;
        else if (elevRange > 2000) altScale = 0.012;

        // Final elevation with subtle procedural noise
        const finalElevations = [];
        for (let i = 0; i < vertices.length; i += 3) {
            const idx = i / 3;
            const lx = vertices[i];
            const lz = vertices[i + 1];
            
            // Base altitude from data
            const baseAlt = baseElevations[idx];
            
            // Subtle noise (very low amplitude to not distort real profile)
            const noise = (fractalNoise(lx * 0.3, lz * 0.3) - 0.5) * 1.5;
            
            const finalAlt = baseAlt + noise;
            finalElevations.push(finalAlt);
            
            vertices[i + 2] = (finalAlt - observerElev) * altScale;
        }

        geometry.computeVertexNormals();

        // --- Vertex colors based on absolute elevation ---
        const colors = [];
        const colorWater = new THREE.Color(0x2d5a3f);   // Low/flat green
        const colorLow = new THREE.Color(0x3a7d44);     // Valley green
        const colorMid = new THREE.Color(0x6b8e4e);     // Grass green
        const colorHigh = new THREE.Color(0x8b7355);    // Brown earth
        const colorPeak = new THREE.Color(0xc4b99a);    // Light tan summit
        const colorSnow = new THREE.Color(0xd4d0c8);    // Gray-white high peak

        for (let i = 0; i < vertices.length; i += 3) {
            const idx = i / 3;
            const absElev = finalElevations[idx];
            const color = new THREE.Color();

            // Color based on absolute elevation
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

        // Smooth shading for organic terrain
        const material = new THREE.MeshLambertMaterial({
            vertexColors: true,
            side: THREE.DoubleSide
        });

        terrainMesh = new THREE.Mesh(geometry, material);
        terrainMesh.rotation.x = -Math.PI / 2;
        scene.add(terrainMesh);

        // --- Observer marker ---
        const pinGroup = new THREE.Group();

        // Pole
        const poleGeom = new THREE.CylinderGeometry(0.08, 0.08, 2, 8);
        const poleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const pole = new THREE.Mesh(poleGeom, poleMat);
        pole.position.y = 1;
        pinGroup.add(pole);

        // Pin head (sphere)
        const headGeom = new THREE.SphereGeometry(0.5, 16, 16);
        const headMat = new THREE.MeshBasicMaterial({ color: 0xe74c3c });
        const head = new THREE.Mesh(headGeom, headMat);
        head.position.y = 2.3;
        pinGroup.add(head);

        pinGroup.position.set(0, 0, 0);
        observerPin = pinGroup;
        scene.add(observerPin);

        // Update look target to be at observer level
        lookTarget.set(0, 2, 0);

        // --- Sun sphere (positioned by updateSunPosition) ---
        const sunGeom = new THREE.SphereGeometry(2.5, 32, 32);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
        sunMesh = new THREE.Mesh(sunGeom, sunMat);
        scene.add(sunMesh);

        // Sun glow sprite
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

        // --- Sun path arc (oriented by azimuth) ---
        const arcPoints = [];
        const arcRadius = 60;
        for (let i = 0; i <= 60; i++) {
            const t = (i / 60);
            // Arc from east (sunrise) to west (sunset) passing through the sun position
            const angle = Math.PI * t;
            arcPoints.push(new THREE.Vector3(
                arcRadius * Math.cos(angle),
                arcRadius * 0.65 * Math.sin(angle), // Max height of arc
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

        // --- Subtle ground reference (thin ring at horizon) ---
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

        // Convert altitude and azimuth to 3D coordinates
        // North is negative Z, East is positive X
        const altRad = alt * (Math.PI / 180);
        const azRad = az * (Math.PI / 180); 

        const radius = 60; 
        const x = radius * Math.cos(altRad) * Math.sin(azRad);
        const y = radius * Math.sin(altRad); 
        const z = -radius * Math.cos(altRad) * Math.cos(azRad);

        sunMesh.position.set(x, Math.max(0, y), z);
        if (sunGlow) sunGlow.position.copy(sunMesh.position);

        // Orient sun path arc roughly in sun direction
        if (pathLine) {
            pathLine.rotation.y = azRad;
        }

        // Update directional light to come from sun direction
        scene.traverse(child => {
            if (child.name === 'sunLight') {
                child.position.copy(sunMesh.position);
            }
        });

        // Store sun direction for camera orientation
        // Camera orbit uses: camX = R*sin(phi)*cos(theta), camZ = R*sin(phi)*sin(theta)
        // So to position camera opposite the sun (looking toward it):
        // We need camera theta such that camera is BEHIND observer looking at sun
        // Sun is at (x, y, z), camera orbit theta = atan2(z, x) places cam at same angle
        // Adding PI places it on the opposite side, so cam looks toward the sun
        sunTheta = Math.atan2(z, x);
    }

    function animate() {
        animFrame = requestAnimationFrame(animate);
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }

    function show(lat, lng, alt, az) {
        const modal = document.getElementById('horizon-3d-modal');
        const loadingEl = document.getElementById('horizon-3d-loading');

        modal.classList.remove('hidden');

        // Show loading spinner immediately
        if (loadingEl) loadingEl.classList.remove('hidden');

        // Use requestAnimationFrame + setTimeout to ensure the DOM renders the loading state
        requestAnimationFrame(() => {
            setTimeout(() => {
                if (!isInitialized) {
                    const ok = initScene();
                    if (!ok) {
                        console.warn('Horizon3D: No se pudo inicializar (contenedor sin dimensiones)');
                        if (loadingEl) loadingEl.classList.add('hidden');
                        return;
                    }
                } else {
                    onWindowResize();
                }

                generateTerrain(lat, lng);
                updateSunPosition(alt, az);

                // --- NEW CAMERA ORIENTATION ---
                // To place the pin "at the back" (bottom of screen) and look toward the sun/horizon:
                // 1. We position the camera BEHIND the pin relative to the sun.
                // 2. We look at a target that is IN FRONT of the pin.
                
                orbitAngle = {
                    theta: sunTheta + Math.PI, // Opposite the sun
                    phi: Math.PI / 2.3 // Low angle, looking toward the horizon
                };
                orbitRadius = 25; // Closer to the pin to keep it in the foreground
                
                // Offset lookTarget forward (toward the sun) so the pin (at 0,0,0) 
                // appears at the bottom of the frame
                const sunDirX = Math.cos(sunTheta);
                const sunDirZ = Math.sin(sunTheta);
                lookTarget.set(sunDirX * 15, 1, sunDirZ * 15);
                
                updateCameraPosition();

                // Hide loading
                if (loadingEl) loadingEl.classList.add('hidden');

                if (animFrame) cancelAnimationFrame(animFrame);
                animate();
            }, 80);
        });
    }

    function hide() {
        document.getElementById('horizon-3d-modal').classList.add('hidden');
        if (animFrame) {
            cancelAnimationFrame(animFrame);
            animFrame = null;
        }
    }

    function init() {}

    return { init, show, hide };
})();
