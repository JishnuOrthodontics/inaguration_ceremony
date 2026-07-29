/**
 * Optional 3D visuals for the controller.
 * Taps + Socket.io live in controller-core.js (classic script).
 * If this module fails on a phone, tapping still works.
 */
import * as THREE from 'three';

const STAR_COUNT = 400;
const BURST_PARTICLE_COUNT = 30;

let progress = 0;
let targetProgress = 0;
let crystalPulseScale = 1.0;
let coreFlashIntensity = 0;
let tiltX = 0;
let tiltY = 0;

const canvas = document.getElementById('controller-canvas');
if (!canvas) throw new Error('No canvas');

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

scene.add(new THREE.AmbientLight(0x4080c0, 0.5));

const keyLight = new THREE.PointLight(0x00A3D9, 2.5, 10);
keyLight.position.set(2, 3, 4);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0x003B8E, 1.5, 10);
fillLight.position.set(-2, -1, 3);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0x66ccff, 0.8, 8);
rimLight.position.set(0, -2, -2);
scene.add(rimLight);

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
  opacity: 0.95
});
const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 2), crystalMat);
scene.add(crystal);

const coreMat = new THREE.MeshBasicMaterial({
  color: 0x00A3D9,
  transparent: true,
  opacity: 0.7,
  blending: THREE.AdditiveBlending
});
const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 1), coreMat);
scene.add(core);

const glowMat = new THREE.MeshBasicMaterial({
  color: 0x4422cc,
  transparent: true,
  opacity: 0.05,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide
});
const glowShell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), glowMat);
scene.add(glowShell);

const ringMat = new THREE.MeshBasicMaterial({
  color: 0x6644cc,
  transparent: true,
  opacity: 0.2,
  blending: THREE.AdditiveBlending
});
const tapRing = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.03, 8, 64), ringMat);
tapRing.position.y = -1.5;
tapRing.rotation.x = Math.PI / 2;
scene.add(tapRing);

const starsGeo = new THREE.BufferGeometry();
const starsPositions = new Float32Array(STAR_COUNT * 3);
for (let i = 0; i < STAR_COUNT; i++) {
  starsPositions[i * 3] = (Math.random() - 0.5) * 40;
  starsPositions[i * 3 + 1] = (Math.random() - 0.5) * 40;
  starsPositions[i * 3 + 2] = -Math.random() * 30 - 5;
}
starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({
  color: 0x8866ff,
  size: 0.06,
  transparent: true,
  opacity: 0.6,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true
})));

const shockwavePool = [];
for (let i = 0; i < 5; i++) {
  const sw = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.02, 4, 32),
    new THREE.MeshBasicMaterial({
      color: 0xaa77ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending
    })
  );
  sw.userData = { active: false, life: 0 };
  scene.add(sw);
  shockwavePool.push(sw);
}

function spawnShockwave() {
  const sw = shockwavePool.find((s) => !s.userData.active);
  if (!sw) return;
  sw.userData.active = true;
  sw.userData.life = 1.0;
  sw.scale.setScalar(1);
  sw.material.opacity = 0.6;
  sw.position.set(0, 0, 0);
}

const burstParticles = [];
function spawnBurstParticles() {
  for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
    let particle = burstParticles.find((p) => !p.userData.active);
    if (!particle) {
      particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 4, 4),
        new THREE.MeshBasicMaterial({
          color: 0xaa77ff,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending
        })
      );
      particle.userData = { active: false, velocity: new THREE.Vector3(), life: 0 };
      scene.add(particle);
      burstParticles.push(particle);
    }
    particle.userData.active = true;
    particle.userData.life = 1.0;
    particle.position.set(0, 0, 0);
    particle.material.opacity = 1;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const speed = 0.05 + Math.random() * 0.08;
    particle.userData.velocity.set(
      Math.sin(phi) * Math.cos(theta) * speed,
      Math.sin(phi) * Math.sin(theta) * speed,
      Math.cos(phi) * speed
    );
    const hue = 0.7 - progress * 0.55;
    particle.material.color.setHSL(hue, 0.8, 0.6);
  }
}

window.addEventListener('inaug:tap', () => {
  crystalPulseScale = 1.25;
  coreFlashIntensity = 1.0;
  spawnShockwave();
  spawnBurstParticles();
});

window.addEventListener('inaug:progress', (e) => {
  targetProgress = e.detail?.progress ?? targetProgress;
});

window.addEventListener('inaug:reset', () => {
  targetProgress = 0;
  progress = 0;
});

window.addEventListener('deviceorientation', (e) => {
  if (e.gamma != null) {
    tiltX = (e.gamma / 90) * 0.5;
    tiltY = ((e.beta - 45) / 90) * 0.3;
  }
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  if (window.InaugController) {
    targetProgress = window.InaugController.targetProgress ?? targetProgress;
  }
  progress += (targetProgress - progress) * 0.08;

  crystal.rotation.y += dt * 0.4;
  crystal.rotation.x = Math.sin(elapsed * 0.5) * 0.1;
  core.rotation.y -= dt * 0.6;
  core.rotation.z += dt * 0.3;
  glowShell.rotation.y += dt * 0.2;

  crystalPulseScale += (1.0 - crystalPulseScale) * 0.12;
  crystal.scale.setScalar(crystalPulseScale);
  glowShell.scale.setScalar(crystalPulseScale * 1.3);

  const hue = 0.7 - progress * 0.55;
  const saturation = 0.7 + progress * 0.3;
  const lightness = 0.3 + progress * 0.2;
  crystalMat.color.setHSL(hue, saturation, lightness);
  crystalMat.emissive.setHSL(hue, saturation, lightness * 0.5);
  crystalMat.emissiveIntensity = 0.3 + progress * 0.7;
  coreMat.color.setHSL(hue, 0.9, 0.5 + progress * 0.3);
  coreMat.opacity = 0.4 + progress * 0.4;

  if (coreFlashIntensity > 0.01) {
    coreFlashIntensity *= 0.9;
    core.scale.setScalar(0.4 + coreFlashIntensity * 0.3);
  } else {
    core.scale.setScalar(0.4 + Math.sin(elapsed * 2) * 0.05);
  }

  glowMat.color.setHSL(hue, 0.5, 0.5);
  glowMat.opacity = 0.03 + progress * 0.08 + Math.sin(elapsed * 1.5) * 0.02;
  tapRing.scale.setScalar(1 + Math.sin(elapsed * 2) * 0.05);
  ringMat.opacity = 0.1 + Math.sin(elapsed * 2) * 0.05;
  ringMat.color.setHSL(hue, 0.7, 0.5);

  for (const sw of shockwavePool) {
    if (!sw.userData.active) continue;
    sw.userData.life -= dt * 1.5;
    sw.scale.setScalar(1 + (1 - sw.userData.life) * 4);
    sw.material.opacity = sw.userData.life * 0.6;
    if (sw.userData.life <= 0) {
      sw.userData.active = false;
      sw.material.opacity = 0;
    }
  }

  for (const p of burstParticles) {
    if (!p.userData.active) continue;
    p.userData.life -= dt * 1.8;
    p.position.add(p.userData.velocity);
    p.userData.velocity.multiplyScalar(0.96);
    p.material.opacity = p.userData.life;
    p.scale.setScalar(p.userData.life);
    if (p.userData.life <= 0) p.userData.active = false;
  }

  camera.position.x += (tiltX - camera.position.x) * 0.05;
  camera.position.y += (tiltY - camera.position.y) * 0.05;
  camera.lookAt(0, 0, 0);

  keyLight.intensity = 2.0 + progress * 2.0 + Math.sin(elapsed * 3) * 0.3;
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

animate();
document.body.classList.add('has-3d');
