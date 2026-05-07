/**
 * 3D Horizon Simulator
 * Uses Three.js to render a 3D terrain with the sun position.
 * 
 * Fixes:
 *  - Renderer initialization deferred until modal is visible (non-zero dimensions)
 *  - Terrain colors improved for contrast
 *  - Simple mouse-drag orbit controls (no external dependency)
 *  - Proper PlaneGeometry vertex manipulation
 */

window.Horizon3D = (() => {
    let scene, camera, renderer, container;
    let terrainMesh, sunMesh, sunGlow, pathLine;
    let isInitialized = false;
    let animFrame = null;

    // Simple orbit state
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    let orbitAngle = { theta: Math.PI / 4, phi: Math.PI / 5 };
    let orbitRadius = 45;

    function initScene() {
        container = document.getElementById('horizon-3d-container');
        if (!container) return false;

        // Remove any previous canvas
        const oldCanvas = container.querySelector('canvas');
        if (oldCanvas) oldCanvas.remove();

        const w = container.clientWidth;
        const h = container.clientHeight;

        if (w === 0 || h === 0) return false; // Modal still hidden

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x080a12);
        scene.fog = new THREE.FogExp2(0x080a12, 0.012);

        camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 500);
        updateCameraPosition();

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        // Lights
        const ambient = new THREE.AmbientLight(0x667799, 0.5);
        scene.add(ambient);

        const hemi = new THREE.HemisphereLight(0x8899bb, 0x334422, 0.4);
        scene.add(hemi);

        const dirLight = new THREE.DirectionalLight(0xffddaa, 0.8);
        dirLight.position.set(10, 20, 10);
        scene.add(dirLight);

        // Ground reference grid
        const grid = new THREE.GridHelper(80, 16, 0x222233, 0x111122);
        grid.position.y = -0.1;
        scene.add(grid);

        // Mouse orbit controls
        renderer.domElement.addEventListener('mousedown', onMouseDown);
        renderer.domElement.addEventListener('mousemove', onMouseMove);
        renderer.domElement.addEventListener('mouseup', onMouseUp);
        renderer.domElement.addEventListener('mouseleave', onMouseUp);
        renderer.domElement.addEventListener('wheel', onWheel, { passive: true });

        // Touch controls for mobile
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
            orbitRadius * Math.sin(orbitAngle.phi) * Math.cos(orbitAngle.theta),
            orbitRadius * Math.cos(orbitAngle.phi),
            orbitRadius * Math.sin(orbitAngle.phi) * Math.sin(orbitAngle.theta)
        );
        camera.lookAt(0, 2, 0);
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
        orbitAngle.phi = Math.max(0.15, Math.min(Math.PI / 2.1, orbitAngle.phi + dy * 0.008));
        prevMouse = { x: e.clientX, y: e.clientY };
        updateCameraPosition();
    }
    function onMouseUp() { isDragging = false; }
    function onWheel(e) {
        orbitRadius = Math.max(15, Math.min(80, orbitRadius + e.deltaY * 0.05));
        updateCameraPosition();
    }
    function onTouchStart(e) {
        if (e.touches.length === 1) {
            isDragging = true;
            prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    }
    function onTouchMove(e) {
        if (!isDragging || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - prevMouse.x;
        const dy = e.touches[0].clientY - prevMouse.y;
        orbitAngle.theta -= dx * 0.008;
        orbitAngle.phi = Math.max(0.15, Math.min(Math.PI / 2.1, orbitAngle.phi + dy * 0.008));
        prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        updateCameraPosition();
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

    function generateTerrain(lat, lng) {
        // Clean up previous objects
        if (terrainMesh) { scene.remove(terrainMesh); terrainMesh.geometry.dispose(); }
        if (sunMesh) scene.remove(sunMesh);
        if (sunGlow) scene.remove(sunGlow);
        if (pathLine) { scene.remove(pathLine); pathLine.geometry.dispose(); }

        // --- Terrain from topography data ---
        const gridSize = 40;
        const geometry = new THREE.PlaneGeometry(60, 60, gridSize - 1, gridSize - 1);
        const vertices = geometry.attributes.position.array;

        const centerAlt = getElevation(lat, lng);
        const altScale = 0.008; // meters to Three.js units

        for (let i = 0; i < vertices.length; i += 3) {
            const lx = vertices[i];     // local x
            const lz = vertices[i + 1]; // local z (in plane coords, becomes z after rotation)

            // Map local coords to real geo coords
            const geoLat = lat + (lz / 60) * 0.25;
            const geoLng = lng + (lx / 60) * 0.25;
            const elev = getElevation(geoLat, geoLng);

            vertices[i + 2] = elev * altScale;
        }

        geometry.computeVertexNormals();

        // Color gradient based on height
        const colors = [];
        const colorLow = new THREE.Color(0x1a3a2a);  // dark green (valley)
        const colorMid = new THREE.Color(0x3d6b4f);  // green
        const colorHigh = new THREE.Color(0x8b7355); // brown (peak)
        const colorPeak = new THREE.Color(0xbbaa88); // light brown (summit)

        for (let i = 0; i < vertices.length; i += 3) {
            const h = vertices[i + 2];
            const normalized = Math.max(0, Math.min(1, h / (centerAlt * altScale * 1.5 + 1)));
            const color = new THREE.Color();
            if (normalized < 0.4) {
                color.lerpColors(colorLow, colorMid, normalized / 0.4);
            } else if (normalized < 0.75) {
                color.lerpColors(colorMid, colorHigh, (normalized - 0.4) / 0.35);
            } else {
                color.lerpColors(colorHigh, colorPeak, (normalized - 0.75) / 0.25);
            }
            colors.push(color.r, color.g, color.b);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            flatShading: true,
            side: THREE.DoubleSide,
            shininess: 10
        });

        terrainMesh = new THREE.Mesh(geometry, material);
        terrainMesh.rotation.x = -Math.PI / 2;
        scene.add(terrainMesh);

        // --- Sun sphere ---
        const sunGeom = new THREE.SphereGeometry(1.5, 32, 32);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
        sunMesh = new THREE.Mesh(sunGeom, sunMat);
        scene.add(sunMesh);

        // Sun glow (sprite)
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = 64;
        glowCanvas.height = 64;
        const gCtx = glowCanvas.getContext('2d');
        const gradient = gCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 204, 0, 0.8)');
        gradient.addColorStop(0.4, 'rgba(255, 170, 0, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 170, 0, 0)');
        gCtx.fillStyle = gradient;
        gCtx.fillRect(0, 0, 64, 64);

        const glowTexture = new THREE.CanvasTexture(glowCanvas);
        const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, transparent: true, blending: THREE.AdditiveBlending });
        sunGlow = new THREE.Sprite(glowMaterial);
        sunGlow.scale.set(8, 8, 1);
        scene.add(sunGlow);

        // --- Sun path arc ---
        const arcPoints = [];
        for (let i = 0; i <= 50; i++) {
            const t = (i / 50) * Math.PI;
            arcPoints.push(new THREE.Vector3(
                40 * Math.cos(t),
                20 * Math.sin(t),
                0
            ));
        }
        const pathGeom = new THREE.BufferGeometry().setFromPoints(arcPoints);
        const pathMat = new THREE.LineBasicMaterial({
            color: 0xffcc00,
            transparent: true,
            opacity: 0.2
        });
        pathLine = new THREE.Line(pathGeom, pathMat);
        scene.add(pathLine);

        // --- Observer pin ---
        const pinGeom = new THREE.ConeGeometry(0.4, 1.5, 8);
        const pinMat = new THREE.MeshBasicMaterial({ color: 0xe74c3c });
        const pin = new THREE.Mesh(pinGeom, pinMat);
        pin.position.set(0, centerAlt * altScale + 0.8, 0);
        scene.add(pin);
    }

    function updateSunPosition(alt, az) {
        if (!sunMesh) return;
        const phi = (90 - alt) * (Math.PI / 180);
        const theta = (az - 180) * (Math.PI / 180);

        const radius = 40;
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = Math.max(0, radius * Math.cos(phi));
        const z = radius * Math.sin(phi) * Math.sin(theta);

        sunMesh.position.set(x, y, z);
        if (sunGlow) sunGlow.position.copy(sunMesh.position);

        // Update directional light to come from sun
        if (scene.children) {
            scene.children.forEach(child => {
                if (child.isDirectionalLight) {
                    child.position.copy(sunMesh.position);
                }
            });
        }
    }

    function animate() {
        animFrame = requestAnimationFrame(animate);
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }

    function getElevation(lat, lng) {
        if (!window.topographyData || window.topographyData.length === 0) return 500;
        let nearest = null;
        let minDist = Infinity;
        for (const pt of window.topographyData) {
            const dLat = lat - pt.lat;
            const dLng = lng - pt.lng;
            const dist = dLat * dLat + dLng * dLng;
            if (dist < minDist) {
                minDist = dist;
                nearest = pt;
            }
        }
        return (nearest && minDist < 0.1) ? nearest.alt : 500;
    }

    function show(lat, lng, alt, az) {
        // Show modal FIRST so container has dimensions
        document.getElementById('horizon-3d-modal').classList.remove('hidden');

        // Small delay to let the DOM settle and measure container
        setTimeout(() => {
            if (!isInitialized) {
                const ok = initScene();
                if (!ok) {
                    console.warn('Horizon3D: No se pudo inicializar (contenedor sin dimensiones)');
                    return;
                }
            } else {
                onWindowResize();
            }
            generateTerrain(lat, lng);
            updateSunPosition(alt, az);

            // Reset camera
            orbitAngle = { theta: Math.PI / 4, phi: Math.PI / 4.5 };
            orbitRadius = 45;
            updateCameraPosition();

            // Start render loop
            if (animFrame) cancelAnimationFrame(animFrame);
            animate();
        }, 50);
    }

    function hide() {
        document.getElementById('horizon-3d-modal').classList.add('hidden');
        if (animFrame) {
            cancelAnimationFrame(animFrame);
            animFrame = null;
        }
    }

    // init() is now a no-op — real init happens in show()
    function init() {}

    return { init, show, hide };
})();
