import * as THREE from 'three';

export interface SpinnerMotionVisuals {
  speedHalo: THREE.Mesh;
  speedHaloMat: THREE.MeshBasicMaterial;
}

export interface TopResult {
  /** Positioned in the world; receives tilt rotations (X/Z). */
  tiltGroup: THREE.Group;
  /** Child of tiltGroup; receives Y-axis spin. */
  spinGroup: THREE.Group;
  /** Body material — exposed so game code can drive hit-flash emissive. */
  bodyMat: THREE.MeshStandardMaterial;
  /** Optional shared visuals animated by spinnerVisuals.ts. */
  motionVisuals?: SpinnerMotionVisuals;
}

// Standard spinner top size. Other spinner variants scale relative to this.
export const TOP_BASE_RADIUS = 1.6875;

const WHITE = new THREE.Color(0xffffff);
const CORE_BLUE = new THREE.Color(0xdff7ff);
const BODY_SEGMENTS = 40;

function createFanBladeGeometry(): THREE.ExtrudeGeometry {
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.16, -0.18);
  bladeShape.lineTo(0.34, -0.2);
  bladeShape.lineTo(0.84, -0.04);
  bladeShape.lineTo(1.02, 0.26);
  bladeShape.lineTo(0.56, 0.32);
  bladeShape.lineTo(0.2, 0.18);
  bladeShape.lineTo(-0.02, 0.06);
  bladeShape.closePath();

  const geometry = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.14,
    bevelEnabled: false,
    curveSegments: 4,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0.14, -0.07);
  return geometry;
}

const SHARED_FAN_BLADE_GEOMETRY = createFanBladeGeometry();

export function createTop(color: number = 0xe94560): TopResult {
  const tiltGroup = new THREE.Group();
  const spinGroup = new THREE.Group();
  tiltGroup.add(spinGroup);

  const baseColor = new THREE.Color(color);
  const accentColor = baseColor.clone().lerp(WHITE, 0.28);
  const coreColor = baseColor.clone().lerp(CORE_BLUE, 0.55);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: baseColor.clone(),
    roughness: 0.32,
    metalness: 0.88,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: accentColor.clone(),
    roughness: 0.22,
    metalness: 0.96,
  });
  const shadowMat = new THREE.MeshStandardMaterial({
    color: 0x141922,
    roughness: 0.48,
    metalness: 0.74,
  });
  const coreMat = new THREE.MeshStandardMaterial({
    color: coreColor.clone(),
    roughness: 0.18,
    metalness: 0.78,
    emissive: coreColor.clone().multiplyScalar(0.14),
    emissiveIntensity: 0.5,
  });
  const speedHaloMat = new THREE.MeshBasicMaterial({
    color: accentColor.clone(),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const root = new THREE.Group();
  root.position.y = 0.48;
  spinGroup.add(root);

  const lowerBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.46, 0.24, BODY_SEGMENTS),
    bodyMat,
  );
  lowerBody.position.y = 0.02;
  lowerBody.castShadow = true;
  root.add(lowerBody);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.42, 0.18, 24),
    bodyMat,
  );
  neck.position.y = 0.2;
  neck.castShadow = true;
  root.add(neck);

  const centerCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.28, 0.24, 24),
    trimMat,
  );
  centerCap.position.y = 0.38;
  centerCap.castShadow = true;
  root.add(centerCap);

  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.16, 0),
    coreMat,
  );
  core.position.y = 0.56;
  core.castShadow = true;
  root.add(core);

  const bladeLift = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.52, 0.14, 24),
    trimMat,
  );
  bladeLift.position.y = 0.18;
  bladeLift.castShadow = true;
  root.add(bladeLift);

  const tipStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.11, 0.2, 16),
    trimMat,
  );
  tipStem.position.y = -0.16;
  tipStem.castShadow = true;
  root.add(tipStem);

  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.28, 16),
    shadowMat,
  );
  tip.position.y = -0.4;
  tip.castShadow = true;
  root.add(tip);

  for (let i = 0; i < 3; i += 1) {
    const blade = new THREE.Mesh(SHARED_FAN_BLADE_GEOMETRY, trimMat);
    const bladePivot = new THREE.Group();
    bladePivot.rotation.y = (i / 3) * Math.PI * 2;
    blade.position.set(0.14, 0.18, 0);
    blade.rotation.y = -0.52;
    blade.castShadow = true;
    bladePivot.add(blade);
    root.add(bladePivot);

    const bladeRoot = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.12, 0.28),
      shadowMat,
    );
    bladeRoot.position.set(0.22, 0.12, 0.02);
    bladeRoot.rotation.y = -0.28;
    bladeRoot.castShadow = true;
    bladePivot.add(bladeRoot);

    const bladeFin = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.08, 0.16),
      bodyMat,
    );
    bladeFin.position.set(0.78, 0.29, 0.14);
    bladeFin.rotation.y = 0.38;
    bladeFin.castShadow = true;
    bladePivot.add(bladeFin);
  }

  const speedHalo = new THREE.Mesh(
    new THREE.RingGeometry(0.86, 1.28, 48),
    speedHaloMat,
  );
  speedHalo.rotation.x = -Math.PI / 2;
  speedHalo.position.y = -0.32;
  root.add(speedHalo);

  const syncColor = new THREE.Color();
  const glowColor = new THREE.Color();
  const emissiveBoost = new THREE.Color();
  root.onBeforeRender = () => {
    syncColor.copy(bodyMat.color).lerp(WHITE, 0.24);
    trimMat.color.copy(syncColor);
    trimMat.emissive.copy(bodyMat.emissive).multiplyScalar(0.52);
    trimMat.emissiveIntensity = bodyMat.emissiveIntensity * 0.75;

    glowColor.copy(bodyMat.color).lerp(CORE_BLUE, 0.35);
    coreMat.color.copy(glowColor);
    coreMat.emissive.copy(glowColor).multiplyScalar(0.22 + bodyMat.emissiveIntensity * 0.18);
    emissiveBoost.copy(bodyMat.emissive).multiplyScalar(0.22);
    coreMat.emissive.add(emissiveBoost);
    coreMat.emissiveIntensity = 0.55 + bodyMat.emissiveIntensity * 0.35;

    speedHaloMat.color.copy(syncColor);
  };

  return {
    tiltGroup,
    spinGroup,
    bodyMat,
    motionVisuals: { speedHalo, speedHaloMat },
  };
}
