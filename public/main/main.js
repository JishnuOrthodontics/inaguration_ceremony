/**
 * ══════════════════════════════════════════════════════════════════
 * MAIN SCREEN — The Cinematic 3D Stage
 * ══════════════════════════════════════════════════════════════════
 * 
 * A grand theater with 3D curtains, dramatic lighting, post-processing,
 * particle systems, and a cinematic reveal sequence.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const CURTAIN_SEGMENTS_X = 96;
const CURTAIN_SEGMENTS_Y = 64;
const CURTAIN_WIDTH = 5.2;
const CURTAIN_HEIGHT = 7;
const DUST_COUNT = 300;
const CONFETTI_COUNT = 2500;
const CURTAIN_PLEATS = 14.0; // vertical folds across each panel

// ─── State ───────────────────────────────────────────────────────────────────

let currentProgress = 0;
let targetProgress = 0;
let isRevealed = false;
let revealTimeline = null;
let sessionId = null;
let cameraShakeIntensity = 0;
let audioCtx = null;
let droneOsc = null;
let droneGain = null;

// ─── Three.js Setup ──────────────────────────────────────────────────────────

const canvas = document.getElementById('stage-canvas');
const scene = new THREE.Scene();
// Warm hall atmosphere — clearly visible warm burgundy, not near-black
scene.fog = new THREE.FogExp2(0x6b4034, 0.004);
scene.background = new THREE.Color(0x5c3428);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 10);
camera.lookAt(0, 1.5, 0);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ─── Post-Processing ─────────────────────────────────────────────────────────

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.2,   // subtle strength to prevent white image blowout
  0.4,   // radius
  0.92   // higher threshold so white textures don't bloom overbright
);
composer.addPass(bloomPass);

// Vignette + Film Grain shader
const vignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignetteIntensity: { value: 0.08 },
    uGrainIntensity: { value: 0.02 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignetteIntensity;
    uniform float uGrainIntensity;
    varying vec2 vUv;

    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      
      // Vignette
      vec2 center = vUv - 0.5;
      float dist = length(center);
      float vignette = 1.0 - smoothstep(0.3, 0.85, dist) * uVignetteIntensity;
      color.rgb *= vignette;
      
      // Film grain
      float grain = random(vUv + fract(uTime)) * uGrainIntensity;
      color.rgb += grain - uGrainIntensity * 0.5;
      
      gl_FragColor = color;
    }
  `
};

const vignettePass = new ShaderPass(vignetteShader);
composer.addPass(vignettePass);

// ─── Lighting ────────────────────────────────────────────────────────────────

// Ambient — bright warm fill so the hall never collapses to black
const ambientLight = new THREE.AmbientLight(0xffedd8, 1.45);
scene.add(ambientLight);

// Soft sky / ground bounce for depth without blue cast
const hemiLight = new THREE.HemisphereLight(0xffe4c4, 0x5c2e22, 0.9);
scene.add(hemiLight);

// Main spotlight on curtain — champagne white (always some presence)
const mainSpot = new THREE.SpotLight(0xfff2dc, 3.5, 18, Math.PI * 0.28, 0.35, 1.0);
mainSpot.position.set(0, 8, 4);
mainSpot.target.position.set(0, 2, 0);
mainSpot.castShadow = true;
mainSpot.shadow.mapSize.set(2048, 2048);
scene.add(mainSpot);
scene.add(mainSpot.target);

// Stage backlight — warm rose wash behind curtains
const stageBacklight = new THREE.DirectionalLight(0xe07050, 1.4);
stageBacklight.position.set(0, 5, -2.5);
scene.add(stageBacklight);

// Side rim lights — amber gold kissing columns & velvet
const rimLeft = new THREE.PointLight(0xe8a84a, 5.0, 16);
rimLeft.position.set(-5, 3, 3);
scene.add(rimLeft);

const rimRight = new THREE.PointLight(0xf0b860, 5.0, 16);
rimRight.position.set(5, 3, 3);
scene.add(rimRight);

// Dedicated Column Spotlights — warm top-down wash
const columnSpotLeft = new THREE.SpotLight(0xffe0b0, 5.5, 15, Math.PI * 0.25, 0.4, 1.0);
columnSpotLeft.position.set(-5.5, 7, 2);
columnSpotLeft.target.position.set(-5.5, 1, 0);
scene.add(columnSpotLeft);
scene.add(columnSpotLeft.target);

const columnSpotRight = new THREE.SpotLight(0xffe0b0, 5.5, 15, Math.PI * 0.25, 0.4, 1.0);
columnSpotRight.position.set(5.5, 7, 2);
columnSpotRight.target.position.set(5.5, 1, 0);
scene.add(columnSpotRight);
scene.add(columnSpotRight.target);

// Brochure reveal light (dormant initially) — soft gold
const revealLight = new THREE.PointLight(0xffd78a, 0, 8);
revealLight.position.set(0, 3, 1);
scene.add(revealLight);

// ─── Floor ───────────────────────────────────────────────────────────────────

const floorGeo = new THREE.PlaneGeometry(30, 20);
const floorMat = new THREE.MeshStandardMaterial({
  color: 0x8a5a42,
  metalness: 0.35,
  roughness: 0.4,
  envMapIntensity: 1.0,
  emissive: 0x3a2018,
  emissiveIntensity: 0.25
});
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.5;
floor.receiveShadow = true;
scene.add(floor);

// ─── Backdrop Wall ───────────────────────────────────────────────────────────

const backdropGeo = new THREE.PlaneGeometry(16, 10);
const backdropMat = new THREE.MeshStandardMaterial({
  color: 0x7a3040,
  roughness: 0.45,
  metalness: 0.05,
  emissive: 0x4a1824,
  emissiveIntensity: 0.55
});
const backdrop = new THREE.Mesh(backdropGeo, backdropMat);
backdrop.position.set(0, 2.5, -3);
scene.add(backdrop);

// ─── Columns ─────────────────────────────────────────────────────────────────

function createColumn(x) {
  const group = new THREE.Group();

  // Main shaft — cream marble with warm amber emissive
  const shaftGeo = new THREE.CylinderGeometry(0.26, 0.32, 8, 24);
  const shaftMat = new THREE.MeshStandardMaterial({
    color: 0xf3e6d4,
    emissive: 0x5c3a18,
    emissiveIntensity: 0.22,
    metalness: 0.12,
    roughness: 0.32
  });
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  shaft.position.y = 2.5;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  group.add(shaft);

  // Base — Ornate marble base
  const baseGeo = new THREE.CylinderGeometry(0.48, 0.55, 0.45, 24);
  const base = new THREE.Mesh(baseGeo, shaftMat);
  base.position.y = -1.3;
  group.add(base);

  // Capital — Ornate top capital
  const capGeo = new THREE.CylinderGeometry(0.55, 0.28, 0.55, 24);
  const cap = new THREE.Mesh(capGeo, shaftMat);
  cap.position.y = 6.7;
  group.add(cap);

  // Gold ring accents (top capital ring + bottom base ring)
  const ringGeo = new THREE.TorusGeometry(0.36, 0.05, 12, 32);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xe6c35c,
    metalness: 0.95,
    roughness: 0.12,
    emissive: 0xb8860b,
    emissiveIntensity: 0.4
  });

  const topRing = new THREE.Mesh(ringGeo, ringMat);
  topRing.position.y = 6.45;
  topRing.rotation.x = Math.PI / 2;
  group.add(topRing);

  const bottomRing = new THREE.Mesh(ringGeo, ringMat);
  bottomRing.position.y = -1.05;
  bottomRing.rotation.x = Math.PI / 2;
  group.add(bottomRing);

  group.position.x = x;
  return group;
}

const leftColumn = createColumn(-5.5);
const rightColumn = createColumn(5.5);
scene.add(leftColumn);
scene.add(rightColumn);

// Inner columns closer to stage
const innerLeft = createColumn(-4);
innerLeft.scale.setScalar(0.75);
scene.add(innerLeft);
const innerRight = createColumn(4);
innerRight.scale.setScalar(0.75);
scene.add(innerRight);

// ─── Curtain Rod ─────────────────────────────────────────────────────────────

const rodGeo = new THREE.CylinderGeometry(0.06, 0.06, 11, 8);
const rodMat = new THREE.MeshStandardMaterial({
  color: 0xd4a44a,
  metalness: 0.95,
  roughness: 0.1,
  emissive: 0xb8860b,
  emissiveIntensity: 0.2
});
const rod = new THREE.Mesh(rodGeo, rodMat);
rod.rotation.z = Math.PI / 2;
rod.position.set(0, CURTAIN_HEIGHT - 1.5 + 1.5, -0.3);
scene.add(rod);

// Rod end caps (finials)
const finialGeo = new THREE.SphereGeometry(0.12, 12, 12);
const finialLeft = new THREE.Mesh(finialGeo, rodMat);
finialLeft.position.set(-5.5, rod.position.y, rod.position.z);
scene.add(finialLeft);
const finialRight = new THREE.Mesh(finialGeo, rodMat);
finialRight.position.set(5.5, rod.position.y, rod.position.z);
scene.add(finialRight);

// ─── Curtain System — Realistic velvet stage cloth ───────────────────────────

const curtainVertexShader = `
  uniform float uTime;
  uniform float uOpenAmount;
  uniform float uSide; // -1.0 left, 1.0 right
  uniform float uPleats;
  uniform float uHalfWidth;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vFold; // -1 valley … +1 ridge

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Distance from the OUTER edge (rod side we gather toward)
    // Left curtain: outer is uv.x=0; right curtain: outer is uv.x=1
    float fromOuter = (uSide < 0.0) ? uv.x : (1.0 - uv.x);
    float fromInner = 1.0 - fromOuter;

    // ── Permanent vertical pleats (theater folds) ──
    float pleatPhase = uv.x * uPleats * 3.14159265;
    float fold = sin(pleatPhase);
    vFold = fold;

    // Gather tighter at the rod (top) — ruching
    float topGather = mix(0.55, 1.35, pow(uv.y, 0.65));
    // Slightly looser, heavier drape near the floor
    float bottomWeight = mix(1.15, 0.85, uv.y);

    float foldDepth = 0.22 * topGather * bottomWeight;
    // As curtains open, fabric bunches → deeper, tighter folds
    foldDepth *= (1.0 + uOpenAmount * 1.8);

    pos.z += fold * foldDepth;

    // Lateral weave so folds have real volume (not flat Z only)
    pos.x += cos(pleatPhase) * foldDepth * 0.22;

    // Soft fabric breathing
    float flutter = sin(pos.y * 2.4 + uTime * 1.2 + uv.x * 4.0) * 0.035;
    flutter += sin(pos.y * 5.5 + uTime * 2.1) * 0.012;
    flutter *= (1.0 - uOpenAmount * 0.55);
    pos.z += flutter * fromInner;

    // Wavy hem — cloth pools / undulates at the floor
    float hem = (1.0 - uv.y);
    pos.y -= hem * hem * 0.12;
    pos.y += sin(pleatPhase) * 0.07 * hem;
    pos.z += sin(pleatPhase * 0.5) * 0.04 * hem;

    // ── Open: squeeze toward outer edge (bunch, don't just slide flat) ──
    float squeeze = 1.0 - uOpenAmount * 0.62;
    // Keep a little extra compression on the inner leading edge
    float leadingEase = mix(1.0, 0.82, pow(fromOuter, 1.4) * uOpenAmount);
    squeeze *= leadingEase;

    pos.x *= squeeze;
    // Shift whole panel outward as it compresses so the center opens
    pos.x += uSide * uHalfWidth * (1.0 - squeeze);

    // Swag pull: inner edge lifts slightly when drawn open (tie-back feel)
    pos.y += fromOuter * uOpenAmount * 0.35 * (1.0 - uv.y * 0.3);
    pos.z += fromOuter * uOpenAmount * 0.25;

    // Analytic normal from fold derivative for velvet shading
    float dFold = cos(pleatPhase) * foldDepth * uPleats * 3.14159265;
    vec3 tangent = normalize(vec3(1.0, 0.0, dFold));
    vec3 bitangent = normalize(vec3(0.0, 1.0, hem * 0.15));
    vec3 localN = normalize(cross(tangent, bitangent));
    // Flip for the other side of double-sided if needed
    vNormal = normalize(normalMatrix * localN);

    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const curtainFragmentShader = `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpenAmount;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vFold;

  void main() {
    // Ridge (1) vs valley (0)
    float ridge = vFold * 0.5 + 0.5;

    // Deep velvet valleys → bright fold crests (reference cloth look)
    vec3 valleyCol = uColor * 0.22;
    vec3 midCol    = uColor * 0.85;
    vec3 crestCol  = uColor * 1.25 + vec3(0.18, 0.04, 0.03);

    vec3 color = mix(valleyCol, midCol, smoothstep(0.0, 0.55, ridge));
    color = mix(color, crestCol, smoothstep(0.55, 1.0, ridge));

    // Soft anisotropic velvet sheen along folds
    float sheen = pow(ridge, 2.4) * 0.28;
    color += vec3(0.35, 0.12, 0.08) * sheen;

    // Micro fiber noise — breaks the plastic flat look
    float fiber = sin(vUv.x * 280.0) * sin(vUv.y * 90.0);
    color *= 0.97 + fiber * 0.04;

    // Extra shadow in the crease of each pleat
    float crease = 1.0 - abs(vFold);
    color *= 1.0 - crease * crease * 0.18;

    // Soft top lighting / bottom weight
    float lightGrad = smoothstep(-1.2, 3.5, vWorldPos.y);
    color *= 0.7 + lightGrad * 0.45;

    // Gathered header is denser / slightly darker near the rod
    float header = smoothstep(0.78, 1.0, vUv.y);
    color *= 1.0 - header * 0.12;

    // Mild fresnel lift on silhouette
    float fresnel = pow(1.0 - abs(normalize(vNormal).z), 2.2);
    color += vec3(0.2, 0.05, 0.04) * fresnel * 0.35;

    gl_FragColor = vec4(color, 1.0);
  }
`;

function createCurtainPanel(side) {
  const geo = new THREE.PlaneGeometry(
    CURTAIN_WIDTH, CURTAIN_HEIGHT,
    CURTAIN_SEGMENTS_X, CURTAIN_SEGMENTS_Y
  );

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpenAmount: { value: 0 },
      uSide: { value: side },
      uPleats: { value: CURTAIN_PLEATS },
      uHalfWidth: { value: CURTAIN_WIDTH / 2 },
      uColor: { value: new THREE.Color(0x9b0a22) } // Rich stage crimson
    },
    vertexShader: curtainVertexShader,
    fragmentShader: curtainFragmentShader,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  // Each panel covers half the stage; slight Z stagger so folds read in depth
  const offsetX = side * (CURTAIN_WIDTH / 2 + 0.02);
  mesh.position.set(offsetX, (CURTAIN_HEIGHT / 2) - 1.55, 0.05);

  return { mesh, material: mat };
}

const leftCurtain = createCurtainPanel(-1);
const rightCurtain = createCurtainPanel(1);
scene.add(leftCurtain.mesh);
scene.add(rightCurtain.mesh);

// ─── Brochure Object ─────────────────────────────────────────────────────────

const brochureGroup = new THREE.Group();

// Load brochure texture
const texLoader = new THREE.TextureLoader();
const brochureTex = texLoader.load('/assets/brochure.jpg');
brochureTex.colorSpace = THREE.SRGBColorSpace;

// Brochure card (thin box)
const brochureGeo = new THREE.BoxGeometry(4.5, 2.5, 0.05);
const brochureMaterials = [
  new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.5 }), // right
  new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.5 }), // left
  new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.5 }), // top
  new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.5 }), // bottom
  new THREE.MeshBasicMaterial({ map: brochureTex }), // front — 100% bright, unshadowed true color
  new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.5 })  // back
];
const brochureMesh = new THREE.Mesh(brochureGeo, brochureMaterials);
brochureMesh.castShadow = true;
brochureMesh.receiveShadow = false;
brochureGroup.add(brochureMesh);

// Soft gold glow frame
const glowGeo = new THREE.BoxGeometry(4.8, 2.8, 0.01);
const glowMat = new THREE.MeshBasicMaterial({
  color: 0xe8c878,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending
});
const glowFrame = new THREE.Mesh(glowGeo, glowMat);
glowFrame.position.z = -0.04;
brochureGroup.add(glowFrame);

brochureGroup.position.set(0, -5, -1); // Hidden below floor initially
brochureGroup.scale.setScalar(0);
scene.add(brochureGroup);

// ─── Volumetric Light Cone ───────────────────────────────────────────────────

const coneGeo = new THREE.CylinderGeometry(0.3, 3, 8, 16, 1, true);
const coneMat = new THREE.MeshBasicMaterial({
  color: 0xffe0a8,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  depthWrite: false
});
const lightCone = new THREE.Mesh(coneGeo, coneMat);
lightCone.position.set(0, 5, 1);
lightCone.rotation.x = Math.PI * 0.05;
scene.add(lightCone);

// ─── Dust Motes Particle System ──────────────────────────────────────────────

const dustGeo = new THREE.BufferGeometry();
const dustPositions = new Float32Array(DUST_COUNT * 3);
const dustVelocities = new Float32Array(DUST_COUNT * 3);
const dustSizes = new Float32Array(DUST_COUNT);

for (let i = 0; i < DUST_COUNT; i++) {
  dustPositions[i * 3] = (Math.random() - 0.5) * 8;
  dustPositions[i * 3 + 1] = Math.random() * 8 - 1;
  dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 6 + 1;
  dustVelocities[i * 3] = (Math.random() - 0.5) * 0.002;
  dustVelocities[i * 3 + 1] = (Math.random() - 0.5) * 0.001;
  dustVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.002;
  dustSizes[i] = Math.random() * 3 + 1;
}

dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
dustGeo.setAttribute('size', new THREE.BufferAttribute(dustSizes, 1));

const dustMat = new THREE.PointsMaterial({
  color: 0xffe6b8,
  size: 0.03,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true
});

const dustSystem = new THREE.Points(dustGeo, dustMat);
scene.add(dustSystem);

// ─── Confetti System (Instanced) ─────────────────────────────────────────────

const confettiGeo = new THREE.PlaneGeometry(0.08, 0.12);
const confettiMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0
});
const confettiMesh = new THREE.InstancedMesh(confettiGeo, confettiMat, CONFETTI_COUNT);
confettiMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
confettiMesh.frustumCulled = false;

const confettiColors = [
  new THREE.Color(0x8a061a), new THREE.Color(0xc9a227),
  new THREE.Color(0xe8d5a3), new THREE.Color(0xffffff),
  new THREE.Color(0xb91c2c), new THREE.Color(0xd4a84b),
  new THREE.Color(0xf5efe6), new THREE.Color(0x5c1a1a)
];

const confettiData = [];
const confettiDummy = new THREE.Object3D();

for (let i = 0; i < CONFETTI_COUNT; i++) {
  confettiData.push({
    pos: new THREE.Vector3(
      (Math.random() - 0.5) * 12,
      Math.random() * 12 + 6,
      (Math.random() - 0.5) * 6
    ),
    vel: new THREE.Vector3(
      (Math.random() - 0.5) * 0.05,
      -Math.random() * 0.04 - 0.02,
      (Math.random() - 0.5) * 0.03
    ),
    rot: new THREE.Euler(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    ),
    rotSpeed: new THREE.Vector3(
      (Math.random() - 0.5) * 0.1,
      (Math.random() - 0.5) * 0.1,
      (Math.random() - 0.5) * 0.1
    ),
    scale: Math.random() * 0.8 + 0.5
  });

  // Assign random color
  const col = confettiColors[Math.floor(Math.random() * confettiColors.length)];
  confettiMesh.setColorAt(i, col);

  confettiDummy.position.set(0, -10, 0);
  confettiDummy.updateMatrix();
  confettiMesh.setMatrixAt(i, confettiDummy.matrix);
}
confettiMesh.instanceColor.needsUpdate = true;
scene.add(confettiMesh);

let confettiActive = false;

// ─── Audio System (Web Audio API) ────────────────────────────────────────────

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Low drone pad
  droneOsc = audioCtx.createOscillator();
  droneOsc.type = 'sawtooth';
  droneOsc.frequency.value = 55; // Low A
  droneGain = audioCtx.createGain();
  droneGain.gain.value = 0;

  const droneFilter = audioCtx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 200;
  droneFilter.Q.value = 2;

  droneOsc.connect(droneFilter);
  droneFilter.connect(droneGain);
  droneGain.connect(audioCtx.destination);
  droneOsc.start();
}

function playRevealHit() {
  if (!audioCtx) return;

  // Orchestral hit — layered noise burst + sub bass
  const duration = 2.5;
  const now = audioCtx.currentTime;

  // White noise burst
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioCtx.sampleRate * 0.3));
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(0.3, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 800;
  noiseFilter.Q.value = 0.5;

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);
  noise.start();

  // Sub bass boom
  const subOsc = audioCtx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.setValueAtTime(80, now);
  subOsc.frequency.exponentialRampToValueAtTime(30, now + 1.5);

  const subGain = audioCtx.createGain();
  subGain.gain.setValueAtTime(0.4, now);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 2);

  subOsc.connect(subGain);
  subGain.connect(audioCtx.destination);
  subOsc.start();
  subOsc.stop(now + 2);

  // Bright shimmer
  const shimmerOsc = audioCtx.createOscillator();
  shimmerOsc.type = 'sine';
  shimmerOsc.frequency.value = 1200;

  const shimmerGain = audioCtx.createGain();
  shimmerGain.gain.setValueAtTime(0.1, now);
  shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 3);

  shimmerOsc.connect(shimmerGain);
  shimmerGain.connect(audioCtx.destination);
  shimmerOsc.start();
  shimmerOsc.stop(now + 3);
}

function playCurtainRustle() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const duration = 0.15;
  
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.05 * Math.exp(-i / (audioCtx.sampleRate * 0.05));
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2000;
  
  const gain = audioCtx.createGain();
  gain.gain.value = 0.15;
  
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  noise.start();
}

// ─── Socket.io Connection ────────────────────────────────────────────────────

const socket = io();

async function initSession() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    sessionId = data.sessionId;

    // Join the session room
    socket.emit('join-session', sessionId);

    // Fetch and display QR code
    const qrRes = await fetch(`/api/qr/${sessionId}`);
    const qrData = await qrRes.json();

    const qrContainer = document.getElementById('qr-container');
    qrContainer.innerHTML = `<img src="${qrData.qr}" alt="Scan to join">`;

    console.log(`[Session] Joined: ${sessionId}`);
    console.log(`[Session] Controller URL: ${qrData.url}`);
  } catch (err) {
    console.error('[Session] Failed to initialize:', err);
  }
}

// Handle energy updates from server
socket.on('energy-update', (data) => {
  initAudio(); // Initialize audio on first interaction

  targetProgress = data.progress;

  // Update HUD
  const energyFill = document.getElementById('energy-bar-fill');
  const energyText = document.getElementById('energy-text');
  energyFill.style.width = `${Math.round(data.progress * 100)}%`;
  energyText.textContent = `${Math.round(data.progress * 100)}%`;

  // Show HUD, hide QR overlay on first tap
  document.getElementById('qr-overlay').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');

  // Play curtain rustle sound occasionally
  if (Math.random() < 0.3) playCurtainRustle();
});

// Handle full reveal
socket.on('revealed', () => {
  isRevealed = true;
  triggerRevealSequence();
});

// Handle reset
socket.on('reset', () => {
  isRevealed = false;
  targetProgress = 0;
  currentProgress = 0;
  confettiActive = false;

  // Reset brochure
  brochureGroup.position.set(0, -5, -1);
  brochureGroup.scale.setScalar(0);
  brochureGroup.rotation.set(0, 0, 0);
  glowMat.opacity = 0;

  // Reset lights & post-processing
  revealLight.intensity = 0;
  revealLight.position.set(0, 3, 1);
  ambientLight.intensity = 1.45;
  bloomPass.strength = 0.2;
  vignettePass.uniforms.uVignetteIntensity.value = 0.08;
  vignettePass.uniforms.uGrainIntensity.value = 0.02;

  // Reset confetti
  confettiMat.opacity = 0;

  // Reset HUD
  document.getElementById('energy-bar-fill').style.width = '0%';
  document.getElementById('energy-text').textContent = '0%';

  // Show QR overlay again
  document.getElementById('qr-overlay').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');

  // Kill any running GSAP timelines
  if (revealTimeline) {
    revealTimeline.kill();
    revealTimeline = null;
  }
});

// Handle client count updates
socket.on('client-count', (data) => {
  document.getElementById('client-num').textContent = data.count;
});

// Handle state sync
socket.on('state-update', (data) => {
  targetProgress = data.progress;
  if (data.isRevealed) {
    isRevealed = true;
  }
});

// ─── Reveal Sequence (GSAP Timeline) ────────────────────────────────────────

function triggerRevealSequence() {
  playRevealHit();

  // Increase bloom for dramatic effect
  revealTimeline = gsap.timeline();

  // Phase 1: Camera shake (anticipation)
  revealTimeline.to({}, {
    duration: 0.8,
    onUpdate: function () {
      cameraShakeIntensity = 0.04 * (1 - this.progress());
    }
  });

  // Phase 2: Curtains fly fully open with elastic overshoot
  revealTimeline.to({}, {
    duration: 1.5,
    ease: 'elastic.out(1, 0.6)',
    onUpdate: function () {
      targetProgress = 1.0 + this.progress() * 0.15; // Overshoot
    }
  }, '+=0.1');

  // Settle the overshoot
  revealTimeline.to({}, {
    duration: 0.6,
    onUpdate: function () {
      targetProgress = 1.15 - this.progress() * 0.15;
    }
  });

  // Phase 3: Subtle bloom response
  revealTimeline.to(bloomPass, {
    strength: 0.25,
    duration: 0.5,
    ease: 'power2.in'
  }, '-=1.5');

  revealTimeline.to(bloomPass, {
    strength: 0.15,
    duration: 1.0,
    ease: 'power2.out'
  });

  // Phase 4: Brochure rises from below to center stage
  revealTimeline.to(brochureGroup.position, {
    y: 1.5,
    z: 0,
    duration: 1.8,
    ease: 'elastic.out(1, 0.6)'
  }, '-=1.2');

  revealTimeline.to(brochureGroup.scale, {
    x: 1, y: 1, z: 1,
    duration: 1.5,
    ease: 'elastic.out(1, 0.6)'
  }, '<');

  // Spin the brochure during rise
  revealTimeline.to(brochureGroup.rotation, {
    y: Math.PI * 2,
    duration: 1.8,
    ease: 'power2.out'
  }, '<');

  // Phase 5: Subtle glow frame (no heavy additive glare)
  revealTimeline.to(glowMat, {
    opacity: 0.05,
    duration: 0.8,
    ease: 'power2.out'
  }, '-=0.8');

  // Phase 6: Gentle reveal light
  revealTimeline.to(revealLight, {
    intensity: 1.2,
    duration: 1.0,
    ease: 'power2.out'
  }, '<');

  // Phase 7: Confetti!
  revealTimeline.call(() => {
    confettiActive = true;
    confettiMat.opacity = 1;
  }, null, '-=0.5');

  // Phase 8: Hold at center stage briefly (0.8s) for dramatic appreciation
  revealTimeline.to({}, { duration: 0.8 });

  // Phase 9: FULL PAGE EXPANSION — Expand brochure from center to fill screen brilliantly!
  revealTimeline.to(brochureGroup.position, {
    x: 0,
    y: 1.5,
    z: 4.6,
    duration: 2.2,
    ease: 'power3.inOut'
  });

  revealTimeline.to(brochureGroup.scale, {
    x: 1.45,
    y: 1.45,
    z: 1.45,
    duration: 2.2,
    ease: 'power3.inOut'
  }, '<');

  // Reduce bloom strength so the white brochure image does NOT glare or overexpose
  revealTimeline.to(bloomPass, {
    strength: 0.1,
    duration: 2.2,
    ease: 'power3.inOut'
  }, '<');

  // Fade out glow frame outline so it doesn't bleed into the image
  revealTimeline.to(glowMat, {
    opacity: 0.0,
    duration: 1.5,
    ease: 'power2.out'
  }, '<');

  // Keep reveal light gentle & natural
  revealTimeline.to(revealLight, {
    intensity: 1.5,
    duration: 2.2,
    ease: 'power3.inOut'
  }, '<');

  revealTimeline.to(ambientLight, {
    intensity: 1.2,
    duration: 2.2,
    ease: 'power3.inOut'
  }, '<');

  // Fade out vignette and film grain shadows for crystal clear full-screen image
  revealTimeline.to(vignettePass.uniforms.uVignetteIntensity, {
    value: 0.0,
    duration: 2.2,
    ease: 'power3.inOut'
  }, '<');

  revealTimeline.to(vignettePass.uniforms.uGrainIntensity, {
    value: 0.0,
    duration: 2.2,
    ease: 'power3.inOut'
  }, '<');

  // Ensure brochure faces camera flat during expansion
  revealTimeline.to(brochureGroup.rotation, {
    x: 0,
    y: Math.PI * 2,
    z: 0,
    duration: 1.5,
    ease: 'power2.out'
  }, '<');

  // Fade out HUD bar during full-page expansion for a clean presentation
  revealTimeline.call(() => {
    document.getElementById('hud').classList.add('hidden');
  }, null, '-=1.5');

  // Phase 10: Subtle breathing float in full-screen view
  revealTimeline.to(brochureGroup.position, {
    z: 4.75,
    duration: 3.5,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: -1
  });
}

// ─── Animation Loop ──────────────────────────────────────────────────────────

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // ── Smooth progress interpolation ──
  currentProgress += (targetProgress - currentProgress) * 0.05;

  // ── Update curtain uniforms ──
  const openAmount = Math.max(0, Math.min(currentProgress, 1.15));
  leftCurtain.material.uniforms.uTime.value = elapsed;
  leftCurtain.material.uniforms.uOpenAmount.value = openAmount;
  rightCurtain.material.uniforms.uTime.value = elapsed;
  rightCurtain.material.uniforms.uOpenAmount.value = openAmount;

  // ── Curtain open: mostly shader bunching + a light outward slide ──
  const maxSlide = CURTAIN_WIDTH * 0.22;
  leftCurtain.mesh.position.x = -(CURTAIN_WIDTH / 2 + 0.02) - openAmount * maxSlide;
  rightCurtain.mesh.position.x = (CURTAIN_WIDTH / 2 + 0.02) + openAmount * maxSlide;

  // ── Lighting responds to energy ──
  // Main spotlight
  const flickerPhase = currentProgress < 0.1;
  if (flickerPhase) {
    const flicker = Math.sin(elapsed * 30) * Math.sin(elapsed * 47) * 0.3;
    mainSpot.intensity = 4.0 + currentProgress * 18 * (0.5 + flicker);
  } else {
    mainSpot.intensity = 4.5 + currentProgress * 5;
  }

  // Rim lights maintain strong baseline brightness for pillar visibility
  rimLeft.intensity = 4.5 + currentProgress * 3.0;
  rimRight.intensity = 4.5 + currentProgress * 3.0;

  // Volumetric light cone
  coneMat.opacity = currentProgress * 0.08;

  // ── Dust particles ──
  dustMat.opacity = currentProgress * 0.4;
  const positions = dustSystem.geometry.attributes.position.array;
  for (let i = 0; i < DUST_COUNT; i++) {
    positions[i * 3] += dustVelocities[i * 3];
    positions[i * 3 + 1] += dustVelocities[i * 3 + 1] + 0.0003;
    positions[i * 3 + 2] += dustVelocities[i * 3 + 2];

    // Wrap around
    if (positions[i * 3 + 1] > 7) positions[i * 3 + 1] = -1;
    if (Math.abs(positions[i * 3]) > 5) positions[i * 3] *= -0.9;
  }
  dustSystem.geometry.attributes.position.needsUpdate = true;

  // ── Confetti animation ──
  if (confettiActive) {
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const cd = confettiData[i];
      cd.pos.add(cd.vel);
      cd.vel.y -= 0.0002; // gravity
      cd.vel.y *= 0.999; // air resistance
      cd.rot.x += cd.rotSpeed.x;
      cd.rot.y += cd.rotSpeed.y;
      cd.rot.z += cd.rotSpeed.z;

      // Fluttering
      cd.vel.x += Math.sin(elapsed * 3 + i) * 0.0001;

      confettiDummy.position.copy(cd.pos);
      confettiDummy.rotation.copy(cd.rot);
      confettiDummy.scale.setScalar(cd.scale);
      confettiDummy.updateMatrix();
      confettiMesh.setMatrixAt(i, confettiDummy.matrix);
    }
    confettiMesh.instanceMatrix.needsUpdate = true;
  }

  // ── Audio drone modulation ──
  if (droneGain && currentProgress > 0.01 && !isRevealed) {
    droneGain.gain.value = Math.min(currentProgress * 0.08, 0.06);
  } else if (droneGain && isRevealed) {
    droneGain.gain.value *= 0.98; // Fade out drone after reveal
  }

  // ── Camera shake ──
  if (cameraShakeIntensity > 0.001) {
    camera.position.x = (Math.random() - 0.5) * cameraShakeIntensity;
    camera.position.y = 1.5 + (Math.random() - 0.5) * cameraShakeIntensity;
  } else {
    camera.position.x = 0;
    camera.position.y = 1.5;
  }

  // ── Gentle brochure glow pulsing ──
  if (glowMat.opacity > 0) {
    glowMat.opacity = 0.15 + Math.sin(elapsed * 2) * 0.1;
  }

  // ── Vignette time update ──
  vignettePass.uniforms.uTime.value = elapsed;

  // ── Render ──
  composer.render();
}

// ─── Resize Handler ──────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.resolution.set(w, h);
});

// ─── Initialize ──────────────────────────────────────────────────────────────

initSession();
animate();

// Initialize audio on any click/touch (required by browser autoplay policy)
document.addEventListener('click', initAudio, { once: true });
document.addEventListener('touchstart', initAudio, { once: true });
