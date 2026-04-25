import * as THREE from 'three';
import type { Vec2 } from './physics';

// ─── Config ─────────────────────────────────────────────────────────────────

const TRAIL_LENGTH  = 60;   // points per trail
const TRAIL_OFFSET  = 0.22; // lateral offset from spinner center (twin trails)
const SAMPLE_DIST   = 0.10; // min distance between recorded points
const TRAIL_Y       = 0.12; // height above floor
const TRAIL_WIDTH   = 0.12; // half-width of ribbon

// ─── Shaders ────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `
attribute float aProgress;   // 1.0 at head, 0.0 at tail
varying float vProgress;
void main() {
  vProgress   = aProgress;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3  uColor;
uniform float uAlpha;
varying float vProgress;
void main() {
  float fade = vProgress * vProgress * vProgress;          // cubic tail falloff
  vec3  col  = mix(uColor * 0.5, vec3(1.0), fade * 0.35); // white-hot at head
  gl_FragColor = vec4(col, fade * uAlpha);
}
`;

// ─── State ──────────────────────────────────────────────────────────────────

interface Trail {
  /** Center-line points (x,z pairs). Index 0 = head (newest). */
  cx: Float32Array;
  cz: Float32Array;
  /** GPU ribbon vertex buffer — 2 verts per center point (left, right). */
  positions: Float32Array;
  progress:  Float32Array;
  geometry:  THREE.BufferGeometry;
  material:  THREE.ShaderMaterial;
  pointCount: number;
  lastX: number;
  lastZ: number;
}

let trails: Trail[] = [];
let lastPerpX = 1;
let lastPerpZ = 0;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Rebuild the ribbon vertex positions from center-line points. */
function rebuildRibbon(trail: Trail): void {
  const n = trail.pointCount;
  if (n < 2) {
    trail.geometry.setDrawRange(0, 0);
    return;
  }

  const pos = trail.positions;
  const cx  = trail.cx;
  const cz  = trail.cz;
  const y   = TRAIL_Y;

  for (let i = 0; i < n; i++) {
    // Average the perpendiculars of the two adjacent segments so the
    // ribbon bends smoothly instead of producing Z-shaped corners.
    let px = 0, pz = 0;

    if (i > 0) {
      // Backward segment (toward head)
      const bx = cx[i - 1] - cx[i];
      const bz = cz[i - 1] - cz[i];
      const bl = Math.sqrt(bx * bx + bz * bz) || 1;
      px += -bz / bl;
      pz +=  bx / bl;
    }
    if (i < n - 1) {
      // Forward segment (toward tail)
      const fx = cx[i] - cx[i + 1];
      const fz = cz[i] - cz[i + 1];
      const fl = Math.sqrt(fx * fx + fz * fz) || 1;
      px += -fz / fl;
      pz +=  fx / fl;
    }

    // Normalise the averaged perpendicular
    const pl = Math.sqrt(px * px + pz * pz) || 1;
    px /= pl;
    pz /= pl;

    // Taper: full width at head, zero at tail
    const t = 1.0 - i / (n - 1);
    const w = TRAIL_WIDTH * t;

    const vi = i * 2 * 3; // 2 verts × 3 floats
    // Left vertex
    pos[vi]     = cx[i] + px * w;
    pos[vi + 1] = y;
    pos[vi + 2] = cz[i] + pz * w;
    // Right vertex
    pos[vi + 3] = cx[i] - px * w;
    pos[vi + 4] = y;
    pos[vi + 5] = cz[i] - pz * w;
  }

  trail.geometry.attributes.position.needsUpdate = true;
  // Triangle strip: 2 verts per point, n points → 2n verts
  trail.geometry.setDrawRange(0, n * 2);
}

// ─── Init ───────────────────────────────────────────────────────────────────

export function initTrails(scn: THREE.Scene, color: number = 0xe94560): void {
  const c = new THREE.Color(color);

  for (let t = 0; t < 2; t++) {
    const vertCount = TRAIL_LENGTH * 2; // left + right per point
    const positions = new Float32Array(vertCount * 3);
    const progress  = new Float32Array(vertCount);

    // Progress attribute: each center point has two verts with same progress
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const p = 1.0 - i / (TRAIL_LENGTH - 1);
      progress[i * 2]     = p;
      progress[i * 2 + 1] = p;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',  new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aProgress', new THREE.BufferAttribute(progress, 1));
    geometry.setDrawRange(0, 0);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Vector3(c.r, c.g, c.b) },
        uAlpha: { value: 0.0 },
      },
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
      side:           THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    scn.add(mesh);

    trails.push({
      cx: new Float32Array(TRAIL_LENGTH),
      cz: new Float32Array(TRAIL_LENGTH),
      positions, progress, geometry, material,
      pointCount: 0, lastX: 0, lastZ: 0,
    });
  }
}

// ─── Update (call once per frame) ───────────────────────────────────────────

export function updateTrails(pos: Vec2, vel: Vec2): void {
  const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);

  if (speed > 1.0) {
    lastPerpX = -vel.z / speed;
    lastPerpZ =  vel.x / speed;
  }

  const alpha   = Math.min(1.0, speed / 6.0);
  const offsets = [TRAIL_OFFSET, -TRAIL_OFFSET];

  for (let t = 0; t < trails.length; t++) {
    const trail = trails[t];
    const off   = offsets[t];

    const tx = pos.x + lastPerpX * off;
    const tz = pos.z + lastPerpZ * off;

    const dx = tx - trail.lastX;
    const dz = tz - trail.lastZ;
    if (dx * dx + dz * dz >= SAMPLE_DIST * SAMPLE_DIST || trail.pointCount === 0) {
      // Shift center-line arrays toward tail
      trail.cx.copyWithin(1, 0, TRAIL_LENGTH - 1);
      trail.cz.copyWithin(1, 0, TRAIL_LENGTH - 1);
      trail.cx[0] = tx;
      trail.cz[0] = tz;

      trail.lastX = tx;
      trail.lastZ = tz;
      trail.pointCount = Math.min(trail.pointCount + 1, TRAIL_LENGTH);

      rebuildRibbon(trail);
    }

    trail.material.uniforms.uAlpha.value = alpha;
  }
}

// ─── Reset ──────────────────────────────────────────────────────────────────

export function resetTrails(): void {
  for (const trail of trails) {
    trail.cx.fill(0);
    trail.cz.fill(0);
    trail.positions.fill(0);
    trail.pointCount = 0;
    trail.lastX = 0;
    trail.lastZ = 0;
    trail.geometry.attributes.position.needsUpdate = true;
    trail.geometry.setDrawRange(0, 0);
    trail.material.uniforms.uAlpha.value = 0;
  }
  lastPerpX = 1;
  lastPerpZ = 0;
}
