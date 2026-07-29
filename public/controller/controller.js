/**
 * ══════════════════════════════════════════════════════════════════
 * MOBILE CONTROLLER — The Magic Wand
 * ══════════════════════════════════════════════════════════════════
 * 
 * A tactile 3D experience with an energy crystal that responds
 * to taps with particles, shockwaves, and haptic feedback.
 */

import * as THREE from 'three';

// ─── Constants ───────────────────────────────────────────────────────────────

const STAR_COUNT = 400;
const BURST_PARTICLE_COUNT = 30;
const CIRCUMFERENCE = 2 * Math.PI * 90; // SVG progress ring circumference

// ─── State ───────────────────────────────────────────────────────────────────

let progress = 0;
let targetProgress = 0;
let tapCount = 0;
let targetTaps = 50;
let isRevealed = false;
let consecutiveTaps = 0;
let lastTapTime = 0;
let hasStartedTapping = false;

// ─── Get Room ID from URL ────────────────────────────────────────────────────

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');

if (!roomId) {
  document.getElementById('status-text').textContent = 'Error: No room ID provided';
  document.getElementById('status-text').style.color = '#ff4444';
}

// ─── Three.js Setup ──────────────────────────────────────────────────────────

const canvas = document.getElementById('controller-canvas');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 4);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

// ─── Lighting ────────────────────────────────────────────────────────────────

const ambientLight = new THREE.AmbientLight(0x4080c0, 0.5);
scene.add(ambientLight);

const keyLight = new THREE.PointLight(0x00A3D9, 2.5, 10);
keyLight.position.set(2, 3, 4);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0x003B8E, 1.5, 10);
fillLight.position.set(-2, -1, 3);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0x66ccff, 0.8, 8);
rimLight.position.set(0, -2, -2);
scene.add(rimLight);

// ─── Energy Crystal ──────────────────────────────────────────────────────────

const crystalGeo = new THREE.IcosahedronGeometry(1.0, 2);
const crystalMat = new THREE.MeshPhysicalMaterial({
  color: 0x003B8E,
  metalness: 0.1,
  roughness: 0.05,
  transmission: 0.85,
  thickness: 1.2,
  ior: 1.8,
  emissive: 0x001a4d,
  emissiveIntensity: 0.4,
  transparent: true,
  opacity: 0.95,
  envMapIntensity: 1.0
});
const crystal = new THREE.Mesh(crystalGeo, crystalMat);
crystal.castShadow = true;
scene.add(crystal);

// Inner crystal glow core
const coreGeo = new THREE.IcosahedronGeometry(0.4, 1);
const coreMat = new THREE.MeshBasicMaterial({
  color: 0x00A3D9,
  transparent: true,
  opacity: 0.7,
  blending: THREE.AdditiveBlending
});
const core = new THREE.Mesh(coreGeo, coreMat);
scene.add(core);

// Outer glow shell
const glowGeo = new THREE.IcosahedronGeometry(1.3, 1);
const glowMat = new THREE.MeshBasicMaterial({
  color: 0x4422cc,
  transparent: true,
  opacity: 0.05,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide
});
const glowShell = new THREE.Mesh(glowGeo, glowMat);
scene.add(glowShell);

// ─── Tap Ring (at bottom) ────────────────────────────────────────────────────

const ringGeo = new THREE.TorusGeometry(1.4, 0.03, 8, 64);
const ringMat = new THREE.MeshBasicMaterial({
  color: 0x6644cc,
  transparent: true,
  opacity: 0.2,
  blending: THREE.AdditiveBlending
});
const tapRing = new THREE.Mesh(ringGeo, ringMat);
tapRing.position.y = -1.5;
tapRing.rotation.x = Math.PI / 2;
scene.add(tapRing);

// ─── Starfield Background ───────────────────────────────────────────────────

const starsGeo = new THREE.BufferGeometry();
const starsPositions = new Float32Array(STAR_COUNT * 3);
const starsSizes = new Float32Array(STAR_COUNT);

for (let i = 0; i < STAR_COUNT; i++) {
  starsPositions[i * 3] = (Math.random() - 0.5) * 40;
  starsPositions[i * 3 + 1] = (Math.random() - 0.5) * 40;
  starsPositions[i * 3 + 2] = -Math.random() * 30 - 5;
  starsSizes[i] = Math.random() * 2 + 0.5;
}

starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
starsGeo.setAttribute('size', new THREE.BufferAttribute(starsSizes, 1));

const starsMat = new THREE.PointsMaterial({
  color: 0x8866ff,
  size: 0.06,
  transparent: true,
  opacity: 0.6,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true
});

const stars = new THREE.Points(starsGeo, starsMat);
scene.add(stars);

// ─── Shockwave Rings (reusable pool) ─────────────────────────────────────────

const shockwavePool = [];
const SHOCKWAVE_POOL_SIZE = 5;

for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
  const swGeo = new THREE.TorusGeometry(0.3, 0.02, 4, 32);
  const swMat = new THREE.MeshBasicMaterial({
    color: 0xaa77ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending
  });
  const sw = new THREE.Mesh(swGeo, swMat);
  sw.userData = { active: false, life: 0 };
  scene.add(sw);
  shockwavePool.push(sw);
}

function spawnShockwave() {
  const sw = shockwavePool.find(s => !s.userData.active);
  if (!sw) return;
  sw.userData.active = true;
  sw.userData.life = 1.0;
  sw.scale.setScalar(1);
  sw.material.opacity = 0.6;
  sw.position.set(0, 0, 0);
  sw.rotation.set(
    (Math.random() - 0.5) * 0.5,
    (Math.random() - 0.5) * 0.5,
    0
  );
}

// ─── Burst Particles (reusable pool) ─────────────────────────────────────────

const burstParticles = [];

function spawnBurstParticles() {
  for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
    let particle = burstParticles.find(p => !p.userData.active);

    if (!particle) {
      const geo = new THREE.SphereGeometry(0.04, 4, 4);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xaa77ff,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending
      });
      particle = new THREE.Mesh(geo, mat);
      particle.userData = { active: false, velocity: new THREE.Vector3(), life: 0 };
      scene.add(particle);
      burstParticles.push(particle);
    }

    particle.userData.active = true;
    particle.userData.life = 1.0;
    particle.position.set(0, 0, 0);
    particle.material.opacity = 1;
    particle.scale.setScalar(1);

    // Random direction burst
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const speed = 0.05 + Math.random() * 0.08;
    particle.userData.velocity.set(
      Math.sin(phi) * Math.cos(theta) * speed,
      Math.sin(phi) * Math.sin(theta) * speed,
      Math.cos(phi) * speed
    );

    // Color based on progress
    const hue = 0.7 - progress * 0.55; // Blue → Gold
    particle.material.color.setHSL(hue, 0.8, 0.6);
  }
}

// ─── Audio System (Web Audio API) ────────────────────────────────────────────

let audioCtx = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playTapSound() {
  if (!audioCtx) return;

  const now = audioCtx.currentTime;

  // Rising pitch chime based on consecutive taps
  const baseFreq = 400 + consecutiveTaps * 30 + progress * 600;
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(baseFreq, now);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.08);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.2);

  // Second harmonic
  const osc2 = audioCtx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.value = baseFreq * 2;

  const gain2 = audioCtx.createGain();
  gain2.gain.setValueAtTime(0.05, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  osc2.connect(gain2);
  gain2.connect(audioCtx.destination);
  osc2.start(now);
  osc2.stop(now + 0.15);
}

function playRevealSound() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  // Ascending shimmer
  for (let i = 0; i < 5; i++) {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 600 + i * 200;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, now + i * 0.1);
    gain.gain.linearRampToValueAtTime(0.08, now + i * 0.1 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.8);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now + i * 0.1);
    osc.stop(now + i * 0.1 + 0.8);
  }
}

// ─── Socket.io Connection ────────────────────────────────────────────────────

const socket = io();

if (roomId) {
  socket.emit('join-session', roomId);
}

// Handle energy updates
socket.on('energy-update', (data) => {
  targetProgress = data.progress;
  tapCount = data.tapCount;
  updateProgressUI(data.progress, data.tapCount);
});

// Handle state sync (on join)
socket.on('state-update', (data) => {
  targetProgress = data.progress;
  tapCount = data.tapCount || 0;
  targetTaps = data.targetTaps || 50;
  isRevealed = data.isRevealed;

  updateProgressUI(data.progress, tapCount);

  if (isRevealed) {
    showRevealedScreen();
  }
});

// Handle reveal
socket.on('revealed', () => {
  isRevealed = true;
  playRevealSound();
  // Delay showing revealed screen for crystal explosion animation
  setTimeout(showRevealedScreen, 2000);
});

// Handle reset
socket.on('reset', () => {
  isRevealed = false;
  targetProgress = 0;
  progress = 0;
  tapCount = 0;
  consecutiveTaps = 0;
  hasStartedTapping = false;

  updateProgressUI(0, 0);

  document.getElementById('revealed-screen').classList.add('hidden');
  document.getElementById('tap-prompt').classList.remove('hidden');
  document.getElementById('status-text').textContent = 'Tap anywhere to charge';
});

// Handle errors
socket.on('error', (data) => {
  document.getElementById('status-text').textContent = data.message;
  document.getElementById('status-text').style.color = '#ff4444';
});

// ─── UI Updates ──────────────────────────────────────────────────────────────

// Add SVG gradient definition
const svg = document.querySelector('.progress-ring');
const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
grad.setAttribute('id', 'progressGradient');
grad.setAttribute('x1', '0%');
grad.setAttribute('y1', '0%');
grad.setAttribute('x2', '100%');
grad.setAttribute('y2', '100%');

const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
stop1.setAttribute('offset', '0%');
stop1.setAttribute('stop-color', '#003B8E');
const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
stop2.setAttribute('offset', '50%');
stop2.setAttribute('stop-color', '#00A3D9');
const stop3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
stop3.setAttribute('offset', '100%');
stop3.setAttribute('stop-color', '#66ccff');

grad.appendChild(stop1);
grad.appendChild(stop2);
grad.appendChild(stop3);
defs.appendChild(grad);
svg.insertBefore(defs, svg.firstChild);

function updateProgressUI(prog, count) {
  // Progress ring
  const circle = document.getElementById('progress-circle');
  const offset = CIRCUMFERENCE * (1 - prog);
  circle.style.strokeDashoffset = Math.max(0, offset);

  // Percentage text
  document.getElementById('progress-percent').textContent = Math.round(prog * 100);

  // Tap count
  document.getElementById('tap-count').textContent = `${count} / ${targetTaps}`;

  // Status text
  if (prog < 0.1) {
    document.getElementById('status-text').textContent = 'Tap anywhere to charge';
  } else if (prog < 0.5) {
    document.getElementById('status-text').textContent = 'Charging the Inauguration...';
  } else if (prog < 0.9) {
    document.getElementById('status-text').textContent = 'Almost there! Keep tapping!';
  } else if (prog < 1) {
    document.getElementById('status-text').textContent = '🔥 Final push!';
  }
}

function showRevealedScreen() {
  document.getElementById('revealed-screen').classList.remove('hidden');
}

// ─── Tap Handling ────────────────────────────────────────────────────────────

let lastTapEmitAt = 0;

function handleTap(event) {
  if (isRevealed) return;
  if (!roomId) return;

  // Ignore non-primary mouse/pen buttons
  if (typeof event.button === 'number' && event.button !== 0) return;

  // Deduplicate: some browsers fire both pointerdown and touchstart
  const now = Date.now();
  if (now - lastTapEmitAt < 50) return;
  lastTapEmitAt = now;

  if (event.cancelable) event.preventDefault();

  // Initialize audio on first tap (browser policy)
  initAudio();

  // Track consecutive taps (reset if gap > 500ms)
  if (now - lastTapTime > 500) {
    consecutiveTaps = 0;
  }
  consecutiveTaps++;
  lastTapTime = now;

  if (!hasStartedTapping) {
    hasStartedTapping = true;
    document.getElementById('tap-prompt').classList.add('hidden');
  }

  // Emit tap to server
  socket.emit('tap');

  // ── Visual Feedback ──

  // 1. Crystal pulse (scale up and back)
  crystalPulseScale = 1.25;

  // 2. Shockwave ring
  spawnShockwave();

  // 3. Particle burst
  spawnBurstParticles();

  // 4. Haptic feedback
  if (navigator.vibrate) {
    navigator.vibrate(10);
  }

  // 5. Tap sound
  playTapSound();

  // 6. Screen ripple effect
  const point = event.touches?.[0] || event.changedTouches?.[0] || event;
  const rippleX = point.clientX ?? window.innerWidth / 2;
  const rippleY = point.clientY ?? window.innerHeight / 2;

  const ripple = document.createElement('div');
  ripple.className = 'tap-ripple';
  ripple.style.left = `${rippleX}px`;
  ripple.style.top = `${rippleY}px`;

  // Color based on progress
  const hue = 270 - progress * 180;
  ripple.style.borderColor = `hsl(${hue}, 70%, 60%)`;

  document.body.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);

  // 7. Flash the core
  coreFlashIntensity = 1.0;
}

// Pointer events cover mouse + touch + pen on modern mobile browsers.
// touchstart kept as fallback for older WebViews without PointerEvent.
function onPointerDown(e) {
  handleTap(e);
}

function onTouchStart(e) {
  if (window.PointerEvent) return; // already handled via pointerdown
  handleTap(e);
}

window.addEventListener('pointerdown', onPointerDown, { passive: false });
window.addEventListener('touchstart', onTouchStart, { passive: false });
// Extra canvas binding — some mobile WebViews don't bubble canvas touches reliably
canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
canvas.addEventListener('touchstart', onTouchStart, { passive: false });

let crystalPulseScale = 1.0;
let coreFlashIntensity = 0;

// ─── Device Orientation (tilt camera) ────────────────────────────────────────

let tiltX = 0;
let tiltY = 0;

window.addEventListener('deviceorientation', (e) => {
  if (e.gamma != null) {
    tiltX = (e.gamma / 90) * 0.5; // Left/right tilt
    tiltY = ((e.beta - 45) / 90) * 0.3; // Front/back tilt (offset for holding angle)
  }
});

// ─── Animation Loop ──────────────────────────────────────────────────────────

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // ── Smooth progress interpolation ──
  progress += (targetProgress - progress) * 0.08;

  // ── Crystal rotation ──
  crystal.rotation.y += dt * 0.4;
  crystal.rotation.x = Math.sin(elapsed * 0.5) * 0.1;
  core.rotation.y -= dt * 0.6;
  core.rotation.z += dt * 0.3;
  glowShell.rotation.y += dt * 0.2;

  // ── Crystal pulse animation ──
  crystalPulseScale += (1.0 - crystalPulseScale) * 0.12;
  crystal.scale.setScalar(crystalPulseScale);
  glowShell.scale.setScalar(crystalPulseScale * 1.3);

  // ── Crystal color shift based on progress ──
  // Deep blue (0%) → Purple (50%) → Gold (100%)
  const hue = 0.7 - progress * 0.55; // 0.7 (blue) → 0.15 (gold)
  const saturation = 0.7 + progress * 0.3;
  const lightness = 0.3 + progress * 0.2;

  crystalMat.color.setHSL(hue, saturation, lightness);
  crystalMat.emissive.setHSL(hue, saturation, lightness * 0.5);
  crystalMat.emissiveIntensity = 0.3 + progress * 0.7;

  // Core glow
  coreMat.color.setHSL(hue, 0.9, 0.5 + progress * 0.3);
  coreMat.opacity = 0.4 + progress * 0.4;

  // Core flash on tap
  if (coreFlashIntensity > 0.01) {
    coreFlashIntensity *= 0.9;
    core.scale.setScalar(0.4 + coreFlashIntensity * 0.3);
    coreMat.opacity = Math.min(1, coreMat.opacity + coreFlashIntensity * 0.5);
  } else {
    core.scale.setScalar(0.4 + Math.sin(elapsed * 2) * 0.05);
  }

  // Outer glow shell
  glowMat.color.setHSL(hue, 0.5, 0.5);
  glowMat.opacity = 0.03 + progress * 0.08 + Math.sin(elapsed * 1.5) * 0.02;

  // ── Tap ring pulse ──
  tapRing.scale.setScalar(1 + Math.sin(elapsed * 2) * 0.05);
  ringMat.opacity = 0.1 + Math.sin(elapsed * 2) * 0.05;
  ringMat.color.setHSL(hue, 0.6, 0.5);

  // ── Key light responds to progress ──
  keyLight.intensity = 2 + progress * 3;
  keyLight.color.setHSL(hue, 0.6, 0.5);

  // ── Shockwave updates ──
  for (const sw of shockwavePool) {
    if (!sw.userData.active) continue;
    sw.userData.life -= dt * 2;
    if (sw.userData.life <= 0) {
      sw.userData.active = false;
      sw.material.opacity = 0;
      continue;
    }
    const t = 1 - sw.userData.life;
    sw.scale.setScalar(1 + t * 3);
    sw.material.opacity = sw.userData.life * 0.5;
  }

  // ── Burst particle updates ──
  for (const p of burstParticles) {
    if (!p.userData.active) continue;
    p.userData.life -= dt * 2;
    if (p.userData.life <= 0) {
      p.userData.active = false;
      p.material.opacity = 0;
      continue;
    }
    p.position.add(p.userData.velocity);
    p.userData.velocity.multiplyScalar(0.96); // drag
    p.material.opacity = p.userData.life;
    p.scale.setScalar(p.userData.life);
  }

  // ── Stars gentle drift ──
  stars.rotation.y += dt * 0.02;
  stars.rotation.x += dt * 0.005;

  // ── Device orientation camera tilt ──
  camera.position.x += (tiltX - camera.position.x) * 0.05;
  camera.position.y += (tiltY - camera.position.y) * 0.05;
  camera.lookAt(0, 0, 0);

  // ── Crystal explode on reveal ──
  if (isRevealed) {
    crystal.scale.multiplyScalar(1.02);
    crystalMat.opacity *= 0.97;
    coreMat.opacity = Math.min(1, coreMat.opacity + 0.02);
    glowMat.opacity = Math.min(0.5, glowMat.opacity + 0.005);
    core.scale.multiplyScalar(1.015);
  }

  renderer.render(scene, camera);
}

// ─── Resize Handler ──────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// ─── Initialize ──────────────────────────────────────────────────────────────

animate();
