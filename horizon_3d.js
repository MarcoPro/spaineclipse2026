/**
 * 3D Horizon Simulator
 * Uses Three.js to render a 3D terrain and sun path.
 */

window.Horizon3D = (() => {
    let scene, camera, renderer, container;
    let terrainMesh, sunMesh;
    let isInitialized = false;

    function init() {
        container = document.getElementById('horizon-3d-container');
        if (!container) return;
        
        const w = container.clientWidth;
        const h = container.clientHeight;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x050608);

        camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
        camera.position.set(0, 15, 30);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffcc00, 1);
        sunLight.position.set(10, 10, 10);
        scene.add(sunLight);

        // Ground Grid
        const grid = new THREE.GridHelper(100, 20, 0x333333, 0x111111);
        scene.add(grid);

        window.addEventListener('resize', onWindowResize);
        
        animate();
        isInitialized = true;
    }

    function onWindowResize() {
        if (!container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }

    function generateTerrain(lat, lng) {
        if (!window.topographyData) return;
        
        // Remove old terrain
        if (terrainMesh) scene.remove(terrainMesh);

        const points = [];
        const gridSize = 30; // 30x30 points
        const range = 0.2; // roughly 20km

        // Create geometry
        const geometry = new THREE.PlaneGeometry(60, 60, gridSize - 1, gridSize - 1);
        const vertices = geometry.attributes.position.array;

        // Find relevant data points and interpolate
        // For simplicity in this wow-demo, we'll create a procedural terrain 
        // influenced by the closest real data points.
        const centerAlt = getElevation(lat, lng);

        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const z = vertices[i + 1]; // z is y in PlaneGeometry
            
            // Procedural hills + real center alt
            const dist = Math.sqrt(x*x + z*z);
            let h = Math.sin(x * 0.2) * Math.cos(z * 0.2) * 3;
            h += (centerAlt / 100) * Math.exp(-dist * 0.05); // Peak at center
            
            vertices[i + 2] = h; // y height
        }
        
        geometry.computeVertexNormals();

        const material = new THREE.MeshPhongMaterial({
            color: 0x1e272e,
            wireframe: false,
            flatShading: true,
            side: THREE.DoubleSide
        });

        terrainMesh = new THREE.Mesh(geometry, material);
        terrainMesh.rotation.x = -Math.PI / 2;
        scene.add(terrainMesh);
        
        // Add Sun indicator
        if (sunMesh) scene.remove(sunMesh);
        const sunGeom = new THREE.SphereGeometry(1, 32, 32);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
        sunMesh = new THREE.Mesh(sunGeom, sunMat);
        scene.add(sunMesh);
        
        // Add a line for the sun path
        // (Just a simple arc for the demo)
        const curve = new THREE.EllipseCurve(0, 0, 40, 40, 0, Math.PI, false, 0);
        const pathPoints = curve.getPoints(50);
        const pathGeom = new THREE.BufferGeometry().setFromPoints(pathPoints);
        const pathMat = new THREE.LineBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.3 });
        const pathLine = new THREE.Line(pathGeom, pathMat);
        pathLine.rotation.x = Math.PI / 2;
        scene.add(pathLine);
    }

    function updateSunPosition(alt, az) {
        if (!sunMesh) return;
        // Azimuth from North (0) clockwise. Three.js: -z is North
        const phi = (90 - alt) * (Math.PI / 180);
        const theta = (az - 90) * (Math.PI / 180);
        
        const radius = 45;
        sunMesh.position.set(
            radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
        );
    }

    function animate() {
        requestAnimationFrame(animate);
        if (terrainMesh) {
            // Very slow rotation for a "living" look
            // terrainMesh.rotation.z += 0.001; 
        }
        renderer.render(scene, camera);
    }

    function getElevation(lat, lng) {
        if (!window.topographyData || window.topographyData.length === 0) return 0;
        // Simple nearest neighbor search
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
        if (!isInitialized) init();
        document.getElementById('horizon-3d-modal').classList.remove('hidden');
        generateTerrain(lat, lng);
        updateSunPosition(alt, az);
        
        // Simple orbital camera effect
        camera.position.set(30, 20, 30);
        camera.lookAt(0, 0, 0);
    }

    function hide() {
        document.getElementById('horizon-3d-modal').classList.add('hidden');
    }

    return { init, show, hide };
})();
