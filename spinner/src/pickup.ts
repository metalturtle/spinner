import * as THREE from 'three';
import { scene } from './renderer';
import type { Vec2 } from './physics';
import { registerProximityBody, deregisterProximityBody, type ProximityBody } from './systems';

// ─── Shaders ────────────────────────────────────────────────────────────────

const ORBIT_TRAIL_VERT = /* glsl */ `
varying vec2 vLocalXY;

void main() {
  vLocalXY = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ORBIT_TRAIL_FRAG = /* glsl */ `
uniform vec3  uColor;
uniform float uHeadAngle;
uniform float uArcSpan;
uniform float uAlpha;
uniform float uInnerRadius;
uniform float uOuterRadius;

varying vec2 vLocalXY;

const float TAU = 6.28318530718;

void main() {
  float r = length(vLocalXY);
  float centerRadius = 0.5 * (uInnerRadius + uOuterRadius);
  float halfWidth = 0.5 * (uOuterRadius - uInnerRadius);
  float radial = exp(-pow((r - centerRadius) / max(halfWidth, 0.001), 2.0) * 2.8);

  float angle = atan(vLocalXY.y, vLocalXY.x);
  float trailDist = mod(uHeadAngle - angle + TAU, TAU);
  float ringBase = radial * 0.22;
  float hotspot = exp(-trailDist * 18.0);
  float wake = exp(-trailDist * 6.0) * (1.0 - smoothstep(0.0, uArcSpan, trailDist));
  float alpha = (ringBase + radial * hotspot * 0.9 + radial * wake * 0.2) * uAlpha;
  vec3 color = mix(uColor * 0.28, vec3(1.0), hotspot * 0.55);
  gl_FragColor = vec4(color, alpha);
}
`;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Pickup {
  pos:            Vec2;
  radius:         number;
  mesh:           THREE.Group;
  collected:      boolean;
  type:           'normal' | 'hyper';
  floatY:         number;       // base Y for float animation
  proximityBody:  ProximityBody;
  vel:            Vec2;         // eject velocity (zero when settled)
  settleTimer:    number;       // > 0 while flying outward; not collectible until 0
  orbMat:         THREE.MeshStandardMaterial;
  trailMat:       THREE.ShaderMaterial;
  light:          THREE.PointLight;
  orbitRadius:    number;
  orbitSpeed:     number;
  orbitPhase:     number;
}

// ─── Mesh Factories ──────────────────────────────────────────────────────────

interface PickupVisual {
  mesh:        THREE.Group;
  orbMat:      THREE.MeshStandardMaterial;
  trailMat:    THREE.ShaderMaterial;
  light:       THREE.PointLight;
  orbitRadius: number;
  orbitSpeed:  number;
}

function makePickupVisual(type: 'normal' | 'hyper'): PickupVisual {
  const isHyper = type === 'hyper';
  const color = new THREE.Color(isHyper ? 0x00eeff : 0x00ff88);
  const orbitRadius = isHyper ? 0.76 : 0.54;
  const orbitWidth = isHyper ? 0.075 : 0.052;
  const orbitSpeed = -(isHyper ? 8.2 : 6.6);

  const mesh = new THREE.Group();

  const trailMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor:       { value: new THREE.Vector3(color.r, color.g, color.b) },
      uHeadAngle:   { value: 0 },
      uArcSpan:     { value: isHyper ? Math.PI * 0.34 : Math.PI * 0.26 },
      uAlpha:       { value: isHyper ? 1.0 : 0.88 },
      uInnerRadius: { value: orbitRadius - orbitWidth },
      uOuterRadius: { value: orbitRadius + orbitWidth },
    },
    vertexShader:   ORBIT_TRAIL_VERT,
    fragmentShader: ORBIT_TRAIL_FRAG,
    transparent:    true,
    depthWrite:     false,
    blending:       THREE.AdditiveBlending,
    side:           THREE.DoubleSide,
  });

  const trail = new THREE.Mesh(
    new THREE.RingGeometry(orbitRadius - orbitWidth, orbitRadius + orbitWidth, 72),
    trailMat,
  );
  trail.rotation.x = -Math.PI / 2;
  mesh.add(trail);

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(orbitRadius - orbitWidth * 2.4, orbitRadius + orbitWidth * 2.4, 72),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: isHyper ? 0.42 : 0.28,
      transparent: true,
      opacity: isHyper ? 0.24 : 0.18,
      roughness: 0.2,
      metalness: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -0.01;
  mesh.add(halo);

  const orbMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: isHyper ? 1.75 : 1.0,
    roughness: 0.15,
    metalness: 0.25,
  });
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(isHyper ? 0.12 : 0.09, 18, 12),
    orbMat,
  );
  orb.position.set(orbitRadius, 0.03, 0);
  mesh.add(orb);

  const light = new THREE.PointLight(color, isHyper ? 3.8 : 2.4, isHyper ? 8.5 : 6.2, 1.5);
  mesh.add(light);

  return { mesh, orbMat, trailMat, light, orbitRadius, orbitSpeed };
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createNormalPickup(pos: Vec2): Pickup {
  const visual = makePickupVisual('normal');
  const mesh = visual.mesh;
  mesh.position.set(pos.x, 0.8, pos.z);
  scene.add(mesh);

  const pickupPos = { x: pos.x, z: pos.z };
  const proxBody: ProximityBody = {
    pos: pickupPos,
    radius: 0.9,
    active: true,
    owner: null as unknown,
  };

  const pickup: Pickup = {
    pos: pickupPos,
    radius: 0.9,
    mesh,
    collected: false,
    type: 'normal',
    floatY: 0.8,
    proximityBody: proxBody,
    vel: { x: 0, z: 0 },
    settleTimer: 0,
    orbMat: visual.orbMat,
    trailMat: visual.trailMat,
    light: visual.light,
    orbitRadius: visual.orbitRadius,
    orbitSpeed: visual.orbitSpeed,
    orbitPhase: Math.random() * Math.PI * 2,
  };

  proxBody.owner = pickup;
  registerProximityBody('pickup', proxBody);

  return pickup;
}

export function createHyperPickup(pos: Vec2): Pickup {
  const visual = makePickupVisual('hyper');
  const mesh = visual.mesh;
  mesh.position.set(pos.x, 1.0, pos.z);
  scene.add(mesh);

  const pickupPos = { x: pos.x, z: pos.z };
  const proxBody: ProximityBody = {
    pos: pickupPos,
    radius: 1.1,
    active: true,
    owner: null as unknown,
  };

  const pickup: Pickup = {
    pos: pickupPos,
    radius: 1.1,
    mesh,
    collected: false,
    type: 'hyper',
    floatY: 1.0,
    proximityBody: proxBody,
    vel: { x: 0, z: 0 },
    settleTimer: 0,
    orbMat: visual.orbMat,
    trailMat: visual.trailMat,
    light: visual.light,
    orbitRadius: visual.orbitRadius,
    orbitSpeed: visual.orbitSpeed,
    orbitPhase: Math.random() * Math.PI * 2,
  };

  proxBody.owner = pickup;
  registerProximityBody('pickup', proxBody);

  return pickup;
}

// ─── Collection ─────────────────────────────────────────────────────────────

/** Mark a pickup as collected and remove it from the scene. */
export function collectPickup(pickup: Pickup): void {
  pickup.collected = true;
  pickup.proximityBody.active = false;
  scene.remove(pickup.mesh);
}

// ─── RPM Gain ───────────────────────────────────────────────────────────────

/** Compute the RPM gain for collecting a normal pickup (diminishing returns). */
export function pickupRpmGain(playerRpm: number, rpmHalfPoint: number, boost: number): number {
  return boost * rpmHalfPoint / (playerRpm + rpmHalfPoint);
}

// ─── Update (animation only) ────────────────────────────────────────────────

/**
 * Animate all non-collected pickups (rotation, y-position bob, hyper pulse).
 * Collection is handled by the proximity system.
 */
export function updatePickups(
  pickups: Pickup[],
  time:    number,
  delta:   number,
): void {
  for (const p of pickups) {
    if (p.collected) continue;

    // Eject movement — slides outward until settled
    if (p.settleTimer > 0) {
      p.settleTimer -= delta;
      p.pos.x += p.vel.x * delta;
      p.pos.z += p.vel.z * delta;
      p.mesh.position.x = p.pos.x;
      p.mesh.position.z = p.pos.z;
      if (p.settleTimer <= 0) {
        p.vel.x = 0;
        p.vel.z = 0;
        p.proximityBody.active = true;
      }
    }

    const orbitAngle = time * p.orbitSpeed + p.orbitPhase;
    const orb = p.mesh.children[2] as THREE.Mesh;
    orb.position.set(
      Math.cos(orbitAngle) * p.orbitRadius,
      0,
      Math.sin(orbitAngle) * p.orbitRadius,
    );
    // RingGeometry angles are read in pre-rotation XY space; after rotating the
    // ring flat into XZ, the orbit angle needs to be mirrored to match the orb.
    p.trailMat.uniforms.uHeadAngle.value = -orbitAngle;

    // Float animation + glow pulse
    if (p.type === 'hyper') {
      const pulse = 0.7 + 0.3 * Math.sin(time * 4 * Math.PI * 2);
      p.mesh.position.y  = p.floatY + Math.sin(time * 2.5 + 1) * 0.2;
      p.orbMat.emissiveIntensity = pulse * 1.9;
      p.trailMat.uniforms.uAlpha.value = 0.92 + pulse * 0.28;
      p.light.intensity = 2.4 + pulse * 1.2;
    } else {
      p.mesh.position.y  = p.floatY + Math.sin(time * 2 + p.pos.x) * 0.15;
      const pulse = 0.82 + 0.18 * Math.sin(time * 3.4 + p.orbitPhase);
      p.orbMat.emissiveIntensity = pulse * 1.05;
      p.trailMat.uniforms.uAlpha.value = 0.68 + pulse * 0.12;
      p.light.intensity = 1.2 + pulse * 0.6;
    }
  }
}

// ─── Spawn (for enemy kill drops) ────────────────────────────────────────────

export function spawnPickupAt(pickups: Pickup[], pos: Vec2): void {
  pickups.push(createNormalPickup(pos));
}

/** Spawn a pickup that flies outward from pos in the given direction, then settles. */
export function ejectPickupAt(pickups: Pickup[], pos: Vec2, vel: Vec2): void {
  const pickup = createNormalPickup(pos);
  pickup.vel.x = vel.x;
  pickup.vel.z = vel.z;
  pickup.settleTimer = 0.7;
  pickup.proximityBody.active = false;   // not collectible until settled
  pickups.push(pickup);
}

// ─── Reset ───────────────────────────────────────────────────────────────────

export function resetPickups(pickups: Pickup[], originalCount: number): void {
  // Remove dynamically spawned pickups
  while (pickups.length > originalCount) {
    const extra = pickups.pop()!;
    if (!extra.collected) scene.remove(extra.mesh);
    deregisterProximityBody('pickup', extra.proximityBody);
  }

  // Restore original pickups and re-register proximity bodies
  // (resetEntityRegistrations clears the proximity lists)
  for (const p of pickups) {
    if (p.collected) {
      p.collected = false;
      p.mesh.position.set(p.pos.x, p.floatY, p.pos.z);
      scene.add(p.mesh);
    }
    p.proximityBody.active = true;
    registerProximityBody('pickup', p.proximityBody);
  }
}
