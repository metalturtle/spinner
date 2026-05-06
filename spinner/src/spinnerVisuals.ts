import * as THREE from 'three';
import type { Vec2 } from './physics';
import type { SpinnerMotionVisuals } from './top';
import { getLightsDisabled } from './settings';

// ─── Shared visual constants for all spinners ────────────────────────────────

export const MAX_TILT   = 0.25;
export const TILT_SPEED = 8;
const GREY = new THREE.Color(0x555555);

// ─── Types ───────────────────────────────────────────────────────────────────

/** Mutable tilt state — lives on the owning entity (player or enemy). */
export interface SpinnerTiltState {
  tiltX: number;
  tiltZ: number;
}

export interface SpinnerVisualInput {
  vel:       Vec2;
  maxSpeed:  number;
  spinSpeed: number;
  rpmFrac:   number;        // 0–1 fraction used for wobble + desaturation
  spinFrac:  number;        // spin multiplier (may exceed 1 for overcharge)
  baseColor: THREE.Color;
  tiltGroup: THREE.Group;
  spinGroup: THREE.Group;
  bodyMat:   THREE.MeshStandardMaterial;
  motionVisuals?: SpinnerMotionVisuals;
}

// ─── Update ──────────────────────────────────────────────────────────────────

/**
 * Shared spinner visual update: tilt, wobble, spin, and colour desaturation.
 *
 * Does NOT handle emissive effects (hit flash, overcharge glow, critical pulse)
 * — those differ between player and enemies and are handled by the caller.
 */
export function updateSpinnerVisuals(
  tilt:  SpinnerTiltState,
  input: SpinnerVisualInput,
  time:  number,
  delta: number,
): void {
  const {
    vel,
    maxSpeed,
    spinSpeed,
    rpmFrac,
    spinFrac,
    baseColor,
    tiltGroup,
    spinGroup,
    bodyMat,
    motionVisuals,
  } = input;
  const speed = Math.sqrt(vel.x ** 2 + vel.z ** 2);

  // Tilt toward movement direction
  const speedFrac   = speed / maxSpeed;
  const targetTiltX =  (vel.z / maxSpeed) * MAX_TILT * speedFrac;
  const targetTiltZ = -(vel.x / maxSpeed) * MAX_TILT * speedFrac;
  const lerpT       = Math.min(TILT_SPEED * delta, 1);
  tilt.tiltX += (targetTiltX - tilt.tiltX) * lerpT;
  tilt.tiltZ += (targetTiltZ - tilt.tiltZ) * lerpT;

  // Low-RPM wobble
  const wobbleAmp  = rpmFrac < 0.3 ? (0.3 - rpmFrac) * 0.25 : 0;
  const wobbleFreq = 0.6 + (1 - rpmFrac) * 1.2;
  const wobbleX    = Math.sin(time * wobbleFreq * Math.PI * 2) * wobbleAmp;
  const wobbleZ    = Math.cos(time * wobbleFreq * Math.PI * 2 * 0.7) * wobbleAmp;

  tiltGroup.rotation.x = tilt.tiltX + wobbleX;
  tiltGroup.rotation.z = tilt.tiltZ + wobbleZ;

  // Spin
  spinGroup.rotation.y += spinFrac * spinSpeed * delta;

  // Body colour desaturation
  bodyMat.color.copy(baseColor).lerp(GREY, 1 - Math.min(1, rpmFrac));

  if (motionVisuals) {
    const haloStrength = Math.max(0, spinFrac * 0.18 + speedFrac * 0.2 - 0.04);
    const haloPulse = 0.94 + Math.sin(time * Math.PI * 10) * 0.06;
    const haloScale = 1 + speedFrac * 0.16 + Math.max(0, spinFrac - 0.75) * 0.08;
    const overFrac = spinFrac > 1 ? Math.min(1.25, spinFrac - 1) : 0;
    const auraPulse = 0.9 + Math.sin(time * Math.PI * 8) * 0.1;

    motionVisuals.speedHalo.visible = haloStrength > 0.015;
    motionVisuals.speedHalo.scale.setScalar(haloScale * haloPulse);
    motionVisuals.speedHaloMat.opacity = Math.min(0.52, haloStrength);
    if (motionVisuals.auraLight) {
      const lightsOff = getLightsDisabled();
      motionVisuals.auraLight.intensity = lightsOff ? 0 : (20.25 + rpmFrac * 0.6 + speedFrac * 0.4 + overFrac * 0.5) * auraPulse;
      if (!lightsOff) {
        motionVisuals.auraLight.distance = 10 + rpmFrac * 2.4 + overFrac * 1.6;
        motionVisuals.auraLightAnchor.getWorldPosition(motionVisuals.auraLight.position);
      }
    }
  }
}
