import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import vertexShader from './shaders/water.vert.glsl?raw';
import fragmentShader from './shaders/water.frag.glsl?raw';

const container = document.getElementById('app')!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1318);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.05,
  100,
);
camera.position.set(0, 1.7, 4);
camera.lookAt(0, 0, 0);

// ---- textures
function createNoiseTexture(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256);
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const loader = new THREE.TextureLoader();
function loadImage(url: string): THREE.Texture {
  const tex = loader.load(url);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

// ---- click ripple ring buffer (positions in shader-uv space, z = spawn time)
const MAX_CLICKS = 8;
const clicks: THREE.Vector3[] = Array.from(
  { length: MAX_CLICKS },
  () => new THREE.Vector3(0, 0, -1000),
);
let clickIndex = 0;

// ---- the single water quad
const quadW = 8;
const quadH = 4;
const quadAspect = quadW / quadH;

const geometry = new THREE.PlaneGeometry(quadW, quadH);
geometry.rotateX(-Math.PI / 2); // lay flat in xz, normal +y

const uniforms = {
  iTime: { value: 0 },
  iChannel0: { value: loadImage('/img2.png') },
  iChannel1: { value: createNoiseTexture() },
  iChannel2: { value: loadImage('/img1.png') },
  uClicks: { value: clicks },
  uAspect: { value: quadAspect },
  uCameraPos: { value: new THREE.Vector3() },
};

const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader,
  fragmentShader,
  side: THREE.DoubleSide,
});

const quad = new THREE.Mesh(geometry, material);
scene.add(quad);

// ---- FPS controls
const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.object);

const overlay = document.getElementById('overlay');
const crosshair = document.getElementById('crosshair');

function tryLock() {
  if (!controls.isLocked) controls.lock();
}
renderer.domElement.addEventListener('click', tryLock);
overlay?.addEventListener('click', tryLock);

controls.addEventListener('lock', () => {
  if (overlay) overlay.style.display = 'none';
  if (crosshair) crosshair.style.display = 'block';
});
controls.addEventListener('unlock', () => {
  if (overlay) overlay.style.display = 'flex';
  if (crosshair) crosshair.style.display = 'none';
});

const move = { fwd: 0, right: 0, up: 0 };
let sprint = false;
const walkSpeed = 4;     // m/s
const sprintMul = 2.5;

window.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'KeyW': move.fwd = 1; break;
    case 'KeyS': move.fwd = -1; break;
    case 'KeyA': move.right = -1; break;
    case 'KeyD': move.right = 1; break;
    case 'Space': move.up = 1; break;
    case 'ControlLeft': move.up = -1; break;
    case 'ShiftLeft': sprint = true; break;
  }
});
window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW':
    case 'KeyS': move.fwd = 0; break;
    case 'KeyA':
    case 'KeyD': move.right = 0; break;
    case 'Space':
    case 'ControlLeft': move.up = 0; break;
    case 'ShiftLeft': sprint = false; break;
  }
});

// ---- click → raycast at screen center → ripple at hit uv
const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);
const clock = new THREE.Clock();

function spawnRipple(uvX: number, uvY: number) {
  // convert geometry uv (0..1) into the shader-uv mapping (uv.x*aspect, 1-uv.y)
  const su = uvX * quadAspect;
  const sv = 1 - uvY;
  clicks[clickIndex].set(su, sv, clock.getElapsedTime());
  clickIndex = (clickIndex + 1) % MAX_CLICKS;
}

renderer.domElement.addEventListener('mousedown', (e) => {
  if (!controls.isLocked || e.button !== 0) return;
  raycaster.setFromCamera(screenCenter, camera);
  const hits = raycaster.intersectObject(quad);
  if (hits.length > 0 && hits[0].uv) {
    spawnRipple(hits[0].uv.x, hits[0].uv.y);
  }
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  uniforms.iTime.value = clock.getElapsedTime();
  uniforms.uCameraPos.value.copy(camera.position);

  if (controls.isLocked) {
    const v = (sprint ? sprintMul : 1) * walkSpeed * dt;
    if (move.fwd) controls.moveForward(move.fwd * v);
    if (move.right) controls.moveRight(move.right * v);
    if (move.up) camera.position.y += move.up * v;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
