import * as THREE from 'three';
import { lvZ, type LevelCircle, type LevelData, type LevelPolygon } from './levelLoader';
import { registerTopDownCullable } from './sceneCulling';

const TAU = Math.PI * 2;
const FLOOR_Y = 0.04;
const MIN_BLADES = 1200;
const MAX_BLADES = 60000;
const VERTS_PER_BLADE = 5;
const MAX_INTERACTORS = 12;
const GRASS_SIZE_MULT = 2.0;

const textureLoader = new THREE.TextureLoader();
const grassTextureUrl = new URL('../../three-grass-demo/dist/grass.jpg', import.meta.url).href;
const cloudTextureUrl = new URL('../../three-grass-demo/dist/cloud.jpg', import.meta.url).href;

function configureTexture(texture: THREE.Texture, repeat: boolean): THREE.Texture {
  texture.wrapS = texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const grassTexture = configureTexture(textureLoader.load(grassTextureUrl), false);
const cloudTexture = configureTexture(textureLoader.load(cloudTextureUrl), true);

const GRASS_VERTEX_SHADER = `
  #define MAX_INTERACTORS ${MAX_INTERACTORS}

  uniform float uTime;
  uniform int uInteractorCount;
  uniform vec4 uInteractors[MAX_INTERACTORS];
  uniform vec4 uInteractorFlow[MAX_INTERACTORS];

  attribute vec2 aRootWorld;

  varying vec2 vUv;
  varying vec2 vCloudUv;

  void main() {
    vUv = uv;
    vec3 cpos = position;

    float waveSize = 10.0;
    float tipDistance = 0.145;
    float centerDistance = 0.062;
    float phase = uTime * 1.85 + (uv.x * waveSize) + aRootWorld.x * 0.18 + aRootWorld.y * 0.13;
    float broadPhase = uTime * 0.7 + aRootWorld.x * 0.042 - aRootWorld.y * 0.035;
    vec2 meadowWind = vec2(
      sin(broadPhase) + 0.55 * cos(broadPhase * 0.63 + 1.7),
      cos(broadPhase * 0.88) + 0.45 * sin(broadPhase * 0.51 - 0.9)
    );

    if (color.x > 0.6) {
      cpos.x += sin(phase) * tipDistance * 1.2;
      cpos.z += cos(phase * 0.8) * tipDistance * 0.72;
    } else if (color.x > 0.0) {
      cpos.x += sin(phase) * centerDistance * 1.16;
      cpos.z += cos(phase * 0.8) * centerDistance * 0.58;
    }

    cpos.xz += meadowWind * color.x * 0.08;

    vec2 push = vec2(0.0);
    float bendWeight = color.x;
    for (int i = 0; i < MAX_INTERACTORS; i += 1) {
      if (i >= uInteractorCount) break;
      vec4 interactor = uInteractors[i];
      vec4 flow = uInteractorFlow[i];
      vec2 delta = aRootWorld - interactor.xy;
      float dist = length(delta);
      if (dist >= interactor.z) continue;

      float normDist = dist / interactor.z;
      float falloff = smoothstep(1.0, 0.0, normDist);
      float coreZone = smoothstep(0.46, 0.0, normDist);
      float outerZone = max(falloff - coreZone * 0.72, 0.0);
      vec2 dir = dist > 0.0001 ? delta / dist : vec2(1.0, 0.0);
      vec2 tangent = vec2(-dir.y, dir.x);
      float macroPhase = uTime * 0.92 + float(i) * 1.73;
      vec2 gustField = vec2(
        sin(macroPhase + aRootWorld.x * 0.055 + aRootWorld.y * 0.032),
        cos(macroPhase * 0.87 + aRootWorld.y * 0.05 - aRootWorld.x * 0.028)
      );
      vec2 gustDir = normalize(gustField + tangent * 0.62 + vec2(0.0001, 0.0));
      float gustAmp = 0.78 + 0.42 * sin(uTime * 1.6 + dist * 0.65 + float(i) * 1.91);
      vec2 corePush = (dir * (0.62 + flow.z * 0.34) + tangent * (0.12 + flow.z * 0.07)) * coreZone;
      vec2 rotorPush = mix(tangent, gustDir, 0.6) * (0.34 + flow.z * 0.22) * gustAmp * outerZone;
      vec2 radialPush = dir * (0.04 + flow.z * 0.025) * outerZone;
      float wakeAlign = max(dot(-dir, flow.xy), 0.0);
      vec2 wakePush = flow.xy * wakeAlign * (0.13 + flow.z * 0.07) * outerZone;
      push += (corePush + rotorPush + radialPush + wakePush) * interactor.w;
    }

    cpos.xz += push * bendWeight * 0.92;

    vec4 worldPosition = modelMatrix * vec4(cpos, 1.0);
    vCloudUv = aRootWorld * 0.045 + vec2(uTime * 0.012, uTime * 0.008);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const GRASS_FRAGMENT_SHADER = `
  uniform sampler2D uGrassTex;
  uniform sampler2D uCloudTex;
  uniform vec3 uTint;

  varying vec2 vUv;
  varying vec2 vCloudUv;

  void main() {
    float contrast = 1.45;
    float brightness = 0.08;
    vec3 color = texture2D(uGrassTex, vUv).rgb * contrast;
    color += vec3(brightness);
    color = mix(color, texture2D(uCloudTex, vCloudUv).rgb, 0.34);
    color *= uTint;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export interface GrassInteractor {
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  spin: number;
  dirX: number;
  dirZ: number;
}

interface ZoneShape {
  center: { x: number; z: number };
  area: number;
  radius: number;
  samplePoint: () => { x: number; z: number };
  uvForPoint: (point: { x: number; z: number }) => [number, number];
}

export interface GrassZoneVisual {
  root: THREE.Group;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  windSpeed: number;
  interactionRadius: number;
  interactionStrength: number;
  uniforms: {
    uTime: { value: number };
    uInteractorCount: { value: number };
    uInteractors: { value: THREE.Vector4[] };
    uInteractorFlow: { value: THREE.Vector4[] };
  };
  unregisterCull: () => void;
}

function parseBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

function parseNumber(value: unknown, fallback: number, min?: number): number {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return min === undefined ? parsed : Math.max(min, parsed);
}

function parseColor(value: unknown, fallback: string): THREE.Color {
  try {
    return new THREE.Color(typeof value === 'string' && value.trim() ? value : fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

function isPointInPolygon(point: { x: number; z: number }, vertices: { x: number; z: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x;
    const zi = vertices[i].z;
    const xj = vertices[j].x;
    const zj = vertices[j].z;
    const intersects = ((zi > point.z) !== (zj > point.z))
      && (point.x < ((xj - xi) * (point.z - zi)) / ((zj - zi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonSignedArea(vertices: { x: number; z: number }[]): number {
  let area = 0;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    area += vertices[j].x * vertices[i].z - vertices[i].x * vertices[j].z;
  }
  return area * 0.5;
}

function hasGrassZoneProperties(props: Record<string, unknown> | undefined): boolean {
  if (props?.grassEnabled !== undefined) return parseBoolean(props.grassEnabled);
  return props?.grassColor !== undefined
    || props?.grassDensity !== undefined
    || props?.grassHeight !== undefined
    || props?.grassLean !== undefined
    || props?.grassWind !== undefined;
}

function buildPolygonShape(poly: LevelPolygon): ZoneShape | null {
  if (poly.layer !== 'trigger' || poly.vertices.length < 3) return null;
  if (!hasGrassZoneProperties(poly.properties)) return null;

  const outer = poly.vertices.map((vertex) => ({ x: vertex.x, z: lvZ(vertex.y) }));
  const holes = (poly.holes ?? []).map((hole) => hole.map((vertex) => ({ x: vertex.x, z: lvZ(vertex.y) })));

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const vertex of outer) {
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minZ = Math.min(minZ, vertex.z);
    maxZ = Math.max(maxZ, vertex.z);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return null;
  }

  const holeArea = holes.reduce((sum, hole) => sum + Math.abs(polygonSignedArea(hole)), 0);
  const area = Math.abs(polygonSignedArea(outer)) - holeArea;
  if (area <= 0.01) return null;

  const center = { x: (minX + maxX) * 0.5, z: (minZ + maxZ) * 0.5 };
  const halfSpan = Math.max(maxX - minX, maxZ - minZ) * 0.5;
  const radius = Math.max(halfSpan, 0.001);
  const contains = (point: { x: number; z: number }): boolean => {
    if (!isPointInPolygon(point, outer)) return false;
    return !holes.some((hole) => hole.length >= 3 && isPointInPolygon(point, hole));
  };

  return {
    center,
    area,
    radius,
    samplePoint() {
      for (let attempt = 0; attempt < 48; attempt += 1) {
        const point = {
          x: THREE.MathUtils.lerp(minX, maxX, Math.random()),
          z: THREE.MathUtils.lerp(minZ, maxZ, Math.random()),
        };
        if (contains(point)) return point;
      }
      return center;
    },
    uvForPoint(point) {
      return [
        THREE.MathUtils.clamp((point.x - minX) / Math.max(0.001, maxX - minX), 0, 1),
        THREE.MathUtils.clamp((point.z - minZ) / Math.max(0.001, maxZ - minZ), 0, 1),
      ];
    },
  };
}

function buildCircleShape(circle: LevelCircle): ZoneShape | null {
  if (circle.layer !== 'trigger' || circle.radius <= 0) return null;
  if (!hasGrassZoneProperties(circle.properties)) return null;

  const center = { x: circle.center.x, z: lvZ(circle.center.y) };
  return {
    center,
    area: Math.PI * circle.radius * circle.radius,
    radius: circle.radius,
    samplePoint() {
      const angle = Math.random() * TAU;
      const distance = Math.sqrt(Math.random()) * circle.radius;
      return {
        x: center.x + Math.cos(angle) * distance,
        z: center.z + Math.sin(angle) * distance,
      };
    },
    uvForPoint(point) {
      return [
        THREE.MathUtils.clamp((point.x - (center.x - circle.radius)) / Math.max(0.001, circle.radius * 2), 0, 1),
        THREE.MathUtils.clamp((point.z - (center.z - circle.radius)) / Math.max(0.001, circle.radius * 2), 0, 1),
      ];
    },
  };
}

function convertRange(val: number, oldMin: number, oldMax: number, newMin: number, newMax: number): number {
  return (((val - oldMin) * (newMax - newMin)) / (oldMax - oldMin)) + newMin;
}

function generateBlade(
  localCenter: THREE.Vector3,
  worldRoot: { x: number; z: number },
  uv: [number, number],
  vertexOffset: number,
  baseWidth: number,
  baseHeight: number,
  heightVariation: number,
): {
  verts: Array<{ pos: number[]; uv: [number, number]; color: [number, number, number]; root: [number, number] }>;
  indices: number[];
} {
  const midWidth = baseWidth * 0.5;
  const tipOffset = 0.1;
  const height = baseHeight + (Math.random() * heightVariation);

  const yaw = Math.random() * Math.PI * 2;
  const yawUnitVec = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  const tipBend = Math.random() * Math.PI * 2;
  const tipBendUnitVec = new THREE.Vector3(Math.sin(tipBend), 0, -Math.cos(tipBend));

  const bl = new THREE.Vector3().addVectors(localCenter, new THREE.Vector3().copy(yawUnitVec).multiplyScalar((baseWidth / 2) * 1));
  const br = new THREE.Vector3().addVectors(localCenter, new THREE.Vector3().copy(yawUnitVec).multiplyScalar((baseWidth / 2) * -1));
  const tl = new THREE.Vector3().addVectors(localCenter, new THREE.Vector3().copy(yawUnitVec).multiplyScalar((midWidth / 2) * 1));
  const tr = new THREE.Vector3().addVectors(localCenter, new THREE.Vector3().copy(yawUnitVec).multiplyScalar((midWidth / 2) * -1));
  const tc = new THREE.Vector3().addVectors(localCenter, new THREE.Vector3().copy(tipBendUnitVec).multiplyScalar(tipOffset));

  tl.y += height / 2;
  tr.y += height / 2;
  tc.y += height;

  const black: [number, number, number] = [0, 0, 0];
  const gray: [number, number, number] = [0.5, 0.5, 0.5];
  const white: [number, number, number] = [1, 1, 1];
  const root: [number, number] = [worldRoot.x, worldRoot.z];

  const verts = [
    { pos: bl.toArray(), uv, color: black, root },
    { pos: br.toArray(), uv, color: black, root },
    { pos: tr.toArray(), uv, color: gray, root },
    { pos: tl.toArray(), uv, color: gray, root },
    { pos: tc.toArray(), uv, color: white, root },
  ];

  const indices = [
    vertexOffset,
    vertexOffset + 1,
    vertexOffset + 2,
    vertexOffset + 2,
    vertexOffset + 4,
    vertexOffset + 3,
    vertexOffset + 3,
    vertexOffset,
    vertexOffset + 2,
  ];

  return { verts, indices };
}

function createZoneVisual(
  scene: THREE.Scene,
  props: Record<string, unknown> | undefined,
  shape: ZoneShape,
): GrassZoneVisual {
  const density = parseNumber(props?.grassDensity, 1.5, 0.1);
  const grassHeight = parseNumber(props?.grassHeight, 2.2, 0.3);
  const windLean = parseNumber(props?.grassLean, 0.22, 0);
  const windSpeed = parseNumber(props?.grassWind, 0.85, 0);
  const color = parseColor(props?.grassColor, '#86b74d');
  const bladeCount = Math.max(MIN_BLADES, Math.min(MAX_BLADES, Math.round(shape.area * density * 18)));
  const interactionRadius = Math.max(1.8, Math.min(6.5, shape.radius * 0.28 + 1.8));

  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const roots: number[] = [];
  const indices: number[] = [];

  const baseWidth = 0.12 * GRASS_SIZE_MULT;
  const baseHeight = Math.max(0.55, grassHeight * 0.36) * GRASS_SIZE_MULT;
  const heightVariation = Math.max(0.12, grassHeight * 0.22) * GRASS_SIZE_MULT;

  for (let i = 0; i < bladeCount; i += 1) {
    const point = shape.samplePoint();
    const local = new THREE.Vector3(point.x - shape.center.x, FLOOR_Y, point.z - shape.center.z);
    const uv = shape.uvForPoint(point);
    const blade = generateBlade(local, point, uv, i * VERTS_PER_BLADE, baseWidth, baseHeight, heightVariation);
    for (const vert of blade.verts) {
      positions.push(...vert.pos);
      uvs.push(...vert.uv);
      colors.push(...vert.color);
      roots.push(...vert.root);
    }
    indices.push(...blade.indices);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute('aRootWorld', new THREE.BufferAttribute(new Float32Array(roots), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const interactorUniforms = Array.from({ length: MAX_INTERACTORS }, () => new THREE.Vector4(9999, 9999, 0, 0));
  const interactorFlowUniforms = Array.from({ length: MAX_INTERACTORS }, () => new THREE.Vector4(0, 0, 0, 0));
  const uniforms = {
    uTime: { value: 0 },
    uGrassTex: { value: grassTexture },
    uCloudTex: { value: cloudTexture },
    uTint: { value: color },
    uInteractorCount: { value: 0 },
    uInteractors: { value: interactorUniforms },
    uInteractorFlow: { value: interactorFlowUniforms },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: GRASS_VERTEX_SHADER,
    fragmentShader: GRASS_FRAGMENT_SHADER,
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    toneMapped: false,
  });

  const root = new THREE.Group();
  root.position.set(shape.center.x, 0, shape.center.z);
  const mesh = new THREE.Mesh(geometry, material);
  root.add(mesh);
  scene.add(root);
  const unregisterCull = registerTopDownCullable(root, shape.radius + 1.8);

  return {
    root,
    mesh,
    windSpeed,
    interactionRadius,
    interactionStrength: 1.15 + windLean * 0.85,
    uniforms: {
      uTime: uniforms.uTime,
      uInteractorCount: uniforms.uInteractorCount,
      uInteractors: uniforms.uInteractors,
      uInteractorFlow: uniforms.uInteractorFlow,
    },
    unregisterCull,
  };
}

export function createGrassZoneVisuals(scene: THREE.Scene, level: LevelData): GrassZoneVisual[] {
  const visuals: GrassZoneVisual[] = [];

  for (const poly of level.polygons ?? []) {
    const shape = buildPolygonShape(poly);
    if (!shape) continue;
    visuals.push(createZoneVisual(scene, poly.properties, shape));
  }

  for (const circle of level.circles ?? []) {
    const shape = buildCircleShape(circle);
    if (!shape) continue;
    visuals.push(createZoneVisual(scene, circle.properties, shape));
  }

  return visuals;
}

export function updateGrassZoneVisual(
  zone: GrassZoneVisual,
  time: number,
  _delta: number,
  interactors: readonly GrassInteractor[],
): void {
  zone.uniforms.uTime.value = time * zone.windSpeed;

  const count = Math.min(MAX_INTERACTORS, interactors.length);
  zone.uniforms.uInteractorCount.value = count;
  for (let i = 0; i < MAX_INTERACTORS; i += 1) {
    const target = zone.uniforms.uInteractors.value[i];
    const flow = zone.uniforms.uInteractorFlow.value[i];
    const interactor = i < count ? interactors[i] : null;
    if (!interactor) {
      target.set(9999, 9999, 0, 0);
      flow.set(0, 0, 0, 0);
      continue;
    }
    const speed = Math.hypot(interactor.vx, interactor.vz);
    const spinStrength = interactor.spin * 1.25;
    const strength = Math.min(3.8, 1.28 + speed * 0.036 + spinStrength * 1.08) * zone.interactionStrength;
    target.set(interactor.x, interactor.z, zone.interactionRadius + interactor.radius * 1.7, strength);
    flow.set(interactor.dirX, interactor.dirZ, interactor.spin, 0);
  }
}

export function destroyGrassZoneVisual(scene: THREE.Scene, zone: GrassZoneVisual): void {
  zone.unregisterCull();
  scene.remove(zone.root);
  zone.mesh.geometry.dispose();
  zone.mesh.material.dispose();
}
