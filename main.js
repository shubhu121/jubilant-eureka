import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

let scene, camera, renderer, composer, mainObject, clock;

// --- Shaders for the core material ---
const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fragmentShader = `
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vPosition;

    // 3D Simplex Noise function
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    void main() {
        // Fresnel effect for glowing edges
        float fresnel = 1.0 - abs(dot(vNormal, normalize(vPosition)));
        fresnel = pow(fresnel, 2.0);

        // Animated noise for surface texture
        float noise = snoise(vNormal * 4.0 + uTime * 0.2);
        noise = (noise + 1.0) * 0.5;

        // Color palette
        vec3 color1 = vec3(0.1, 0.2, 0.8); // Deep Blue
        vec3 color2 = vec3(0.8, 0.2, 0.9); // Magenta
        vec3 edgeColor = vec3(0.5, 0.8, 1.0); // Light Cyan

        // Mix colors based on noise and fresnel
        vec3 finalColor = mix(color1, color2, noise);
        finalColor = mix(finalColor, edgeColor, fresnel);

        gl_FragColor = vec4(finalColor, fresnel * 0.6 + 0.1);
    }
`;

function init() {
    // Scene Setup
    scene = new THREE.Scene();
    clock = new THREE.Clock();
    
    // Target the canvas
    const canvas = document.querySelector('#c');

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 3;

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2;
    controls.maxDistance = 6;
    
    // --- Main Object Group ---
    mainObject = new THREE.Group();
    scene.add(mainObject);

    // 1. Core Geometry
    const coreGeometry = new THREE.IcosahedronGeometry(1, 4);
    const coreMaterial = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
            uTime: { value: 0.0 }
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    mainObject.add(coreMesh);

    // 2. Wireframe Overlay
    const wireframeMaterial = new THREE.MeshBasicMaterial({
        color: 0x80aaff,
        wireframe: true,
        transparent: true,
        opacity: 0.1
    });
    const wireframeMesh = new THREE.Mesh(coreGeometry, wireframeMaterial);
    mainObject.add(wireframeMesh);
    
    // 3. Glowing Spikes (Particles)
    const vertices = coreGeometry.attributes.position.array;
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    
    const particleMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.03,
        map: createParticleTexture(),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    mainObject.add(particles);

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
    scene.add(ambientLight);

    // --- Post-Processing for Glow ---
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0;
    bloomPass.strength = 1.2; // The strength of the glow
    bloomPass.radius = 0.5;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    // Handle window resizing
    window.addEventListener('resize', onWindowResize);
}

function createParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,200,100,1)');
    gradient.addColorStop(0.4, 'rgba(255,100,0,0.4)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    const elapsedTime = clock.getElapsedTime();
    
    // Animate the object
    mainObject.rotation.x = elapsedTime * 0.1;
    mainObject.rotation.y = elapsedTime * 0.15;

    // Update the time uniform in the shader
    mainObject.children[0].material.uniforms.uTime.value = elapsedTime;

    // Use composer to render with post-processing
    composer.render();
}

init();
animate();
