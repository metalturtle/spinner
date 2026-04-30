import * as THREE from 'three';

export const scene = new THREE.Scene();
scene.background = null;

const MAX_RENDER_PIXEL_RATIO = 1.25;
const SHADOW_MAP_SIZE = 1024;

function getRenderPixelRatio(): number {
  return Math.min(window.devicePixelRatio, MAX_RENDER_PIXEL_RATIO);
}

export const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
// Initial position set by camera.ts initCamera()

export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(getRenderPixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const container = document.getElementById('canvas-container')!;
container.appendChild(renderer.domElement);

// ─── Lights ──────────────────────────────────────────────────────────────────

const ambientLight = new THREE.AmbientLight(0xffffff, 0.00);
scene.add(ambientLight);
//0xffffff
//0x111111
const dirLight = new THREE.DirectionalLight(0xcccccc, 1.2);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = SHADOW_MAP_SIZE;
dirLight.shadow.mapSize.height = SHADOW_MAP_SIZE;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 100;
dirLight.shadow.camera.left = -25;
dirLight.shadow.camera.right = 25;
dirLight.shadow.camera.top = 25;
dirLight.shadow.camera.bottom = -25;
scene.add(dirLight);

// ─── Resize ──────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(getRenderPixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
});
