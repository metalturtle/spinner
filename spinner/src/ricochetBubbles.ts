import * as THREE from 'three';
import { scene } from './renderer';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_BUBBLES = 90;

// ─── Shaders ─────────────────────────────────────────────────────────────────

const BUBBLE_VERT = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vWorldPos;

void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const BUBBLE_FRAG = /* glsl */ `
uniform vec3  uColor;
uniform float uLife;
uniform float uAlpha;

varying vec3 vNormalW;
varying vec3 vWorldPos;

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float rim = 1.0 - abs(dot(normalize(vNormalW), viewDir));
  rim = pow(rim, 2.4);

  float pulse = 1.0 - smoothstep(0.55, 1.0, uLife);
  float fade = 1.0 - smoothstep(0.65, 1.0, uLife);
  float edge = smoothstep(0.08, 0.55, rim);
  float alpha = edge * pulse * fade * uAlpha;

  vec3 col = mix(uColor * 0.35, vec3(1.0, 0.18, 0.04), edge);
  gl_FragColor = vec4(col, alpha);
}
`;

// ─── State ───────────────────────────────────────────────────────────────────

interface RicochetBubble {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  elapsed: number;
  duration: number;
  startRadius: number;
  endRadius: number;
  velocity: THREE.Vector3;
}

const sharedGeo = new THREE.SphereGeometry(1, 18, 12);
const bubbles: RicochetBubble[] = [];

type BubbleConfig = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  duration: number;
  startRadius: number;
  endRadius: number;
  alpha: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Vector3(1.0, 0.04, 0.0) },
      uLife:  { value: 0 },
      uAlpha: { value: 0.85 },
    },
    vertexShader:   BUBBLE_VERT,
    fragmentShader: BUBBLE_FRAG,
    transparent:    true,
    depthWrite:     false,
    blending:       THREE.AdditiveBlending,
    side:           THREE.DoubleSide,
  });
}

function removeBubble(index: number): void {
  const bubble = bubbles[index];
  scene.remove(bubble.mesh);
  bubble.material.dispose();
  bubbles.splice(index, 1);
}

function spawnBubble(config: BubbleConfig): void {
  if (bubbles.length >= MAX_BUBBLES) removeBubble(0);

  const material = makeMaterial();
  material.uniforms.uAlpha.value = config.alpha;

  const mesh = new THREE.Mesh(sharedGeo, material);
  mesh.frustumCulled = false;
  mesh.position.copy(config.position);
  mesh.scale.setScalar(config.startRadius);
  scene.add(mesh);

  bubbles.push({
    mesh,
    material,
    elapsed: 0,
    duration: config.duration,
    startRadius: config.startRadius,
    endRadius: config.endRadius,
    velocity: config.velocity,
  });
}

// ─── Emit ────────────────────────────────────────────────────────────────────

export function emitRicochetBubbles(
  point:     { x: number; y: number; z: number },
  normal:    { x: number; y: number; z: number },
  intensity: number = 1,
): void {
  const count = 2 + Math.floor(Math.random() * 3);
  const normalLen = Math.hypot(normal.x, normal.z) || 1;
  const nx = normal.x / normalLen;
  const nz = normal.z / normalLen;
  const tx = -nz;
  const tz = nx;

  spawnBubble({
    position: new THREE.Vector3(point.x, point.y + 0.04, point.z),
    velocity: new THREE.Vector3(nx * 0.35, 0.05, nz * 0.35),
    duration: 0.2,
    startRadius: 0.08,
    endRadius: 0.55,
    alpha: 0.95,
  });

  for (let i = 0; i < count; i++) {
    const spread = (Math.random() - 0.5) * Math.PI * 0.85;
    const cosS = Math.cos(spread);
    const sinS = Math.sin(spread);
    const dirX = nx * cosS + tx * sinS;
    const dirZ = nz * cosS + tz * sinS;
    const speed = (1.4 + Math.random() * 2.8) * intensity;

    spawnBubble({
      position: new THREE.Vector3(
        point.x + (Math.random() - 0.5) * 0.05,
        point.y + 0.03 + Math.random() * 0.06,
        point.z + (Math.random() - 0.5) * 0.05,
      ),
      velocity: new THREE.Vector3(
        dirX * speed,
        0.1 + Math.random() * 0.35,
        dirZ * speed,
      ),
      duration: 0.16 + Math.random() * 0.18,
      startRadius: 0.035 + Math.random() * 0.035,
      endRadius: 0.18 + Math.random() * 0.2,
      alpha: 0.72,
    });
  }
}

// ─── Update ──────────────────────────────────────────────────────────────────

export function updateRicochetBubbles(delta: number): void {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const bubble = bubbles[i];
    bubble.elapsed += delta;
    const t = bubble.elapsed / bubble.duration;

    if (t >= 1) {
      removeBubble(i);
      continue;
    }

    const eased = 1 - Math.pow(1 - t, 2.4);
    const radius = THREE.MathUtils.lerp(bubble.startRadius, bubble.endRadius, eased);
    bubble.mesh.scale.setScalar(radius);
    bubble.mesh.position.addScaledVector(bubble.velocity, delta);
    bubble.material.uniforms.uLife.value = t;
    bubble.material.uniforms.uAlpha.value = 0.85 * (1 - t);
  }
}

// ─── Reset ───────────────────────────────────────────────────────────────────

export function resetRicochetBubbles(): void {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    removeBubble(i);
  }
}
