import * as THREE from 'three';
import { scene } from './renderer';
import { ARENA_SIZE } from './constants';
import { collidables, type Collidable, type Vec2 } from './physics';
import { createHpBar, updateHpBar } from './hpBar';
import {
  nextEntityId,
  registerMovement,
  registerRpm,
  tagCollidable,
  untagCollidable,
  deregisterEntity,
  setMovementMaxSpeed,
} from './systems';

export interface SpiderReliquaryConfig {
  coreRpmCapacity: number;
  coreRadius: number;
  coreMass: number;
  coreMaxSpeed: [number, number, number];
  coreAcceleration: [number, number, number];
  legCount: number;
  legHp: number;
  legRadius: number;
  hipOrbitRadius: number;
  footOrbitRadius: number;
  legUpperLength: number;
  legLowerLength: number;
  stepThreshold: number;
  stepDuration: number;
  stepHeight: number;
  bodyScale: number;
  shieldLegThreshold: number;
  collapseDuration: number;
  stompRadius: number;
  stompWindup: [number, number, number];
  stompDamage: [number, number, number];
  stompCooldown: [number, number, number];
  pulseRadius: [number, number, number];
  pulseDamage: [number, number, number];
  pulseCooldown: [number, number, number];
  heatFactor: number;
  color: number;
}

export const SPIDER_RELIQUARY_TIER_1: SpiderReliquaryConfig = {
  coreRpmCapacity: 620,
  coreRadius: 0.98,
  coreMass: 5.4,
  coreMaxSpeed: [4.6, 6.4, 8.2],
  coreAcceleration: [10.5, 13.0, 16.0],
  legCount: 4,
  legHp: 12,
  legRadius: 0.95,
  hipOrbitRadius: 1.35,
  footOrbitRadius: 5.4,
  legUpperLength: 3.5,
  legLowerLength: 3.8,
  stepThreshold: 1.7,
  stepDuration: 0.28,
  stepHeight: 1.2,
  bodyScale: 0.5,
  shieldLegThreshold: 2,
  collapseDuration: 4.6,
  stompRadius: 1.85,
  stompWindup: [1.0, 0.84, 0.7],
  stompDamage: [18, 23, 30],
  stompCooldown: [2.7, 2.0, 1.45],
  pulseRadius: [3.0, 3.8, 4.6],
  pulseDamage: [12, 16, 21],
  pulseCooldown: [5.2, 4.1, 3.2],
  heatFactor: 1.05,
  color: 0x8b7351,
};

type SpiderAttackKind = 'stomp' | 'pulse';

export interface SpiderReliquaryAttackEvent {
  kind: SpiderAttackKind;
  point: { x: number; y: number; z: number };
  radius: number;
  damage: number;
  hitPlayer: boolean;
}

interface SpiderAttack {
  kind: SpiderAttackKind;
  point: Vec2;
  radius: number;
  damage: number;
  windup: number;
  elapsed: number;
  mesh: THREE.Mesh;
}

export interface SpiderLeg {
  collidable: Collidable;
  group: THREE.Group;
  upperMesh: THREE.Mesh;
  lowerMesh: THREE.Mesh;
  kneeMesh: THREE.Mesh;
  tipMesh: THREE.Mesh;
  hpGroup: THREE.Group;
  hpBarFill: THREE.Mesh;
  hp: number;
  maxHp: number;
  alive: boolean;
  baseAngle: number;
  hipRadius: number;
  footRadius: number;
  footPos: THREE.Vector3;
  footFrom: THREE.Vector3;
  footTo: THREE.Vector3;
  stepProgress: number;
  stepDuration: number;
  phaseOffset: number;
  gaitGroup: 0 | 1;
  kneeSign: 1 | -1;
}

export interface SpiderReliquaryState {
  id: number;
  config: SpiderReliquaryConfig;
  collidable: Collidable;
  bodyGroup: THREE.Group;
  bodyRoot: THREE.Group;
  coreMesh: THREE.Mesh;
  haloMesh: THREE.Mesh;
  shieldMesh: THREE.Mesh;
  hpGroup: THREE.Group;
  hpBarFill: THREE.Mesh;
  legs: SpiderLeg[];
  attacks: SpiderAttack[];
  alive: boolean;
  facingAngle: number;
  collapseTimer: number;
  stompCooldown: number;
  pulseCooldown: number;
  gaitTime: number;
  legCycleCursor: number;
  gaitGroupActive: 0 | 1;
  turnRate: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothStep01(t: number): number {
  return t * t * (3 - 2 * t);
}

function wrapAngle(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function setSegmentFromPoints(
  mesh: THREE.Mesh,
  start: THREE.Vector3,
  end: THREE.Vector3,
  thickness: number,
): void {
  const delta = new THREE.Vector3().subVectors(end, start);
  const length = Math.max(delta.length(), 0.001);
  mesh.position.copy(start).lerp(end, 0.5);
  mesh.scale.set(thickness, length, thickness);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
}

function solveTwoBoneKnee(
  hip: THREE.Vector3,
  foot: THREE.Vector3,
  upperLength: number,
  lowerLength: number,
  bendHint: THREE.Vector3,
): THREE.Vector3 {
  const toFoot = new THREE.Vector3().subVectors(foot, hip);
  const distance = clamp(toFoot.length(), 0.001, upperLength + lowerLength - 0.001);
  const forward = toFoot.normalize();

  const bend = bendHint.clone().projectOnPlane(forward);
  if (bend.lengthSq() < 1e-4) {
    bend.set(-forward.z, 0.6, forward.x);
  }
  bend.normalize();

  const along = clamp(
    (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance),
    0,
    upperLength,
  );
  const height = Math.sqrt(Math.max(upperLength * upperLength - along * along, 0));
  return hip.clone()
    .addScaledVector(forward, along)
    .addScaledVector(bend, height);
}

function getAliveLegCount(boss: SpiderReliquaryState): number {
  return boss.legs.filter((leg) => leg.alive).length;
}

function getPhaseIndex(boss: SpiderReliquaryState): number {
  const alive = getAliveLegCount(boss);
  if (alive >= 4) return 0;
  if (alive >= 2) return 1;
  return 2;
}

export function canDamageSpiderCore(boss: SpiderReliquaryState): boolean {
  return getAliveLegCount(boss) <= boss.config.shieldLegThreshold || boss.collapseTimer > 0;
}

export function getSpiderCoreDamageMultiplier(boss: SpiderReliquaryState): number {
  if (boss.collapseTimer > 0) return 1.5;
  return getPhaseIndex(boss) === 2 ? 1.2 : 1.0;
}

function createAttackMesh(kind: SpiderAttackKind): THREE.Mesh {
  const geometry = kind === 'pulse'
    ? new THREE.RingGeometry(0.7, 1.0, 48)
    : new THREE.CircleGeometry(1, 40);
  const material = new THREE.MeshBasicMaterial({
    color: kind === 'pulse' ? 0xffd26e : 0xff7042,
    transparent: true,
    opacity: kind === 'pulse' ? 0.18 : 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.05;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

function removeAttack(attack: SpiderAttack): void {
  scene.remove(attack.mesh);
  attack.mesh.geometry.dispose();
  if (attack.mesh.material instanceof THREE.Material) attack.mesh.material.dispose();
}

function scheduleStomp(
  boss: SpiderReliquaryState,
  target: Vec2,
  phase: number,
): void {
  const radius = boss.config.stompRadius;
  const limit = ARENA_SIZE - radius - 0.5;
  const point = {
    x: clamp(target.x, -limit, limit),
    z: clamp(target.z, -limit, limit),
  };
  const mesh = createAttackMesh('stomp');
  mesh.position.set(point.x, 0.05, point.z);
  mesh.scale.set(radius, radius, 1);
  boss.attacks.push({
    kind: 'stomp',
    point,
    radius,
    damage: boss.config.stompDamage[phase],
    windup: boss.config.stompWindup[phase],
    elapsed: 0,
    mesh,
  });
}

function schedulePulse(boss: SpiderReliquaryState, phase: number): void {
  const radius = boss.config.pulseRadius[phase];
  const mesh = createAttackMesh('pulse');
  mesh.position.set(boss.collidable.pos.x, 0.055, boss.collidable.pos.z);
  mesh.scale.set(radius, radius, 1);
  boss.attacks.push({
    kind: 'pulse',
    point: { x: boss.collidable.pos.x, z: boss.collidable.pos.z },
    radius,
    damage: boss.config.pulseDamage[phase],
    windup: 0.7,
    elapsed: 0,
    mesh,
  });
}

function makeLeg(baseAngle: number, config: SpiderReliquaryConfig): SpiderLeg {
  const group = new THREE.Group();
  const limbMat = new THREE.MeshStandardMaterial({
    color: 0x6d655d,
    roughness: 0.74,
    metalness: 0.36,
  });
  const upperMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 6),
    limbMat,
  );
  upperMesh.castShadow = true;
  group.add(upperMesh);

  const lowerMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 6),
    limbMat.clone(),
  );
  lowerMesh.castShadow = true;
  group.add(lowerMesh);

  const kneeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 8, 8),
    new THREE.MeshStandardMaterial({
      color: 0x8b785f,
      roughness: 0.58,
      metalness: 0.48,
    }),
  );
  kneeMesh.castShadow = true;
  group.add(kneeMesh);

  const tipMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.44, 6),
    new THREE.MeshStandardMaterial({
      color: 0xb48c52,
      roughness: 0.42,
      metalness: 0.58,
    }),
  );
  tipMesh.rotation.x = Math.PI / 2;
  tipMesh.castShadow = true;
  group.add(tipMesh);

  const hpGroup = new THREE.Group();
  const { bg, fill } = createHpBar(0.95, 0.08, 0);
  hpGroup.add(bg);
  hpGroup.add(fill);
  group.add(hpGroup);
  scene.add(group);

  const collidable: Collidable = {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: config.legRadius,
    mass: 2.8,
    isStatic: true,
    rpm: 1,
    rpmCapacity: 1,
    heatFactor: 0.08,
  };
  collidables.push(collidable);
  tagCollidable(collidable, 'spider_leg');

  return {
    collidable,
    group,
    upperMesh,
    lowerMesh,
    kneeMesh,
    tipMesh,
    hpGroup,
    hpBarFill: fill,
    hp: config.legHp,
    maxHp: config.legHp,
    alive: true,
    baseAngle,
    hipRadius: config.hipOrbitRadius,
    footRadius: config.footOrbitRadius,
    footPos: new THREE.Vector3(),
    footFrom: new THREE.Vector3(),
    footTo: new THREE.Vector3(),
    stepProgress: 1,
    stepDuration: config.stepDuration * (0.9 + Math.random() * 0.25),
    phaseOffset: Math.random() * Math.PI * 2,
    gaitGroup: (Math.sin(baseAngle) * Math.cos(baseAngle) >= 0 ? 0 : 1),
    kneeSign: Math.sin(baseAngle) >= 0 ? 1 : -1,
  };
}

export function createSpiderReliquary(pos: Vec2, config: SpiderReliquaryConfig): SpiderReliquaryState {
  const bodyGroup = new THREE.Group();
  const bodyRoot = new THREE.Group();
  bodyGroup.add(bodyRoot);
  scene.add(bodyGroup);

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 0.98, 0.34, 10),
    new THREE.MeshStandardMaterial({
      color: 0x4e463d,
      roughness: 0.9,
      metalness: 0.18,
    }),
  );
  pedestal.position.y = 1.42;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  bodyRoot.add(pedestal);

  const reliquaryBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.68, 0.7, 8),
    new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.58,
      metalness: 0.52,
    }),
  );
  reliquaryBody.position.y = 1.86;
  reliquaryBody.castShadow = true;
  reliquaryBody.receiveShadow = true;
  bodyRoot.add(reliquaryBody);

  const coreMesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.28, 0),
    new THREE.MeshStandardMaterial({
      color: 0xffb05d,
      emissive: 0xff8a33,
      emissiveIntensity: 1.2,
      roughness: 0.18,
      metalness: 0.2,
    }),
  );
  coreMesh.position.y = 1.86;
  coreMesh.castShadow = true;
  bodyRoot.add(coreMesh);

  const haloMesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.78, 0.05, 8, 32),
    new THREE.MeshStandardMaterial({
      color: 0xd7ae5c,
      emissive: 0xb46f1c,
      emissiveIntensity: 0.28,
      roughness: 0.32,
      metalness: 0.72,
    }),
  );
  haloMesh.rotation.x = Math.PI / 2;
  haloMesh.position.y = 2.0;
  haloMesh.castShadow = true;
  bodyRoot.add(haloMesh);

  const shieldMesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.18, 1),
    new THREE.MeshStandardMaterial({
      color: 0xffd47a,
      emissive: 0xff8a33,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      roughness: 0.1,
      metalness: 0.22,
    }),
  );
  shieldMesh.position.y = 1.88;
  bodyRoot.add(shieldMesh);

  const hpGroup = new THREE.Group();
  const { bg, fill } = createHpBar(2.5, 0.16, 4.2);
  hpGroup.add(bg);
  hpGroup.add(fill);
  scene.add(hpGroup);

  const collidable: Collidable = {
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: config.coreRadius,
    mass: config.coreMass,
    isStatic: false,
    rpm: config.coreRpmCapacity,
    rpmCapacity: config.coreRpmCapacity,
    heatFactor: config.heatFactor,
  };
  collidables.push(collidable);

  const id = nextEntityId();
  registerMovement(id, collidable, config.coreMaxSpeed[0], 0.95);
  registerRpm(id, collidable, 0, 0);
  tagCollidable(collidable, 'spider_core');

  const legs: SpiderLeg[] = [];
  for (let i = 0; i < config.legCount; i++) {
    const angle = Math.PI * 0.25 + (i / config.legCount) * Math.PI * 2;
    legs.push(makeLeg(angle, config));
  }

  const boss: SpiderReliquaryState = {
    id,
    config,
    collidable,
    bodyGroup,
    bodyRoot,
    coreMesh,
    haloMesh,
    shieldMesh,
    hpGroup,
    hpBarFill: fill,
    legs,
    attacks: [],
    alive: true,
    facingAngle: 0,
    collapseTimer: 0,
    stompCooldown: 1.1,
    pulseCooldown: 2.4,
    gaitTime: Math.random() * Math.PI * 2,
    legCycleCursor: 0,
    gaitGroupActive: 0,
    turnRate: 0,
  };

  bodyGroup.position.set(pos.x, 0, pos.z);
  hpGroup.position.set(pos.x, 0, pos.z);
  bodyRoot.scale.setScalar(config.bodyScale);
  syncSpiderReliquaryLegs(boss, 0);
  return boss;
}

export function syncSpiderReliquaryLegs(boss: SpiderReliquaryState, delta: number): void {
  if (!boss.alive) return;
  const core = boss.collidable;
  const phase = getPhaseIndex(boss);
  const hipY = 1.88 - (boss.collapseTimer > 0 ? 0.45 : 0);
  const bodySpeed = Math.hypot(core.vel.x, core.vel.z);
  const turnUrgency = clamp(Math.abs(boss.turnRate) / 3.2, 0, 1);
  const turnSign = Math.sign(boss.turnRate) || 1;
  const moveDir = bodySpeed > 0.01
    ? new THREE.Vector3(core.vel.x / bodySpeed, 0, core.vel.z / bodySpeed)
    : new THREE.Vector3(Math.sin(boss.facingAngle), 0, Math.cos(boss.facingAngle));
  const activeGroup = boss.gaitGroupActive;
  const stepThreshold = boss.config.stepThreshold
    * (boss.collapseTimer > 0 ? 0.72 : 1.0)
    * (1.0 - turnUrgency * 0.28);
  const entries: Array<{
    leg: SpiderLeg;
    hip: THREE.Vector3;
    idealFoot: THREE.Vector3;
    outward: THREE.Vector3;
    tangent: THREE.Vector3;
    needsStep: boolean;
    error: number;
  }> = [];
  const groupNeedsStep: [boolean, boolean] = [false, false];
  const groupError: [number, number] = [0, 0];
  let steppingGroup: 0 | 1 | null = null;

  for (const leg of boss.legs) {
    if (!leg.alive) continue;
    const angle = leg.baseAngle + boss.facingAngle;
    const outward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const tangent = new THREE.Vector3(Math.sin(angle + Math.PI * 0.5), 0, Math.cos(angle + Math.PI * 0.5));
    const gaitPulse = Math.sin(boss.gaitTime * 1.9 + leg.phaseOffset);
    const hip = new THREE.Vector3(
      core.pos.x + outward.x * leg.hipRadius,
      hipY,
      core.pos.z + outward.z * leg.hipRadius,
    );
    const idealFoot = new THREE.Vector3(
      core.pos.x + outward.x * leg.footRadius
        + tangent.x * gaitPulse * 0.8
        + tangent.x * turnSign * turnUrgency * 0.9
        + moveDir.x * (0.35 + 0.18 * gaitPulse),
      0.05,
      core.pos.z + outward.z * leg.footRadius
        + tangent.z * gaitPulse * 0.8
        + tangent.z * turnSign * turnUrgency * 0.9
        + moveDir.z * (0.35 + 0.18 * gaitPulse),
    );

    if (leg.footPos.lengthSq() === 0) {
      leg.footPos.copy(idealFoot);
      leg.footFrom.copy(idealFoot);
      leg.footTo.copy(idealFoot);
    }

    const error = leg.footPos.distanceTo(idealFoot);
    const needsStep = leg.stepProgress >= 1 && error > stepThreshold;
    if (needsStep) groupNeedsStep[leg.gaitGroup] = true;
    groupError[leg.gaitGroup] += error;
    if (leg.stepProgress < 1) steppingGroup = leg.gaitGroup;
    entries.push({ leg, hip, idealFoot, outward, tangent, needsStep, error });
  }

  if (steppingGroup === null) {
    let targetGroup = activeGroup;
    const otherGroup = (1 - targetGroup) as 0 | 1;
    if (
      groupNeedsStep[otherGroup]
      && (!groupNeedsStep[targetGroup] || groupError[otherGroup] > groupError[targetGroup] + 0.35)
    ) {
      targetGroup = otherGroup;
    }
    boss.gaitGroupActive = targetGroup;

    if (groupNeedsStep[targetGroup]) {
      for (const entry of entries) {
        if (entry.leg.gaitGroup !== targetGroup || !entry.needsStep) continue;
        entry.leg.footFrom.copy(entry.leg.footPos);
        entry.leg.footTo.copy(entry.idealFoot);
        entry.leg.stepProgress = 0;
        entry.leg.stepDuration = boss.config.stepDuration * (0.88 + Math.random() * 0.24);
      }
      steppingGroup = targetGroup;
    }
  } else {
    boss.gaitGroupActive = steppingGroup;
  }

  const phaseSpeed = phaseSpeedForStep(boss);
  const emergencyThreshold = stepThreshold * (1.55 - turnUrgency * 0.3);
  for (const entry of entries) {
    const { leg, hip, idealFoot, outward, tangent, error } = entry;

    if (leg.stepProgress < 1) {
      leg.stepProgress = Math.min(1, leg.stepProgress + delta / Math.max(leg.stepDuration / phaseSpeed, 0.01));
      const t = smoothStep01(leg.stepProgress);
      leg.footPos.set(
        lerp(leg.footFrom.x, leg.footTo.x, t),
        lerp(leg.footFrom.y, leg.footTo.y, t),
        lerp(leg.footFrom.z, leg.footTo.z, t),
      );
      const curve = Math.sin(t * Math.PI);
      leg.footPos.x += tangent.x * leg.kneeSign * curve * 0.34;
      leg.footPos.z += tangent.z * leg.kneeSign * curve * 0.34;
      leg.footPos.y += curve * boss.config.stepHeight * (boss.collapseTimer > 0 ? 0.75 : 1.0);
      if (leg.stepProgress >= 1) {
        leg.footPos.copy(leg.footTo);
      }
    }

    const bendHint = outward.clone().multiplyScalar(1.2)
      .addScaledVector(tangent, 0.8 * leg.kneeSign)
      .addScaledVector(moveDir, 0.45);
    bendHint.y = 0.85 + Math.sin(boss.gaitTime * 2.6 + leg.phaseOffset) * 0.08;
    const knee = solveTwoBoneKnee(
      hip,
      leg.footPos,
      boss.config.legUpperLength,
      boss.config.legLowerLength,
      bendHint,
    );

    leg.group.position.set(0, 0, 0);
    setSegmentFromPoints(leg.upperMesh, hip, knee, 0.16);
    setSegmentFromPoints(leg.lowerMesh, knee, leg.footPos, 0.14);
    leg.kneeMesh.position.copy(knee);
    leg.tipMesh.position.copy(leg.footPos);
    leg.tipMesh.lookAt(knee);
    leg.collidable.pos.x = knee.x * 0.35 + leg.footPos.x * 0.65;
    leg.collidable.pos.z = knee.z * 0.35 + leg.footPos.z * 0.65;
    leg.hpGroup.position.set(leg.footPos.x, 2.45, leg.footPos.z);

    if (leg.stepProgress >= 1 && steppingGroup === null && !groupNeedsStep[leg.gaitGroup]) {
      leg.footPos.lerp(idealFoot, delta * 0.8);
    }

    if (leg.stepProgress >= 1 && error > emergencyThreshold) {
      leg.footPos.lerp(idealFoot, delta * (0.75 + turnUrgency * 0.75));
    }
  }
}

function phaseSpeedForStep(boss: SpiderReliquaryState): number {
  const phase = getPhaseIndex(boss);
  return phase === 0 ? 1.0 : phase === 1 ? 1.18 : 1.38;
}

function destroySpiderLeg(leg: SpiderLeg): void {
  leg.alive = false;
  untagCollidable(leg.collidable);
  const idx = collidables.indexOf(leg.collidable);
  if (idx !== -1) collidables.splice(idx, 1);
  scene.remove(leg.group);
}

export function applyDamageToSpiderLeg(
  boss: SpiderReliquaryState,
  leg: SpiderLeg,
  damage: number,
): boolean {
  if (!leg.alive) return false;
  leg.hp = Math.max(0, leg.hp - damage);
  updateHpBar(leg.hpBarFill, leg.hp / leg.maxHp, 0.5);
  if (leg.hp > 0) return false;

  destroySpiderLeg(leg);
  const aliveAfter = getAliveLegCount(boss);
  boss.collapseTimer = Math.max(
    boss.collapseTimer,
    aliveAfter <= boss.config.shieldLegThreshold ? boss.config.collapseDuration : 1.4,
  );
  boss.stompCooldown = Math.min(boss.stompCooldown, 0.6);
  boss.pulseCooldown = Math.min(boss.pulseCooldown, 1.1);
  return true;
}

export function updateSpiderReliquaryAI(
  boss: SpiderReliquaryState,
  playerPos: Vec2,
  playerRadius: number,
  delta: number,
): SpiderReliquaryAttackEvent[] {
  if (!boss.alive) return [];

  const phase = getPhaseIndex(boss);
  const aliveLegs = boss.legs.filter((leg) => leg.alive);
  const stability = clamp(aliveLegs.length / boss.config.legCount, 0.35, 1.0);
  const maxSpeed = boss.config.coreMaxSpeed[phase] * (0.6 + stability * 0.4);
  setMovementMaxSpeed(boss.id, maxSpeed);

  boss.gaitTime += delta;
  boss.collapseTimer = Math.max(0, boss.collapseTimer - delta);
  boss.stompCooldown = Math.max(0, boss.stompCooldown - delta);
  boss.pulseCooldown = Math.max(0, boss.pulseCooldown - delta);

  const body = boss.collidable;
  const dx = playerPos.x - body.pos.x;
  const dz = playerPos.z - body.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const targetAngle = Math.atan2(dx, dz);
  const facingDelta = wrapAngle(targetAngle - boss.facingAngle) * Math.min(3.4 * delta, 1.0);
  boss.facingAngle += facingDelta;
  boss.turnRate = lerp(boss.turnRate, facingDelta / Math.max(delta, 1e-4), Math.min(8 * delta, 1));

  if (boss.collapseTimer > 0) {
    body.vel.x *= 0.84;
    body.vel.z *= 0.84;
  } else {
    const accel = boss.config.coreAcceleration[phase];
    const nx = dx / dist;
    const nz = dz / dist;
    const desiredRange = phase === 0 ? 7.2 : phase === 1 ? 6.2 : 5.0;
    const orbitDir = Math.sin(boss.gaitTime * 1.25) >= 0 ? 1 : -1;

    if (dist > desiredRange) {
      body.vel.x += nx * accel * delta;
      body.vel.z += nz * accel * delta;
    } else {
      body.vel.x += (-nz * orbitDir) * accel * 0.55 * delta;
      body.vel.z += (nx * orbitDir) * accel * 0.55 * delta;
      body.vel.x -= nx * accel * 0.16 * delta;
      body.vel.z -= nz * accel * 0.16 * delta;
    }

    const limit = ARENA_SIZE - 4.0;
    if (body.pos.x > limit) body.vel.x -= accel * delta * 0.7;
    if (body.pos.x < -limit) body.vel.x += accel * delta * 0.7;
    if (body.pos.z > limit) body.vel.z -= accel * delta * 0.7;
    if (body.pos.z < -limit) body.vel.z += accel * delta * 0.7;
  }

  if (aliveLegs.length > 0 && boss.stompCooldown <= 0) {
    const stompCount = phase === 0 ? 1 : phase === 1 ? 2 : Math.min(3, aliveLegs.length);
    const sideways = { x: -dz / dist, z: dx / dist };
    for (let i = 0; i < stompCount; i++) {
      const centerOffset = i - (stompCount - 1) * 0.5;
      const target = {
        x: playerPos.x + sideways.x * centerOffset * boss.config.stompRadius * 1.3 + (Math.random() - 0.5) * 0.4,
        z: playerPos.z + sideways.z * centerOffset * boss.config.stompRadius * 1.3 + (Math.random() - 0.5) * 0.4,
      };
      scheduleStomp(boss, target, phase);
    }
    boss.legCycleCursor = (boss.legCycleCursor + 1) % Math.max(1, aliveLegs.length);
    boss.stompCooldown = boss.config.stompCooldown[phase];
  }

  if (boss.pulseCooldown <= 0 && boss.collapseTimer <= 0.15) {
    schedulePulse(boss, phase);
    boss.pulseCooldown = boss.config.pulseCooldown[phase];
  }

  const events: SpiderReliquaryAttackEvent[] = [];
  for (let i = boss.attacks.length - 1; i >= 0; i--) {
    const attack = boss.attacks[i];
    attack.elapsed += delta;
    const progress = clamp(attack.elapsed / attack.windup, 0, 1);
    attack.mesh.position.x = attack.kind === 'pulse' ? boss.collidable.pos.x : attack.point.x;
    attack.mesh.position.z = attack.kind === 'pulse' ? boss.collidable.pos.z : attack.point.z;

    const scaleBoost = attack.kind === 'pulse'
      ? 0.84 + progress * 0.34
      : 0.92 + progress * 0.12;
    attack.mesh.scale.set(attack.radius * scaleBoost, attack.radius * scaleBoost, 1);

    const material = attack.mesh.material as THREE.MeshBasicMaterial;
    material.opacity = attack.kind === 'pulse'
      ? 0.1 + progress * 0.22
      : 0.15 + progress * 0.28;

    if (attack.elapsed < attack.windup) continue;

    const point = attack.kind === 'pulse'
      ? { x: boss.collidable.pos.x, z: boss.collidable.pos.z }
      : attack.point;
    const distToPlayer = Math.hypot(playerPos.x - point.x, playerPos.z - point.z);
    events.push({
      kind: attack.kind,
      point: { x: point.x, y: 0.18, z: point.z },
      radius: attack.radius,
      damage: attack.damage,
      hitPlayer: distToPlayer <= attack.radius + playerRadius,
    });
    removeAttack(attack);
    boss.attacks.splice(i, 1);
  }

  return events;
}

export function updateSpiderReliquaryVisuals(
  boss: SpiderReliquaryState,
  time: number,
  delta: number,
): void {
  if (!boss.alive) return;

  const phase = getPhaseIndex(boss);
  const body = boss.collidable;
  const rpmFrac = body.rpm / boss.config.coreRpmCapacity;
  const aliveLegs = getAliveLegCount(boss);
  const collapseFrac = clamp(boss.collapseTimer / boss.config.collapseDuration, 0, 1);

  boss.bodyGroup.position.set(body.pos.x, 0, body.pos.z);
  boss.hpGroup.position.set(body.pos.x, 0, body.pos.z);
  boss.bodyGroup.rotation.y = boss.facingAngle;
  updateHpBar(boss.hpBarFill, rpmFrac, 1.0);

  let deadBiasX = 0;
  let deadBiasZ = 0;
  let supportX = 0;
  let supportZ = 0;
  let supportCount = 0;
  let steppingCount = 0;
  for (const leg of boss.legs) {
    if (!leg.alive) {
      deadBiasX += Math.sin(leg.baseAngle + boss.facingAngle);
      deadBiasZ += Math.cos(leg.baseAngle + boss.facingAngle);
      continue;
    }
    supportX += leg.footPos.x;
    supportZ += leg.footPos.z;
    supportCount += 1;
    if (leg.stepProgress < 1) steppingCount += 1;
  }
  const supportBiasX = supportCount > 0 ? supportX / supportCount - body.pos.x : 0;
  const supportBiasZ = supportCount > 0 ? supportZ / supportCount - body.pos.z : 0;
  const supportInstability = steppingCount / Math.max(1, supportCount);

  const wobble = Math.sin(time * (phase === 2 ? 9 : 5)) * 0.03;
  boss.bodyRoot.position.y = 0.94 - collapseFrac * 0.34 - supportInstability * 0.06 + wobble;
  const desiredRoll = deadBiasX * 0.16 - supportBiasX * 0.11 + collapseFrac * 0.24 * Math.sin(time * 8);
  const desiredPitch = -deadBiasZ * 0.16 + supportBiasZ * 0.11 + collapseFrac * 0.18 * Math.cos(time * 7);
  boss.bodyRoot.rotation.z += (desiredRoll - boss.bodyRoot.rotation.z) * Math.min(4.8 * delta, 1);
  boss.bodyRoot.rotation.x += (desiredPitch - boss.bodyRoot.rotation.x) * Math.min(4.8 * delta, 1);

  boss.haloMesh.rotation.z += delta * (phase === 2 ? 1.8 : 0.8);
  boss.haloMesh.rotation.x = Math.PI / 2 + wobble * 0.6;
  boss.coreMesh.rotation.y += delta * (phase === 2 ? 2.4 : 1.2);
  boss.coreMesh.rotation.x += delta * 0.7;

  const shielded = canDamageSpiderCore(boss) === false;
  boss.shieldMesh.visible = shielded;
  if (shielded) {
    const pulse = 0.16 + 0.06 * Math.sin(time * 5.2);
    const mat = boss.shieldMesh.material as THREE.MeshStandardMaterial;
    mat.opacity = pulse;
    mat.emissiveIntensity = 0.35 + pulse * 1.1;
    boss.shieldMesh.rotation.y += delta * 0.45;
  }

  const coreMat = boss.coreMesh.material as THREE.MeshStandardMaterial;
  const glow = (1 - rpmFrac) * 0.9 + collapseFrac * 1.3 + (phase === 2 ? 0.45 : 0.1);
  coreMat.emissive.setRGB(1.0, 0.4 + phase * 0.08, 0.08);
  coreMat.emissiveIntensity = glow;
  coreMat.color.setRGB(1.0, 0.6 + phase * 0.08, 0.25);

  const haloMat = boss.haloMesh.material as THREE.MeshStandardMaterial;
  haloMat.emissiveIntensity = shielded ? 0.35 : 0.65 + collapseFrac * 0.6;
  haloMat.color.set(aliveLegs <= boss.config.shieldLegThreshold ? 0xe89c42 : 0xd7ae5c);
}

export function isSpiderReliquaryDead(boss: SpiderReliquaryState): boolean {
  return boss.alive && boss.collidable.rpm <= 0;
}

export function destroySpiderReliquary(boss: SpiderReliquaryState): void {
  boss.alive = false;
  deregisterEntity(boss.id);
  untagCollidable(boss.collidable);
  const coreIdx = collidables.indexOf(boss.collidable);
  if (coreIdx !== -1) collidables.splice(coreIdx, 1);

  scene.remove(boss.bodyGroup);
  scene.remove(boss.hpGroup);

  for (const attack of boss.attacks) removeAttack(attack);
  boss.attacks.length = 0;

  for (const leg of boss.legs) {
    if (!leg.alive) continue;
    destroySpiderLeg(leg);
  }
}
