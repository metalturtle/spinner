import * as THREE from 'three';
import { lvZ, type LevelCircle, type LevelData, type LevelPolygon } from './levelLoader';
import { getCurrentGlobalLightingStateValues, getGlobalDirectionalLightDirection } from './renderer';
import { registerTopDownCullable } from './sceneCulling';

const TAU = Math.PI * 2;
const FLOOR_Y = 0.04;
const MIN_BLADES = 1200;
const MAX_BLADES = 60000;
const VERTS_PER_BLADE = 5;
const MAX_INTERACTORS = 12;
const MAX_LOCAL_LIGHTS = 8;
const GRASS_SIZE_MULT = 2.0;
const FLOOR_SURFACE_Y = 0.012;
const CIRCLE_FLOOR_SEGMENTS = 48;

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
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vShadeMix;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vUv = uv;
    vec3 cpos = position;
    vShadeMix = color.z;

    float waveSize = 10.0;
    float tipDistance = 0.145;
    float centerDistance = 0.062;
    float layerMotion = mix(0.55, 1.0, color.y);
    float phase = uTime * 1.85 + (uv.x * waveSize) + aRootWorld.x * 0.18 + aRootWorld.y * 0.13;
    float broadPhase = uTime * 0.7 + aRootWorld.x * 0.042 - aRootWorld.y * 0.035;
    vec2 meadowWind = vec2(
      sin(broadPhase) + 0.55 * cos(broadPhase * 0.63 + 1.7),
      cos(broadPhase * 0.88) + 0.45 * sin(broadPhase * 0.51 - 0.9)
    );

    if (color.x > 0.6) {
      cpos.x += sin(phase) * tipDistance * 1.2 * layerMotion;
      cpos.z += cos(phase * 0.8) * tipDistance * 0.72 * layerMotion;
    } else if (color.x > 0.0) {
      cpos.x += sin(phase) * centerDistance * 1.16 * layerMotion;
      cpos.z += cos(phase * 0.8) * centerDistance * 0.58 * layerMotion;
    }

    cpos.xz += meadowWind * color.x * 0.08 * layerMotion;

    vec2 push = vec2(0.0);
    float bendWeight = color.x * mix(0.48, 1.0, color.y);
    for (int i = 0; i < MAX_INTERACTORS; i += 1) {
      if (i >= uInteractorCount) break;
      vec4 interactor = uInteractors[i];
      vec4 flow = uInteractorFlow[i];
      vec2 delta = aRootWorld - interactor.xy;
      float baseDist = length(delta);
      vec2 fallbackDir = baseDist > 0.0001 ? delta / baseDist : vec2(1.0, 0.0);
      vec2 tangent = vec2(-fallbackDir.y, fallbackDir.x);
      float bladeNoise = hash21(aRootWorld * 0.081 + vec2(float(i) * 0.173, float(i) * 0.097));
      float flowInfluence = clamp(length(flow.xy) + flow.z * 0.14, 0.0, 1.0);
      vec2 flowDir = flowInfluence > 0.001 ? normalize(flow.xy + tangent * 0.08) : tangent;
      vec2 flowSide = vec2(-flowDir.y, flowDir.x);
      float along = dot(delta, flowDir);
      float across = dot(delta, flowSide);
      float aheadScale = mix(1.0, 0.82 + bladeNoise * 0.05, flowInfluence);
      float behindScale = mix(1.0, 1.38 + bladeNoise * 0.28, flowInfluence);
      float alongScale = along >= 0.0 ? aheadScale : behindScale;
      float sideScale = mix(1.0, 0.9 + bladeNoise * 0.16, flowInfluence * 0.72);
      float dist = length(vec2(along / max(alongScale, 0.001), across / max(sideScale, 0.001)));
      float noisyRadius = interactor.z * mix(0.82, 1.2, bladeNoise);
      if (dist >= noisyRadius) continue;

      float normDist = dist / noisyRadius;
      float falloff = pow(smoothstep(1.0, 0.0, normDist), 1.2);
      float coreZone = smoothstep(0.32 + bladeNoise * 0.12, 0.0, normDist);
      float outerZone = max(falloff - coreZone * 0.52, 0.0);
      vec2 dir = baseDist > 0.0001 ? delta / baseDist : vec2(1.0, 0.0);
      tangent = vec2(-dir.y, dir.x);
      float macroPhase = uTime * 0.92 + float(i) * 1.73;
      vec2 gustField = vec2(
        sin(macroPhase + aRootWorld.x * 0.055 + aRootWorld.y * 0.032),
        cos(macroPhase * 0.87 + aRootWorld.y * 0.05 - aRootWorld.x * 0.028)
      );
      vec2 gustDir = normalize(gustField + tangent * 0.62 + vec2(0.0001, 0.0));
      float gustAmp = 0.78 + 0.42 * sin(uTime * 1.6 + dist * 0.65 + float(i) * 1.91);
      float bladeResponse = mix(0.58, 1.0, bladeNoise) * mix(0.62, 1.0, color.y);
      vec2 corePush = (dir * (0.38 + flow.z * 0.2) + tangent * (0.18 + flow.z * 0.08)) * coreZone;
      vec2 rotorPush = mix(tangent, gustDir, 0.72) * (0.3 + flow.z * 0.2) * gustAmp * outerZone;
      vec2 radialPush = dir * (0.018 + flow.z * 0.016) * outerZone;
      float wakeAlign = max(dot(-dir, flow.xy), 0.0);
      vec2 wakePush = flow.xy * wakeAlign * (0.26 + flow.z * 0.09) * (coreZone * 0.28 + outerZone);
      push += (corePush + rotorPush + radialPush + wakePush) * interactor.w * bladeResponse;
    }

    cpos.xz += push * bendWeight * 0.74;

    vec4 worldPosition = modelMatrix * vec4(cpos, 1.0);
    vCloudUv = aRootWorld * 0.045 + vec2(uTime * 0.012, uTime * 0.008);
    vWorldPos = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const GRASS_FRAGMENT_SHADER = `
  #define MAX_LOCAL_LIGHTS ${MAX_LOCAL_LIGHTS}

  uniform sampler2D uGrassTex;
  uniform sampler2D uCloudTex;
  uniform vec3 uTint;
  uniform vec3 uAmbientColor;
  uniform float uAmbientIntensity;
  uniform vec3 uDirectionalColor;
  uniform float uDirectionalIntensity;
  uniform vec3 uDirectionalDirection;
  uniform int uLocalLightCount;
  uniform vec4 uLocalLights[MAX_LOCAL_LIGHTS];
  uniform vec4 uLocalLightColor[MAX_LOCAL_LIGHTS];

  varying vec2 vUv;
  varying vec2 vCloudUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vShadeMix;

  float grassDiffuse(vec3 normal, vec3 lightDir) {
    return clamp(abs(dot(normalize(normal), normalize(lightDir))), 0.0, 1.0);
  }

  void main() {
    float contrast = 1.45;
    float brightness = 0.08;
    vec3 color = texture2D(uGrassTex, vUv).rgb * contrast;
    color += vec3(brightness);
    color = mix(color, texture2D(uCloudTex, vCloudUv).rgb, 0.34);
    color *= uTint;
    color *= mix(0.66, 1.0, vShadeMix);

    vec3 normal = normalize(vWorldNormal);
    vec3 lighting = vec3(0.015);
    vec3 auraGlow = vec3(0.0);
    lighting += uAmbientColor * uAmbientIntensity * 0.8;

    float moonDiffuse = 0.15 + 0.85 * grassDiffuse(normal, uDirectionalDirection);
    lighting += uDirectionalColor * uDirectionalIntensity * moonDiffuse * 0.72;

    for (int i = 0; i < MAX_LOCAL_LIGHTS; i += 1) {
      if (i >= uLocalLightCount) break;
      vec4 localLight = uLocalLights[i];
      vec4 localLightColor = uLocalLightColor[i];
      vec3 toLight = localLight.xyz - vWorldPos;
      float distanceToLight = length(toLight);
      // float radius = max(localLight.w * 0.38, 0.001);
      float radius = localLight.w;
      if (distanceToLight >= radius) continue;

      float radial = 1.0 - (distanceToLight / radius);
      float attenuation = pow(radial, 3.8);
      float coreGlow = pow(radial, 8.0);
      float diffuse = 0.45 + 0.55 * grassDiffuse(normal, toLight);
      vec3 softenedLightColor = mix(vec3(1.0, 0.98, 0.92), localLightColor.rgb, 0.12);
      vec3 glowColor = mix(vec3(1.0, 0.9, 0.82), localLightColor.rgb, 0.18);
      float energy = localLightColor.w / 8.5;
      lighting += softenedLightColor * energy * attenuation * diffuse;
      auraGlow += glowColor * energy * coreGlow * 0.12;
    }

    gl_FragColor = vec4(color * lighting + auraGlow, 1.0);
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
  createFloorGeometry: () => THREE.BufferGeometry;
}

export interface GrassZoneVisual {
  root: THREE.Group;
  floor: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  boundsRadius: number;
  windSpeed: number;
  interactionRadius: number;
  interactionStrength: number;
  uniforms: {
    uTime: { value: number };
    uInteractorCount: { value: number };
    uInteractors: { value: THREE.Vector4[] };
    uInteractorFlow: { value: THREE.Vector4[] };
    uAmbientColor: { value: THREE.Color };
    uAmbientIntensity: { value: number };
    uDirectionalColor: { value: THREE.Color };
    uDirectionalIntensity: { value: number };
    uDirectionalDirection: { value: THREE.Vector3 };
    uLocalLightCount: { value: number };
    uLocalLights: { value: THREE.Vector4[] };
    uLocalLightColor: { value: THREE.Vector4[] };
  };
  unregisterCull: () => void;
}

interface RankedLocalLight {
  light: THREE.PointLight;
  weight: number;
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

function buildLocalFloorShape(
  center: { x: number; z: number },
  outer: { x: number; z: number }[],
  holes: { x: number; z: number }[][],
): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(outer[0].x - center.x, center.z - outer[0].z);
  for (let i = 1; i < outer.length; i += 1) {
    shape.lineTo(outer[i].x - center.x, center.z - outer[i].z);
  }
  shape.closePath();

  for (const hole of holes) {
    if (hole.length < 3) continue;
    const holePath = new THREE.Path();
    holePath.moveTo(hole[0].x - center.x, center.z - hole[0].z);
    for (let i = 1; i < hole.length; i += 1) {
      holePath.lineTo(hole[i].x - center.x, center.z - hole[i].z);
    }
    holePath.closePath();
    shape.holes.push(holePath);
  }

  return shape;
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
    createFloorGeometry() {
      const floorShape = buildLocalFloorShape(center, outer, holes);
      const geometry = new THREE.ShapeGeometry(floorShape);
      geometry.rotateX(-Math.PI / 2);
      return geometry;
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
    createFloorGeometry() {
      const geometry = new THREE.CircleGeometry(circle.radius, CIRCLE_FLOOR_SEGMENTS);
      geometry.rotateX(-Math.PI / 2);
      return geometry;
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
  bendResponse: number,
  shadeMix: number,
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

  const black: [number, number, number] = [0, bendResponse, shadeMix];
  const gray: [number, number, number] = [0.5, bendResponse, shadeMix];
  const white: [number, number, number] = [1, bendResponse, shadeMix];
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
  const bladeCount = Math.max(MIN_BLADES, Math.min(MAX_BLADES, Math.round(shape.area * density * 24)));
  const tallBladeCount = Math.max(1, Math.round(bladeCount * 0.62));
  const underBladeCount = Math.max(0, bladeCount - tallBladeCount);
  const interactionRadius = Math.max(1.8, Math.min(6.5, shape.radius * 0.28 + 1.8));

  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const roots: number[] = [];
  const indices: number[] = [];

  const baseWidth = 0.12 * GRASS_SIZE_MULT;
  const baseHeight = Math.max(0.55, grassHeight * 0.36) * GRASS_SIZE_MULT;
  const heightVariation = Math.max(0.12, grassHeight * 0.22) * GRASS_SIZE_MULT;
  const underWidth = baseWidth * 1.18;
  const underHeight = Math.max(0.34, baseHeight * 0.54);
  const underVariation = Math.max(0.08, heightVariation * 0.38);

  for (let i = 0; i < tallBladeCount; i += 1) {
    const point = shape.samplePoint();
    const local = new THREE.Vector3(point.x - shape.center.x, FLOOR_Y, point.z - shape.center.z);
    const uv = shape.uvForPoint(point);
    const blade = generateBlade(
      local,
      point,
      uv,
      i * VERTS_PER_BLADE,
      baseWidth,
      baseHeight,
      heightVariation,
      1.0,
      1.0,
    );
    for (const vert of blade.verts) {
      positions.push(...vert.pos);
      uvs.push(...vert.uv);
      colors.push(...vert.color);
      roots.push(...vert.root);
    }
    indices.push(...blade.indices);
  }

  for (let i = 0; i < underBladeCount; i += 1) {
    const point = shape.samplePoint();
    const jitterAngle = Math.random() * TAU;
    const jitterRadius = Math.random() * 0.16;
    const jittered = {
      x: point.x + Math.cos(jitterAngle) * jitterRadius,
      z: point.z + Math.sin(jitterAngle) * jitterRadius,
    };
    const local = new THREE.Vector3(jittered.x - shape.center.x, FLOOR_Y - 0.006, jittered.z - shape.center.z);
    const uv = shape.uvForPoint(jittered);
    const blade = generateBlade(
      local,
      jittered,
      uv,
      (tallBladeCount + i) * VERTS_PER_BLADE,
      underWidth,
      underHeight,
      underVariation,
      0.24,
      0.68,
    );
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
  const localLightUniforms = Array.from({ length: MAX_LOCAL_LIGHTS }, () => new THREE.Vector4(0, 0, 0, 0));
  const localLightColorUniforms = Array.from({ length: MAX_LOCAL_LIGHTS }, () => new THREE.Vector4(0, 0, 0, 0));
  const floorGeometry = shape.createFloorGeometry();
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: color.clone().multiplyScalar(0.4),
    roughness: 0.95,
    metalness: 0.02,
  });
  const uniforms = {
    uTime: { value: 0 },
    uGrassTex: { value: grassTexture },
    uCloudTex: { value: cloudTexture },
    uTint: { value: color },
    uInteractorCount: { value: 0 },
    uInteractors: { value: interactorUniforms },
    uInteractorFlow: { value: interactorFlowUniforms },
    uAmbientColor: { value: new THREE.Color(0xffffff) },
    uAmbientIntensity: { value: 0 },
    uDirectionalColor: { value: new THREE.Color(0xcccccc) },
    uDirectionalIntensity: { value: 1.2 },
    uDirectionalDirection: { value: new THREE.Vector3(0.408, 0.816, 0.408) },
    uLocalLightCount: { value: 0 },
    uLocalLights: { value: localLightUniforms },
    uLocalLightColor: { value: localLightColorUniforms },
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
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.position.y = FLOOR_SURFACE_Y;
  floor.receiveShadow = true;
  root.add(floor);
  const mesh = new THREE.Mesh(geometry, material);
  root.add(mesh);
  scene.add(root);
  const unregisterCull = registerTopDownCullable(root, shape.radius + 1.8);

  return {
    root,
    floor,
    mesh,
    boundsRadius: shape.radius,
    windSpeed,
    interactionRadius,
    interactionStrength: 1.15 + windLean * 0.85,
    uniforms: {
      uTime: uniforms.uTime,
      uInteractorCount: uniforms.uInteractorCount,
      uInteractors: uniforms.uInteractors,
      uInteractorFlow: uniforms.uInteractorFlow,
      uAmbientColor: uniforms.uAmbientColor,
      uAmbientIntensity: uniforms.uAmbientIntensity,
      uDirectionalColor: uniforms.uDirectionalColor,
      uDirectionalIntensity: uniforms.uDirectionalIntensity,
      uDirectionalDirection: uniforms.uDirectionalDirection,
      uLocalLightCount: uniforms.uLocalLightCount,
      uLocalLights: uniforms.uLocalLights,
      uLocalLightColor: uniforms.uLocalLightColor,
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
  auraLights: readonly THREE.PointLight[],
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

  const lighting = getCurrentGlobalLightingStateValues();
  zone.uniforms.uAmbientColor.value.copy(lighting.ambientColor);
  zone.uniforms.uAmbientIntensity.value = lighting.ambientIntensity;
  zone.uniforms.uDirectionalColor.value.copy(lighting.directionalColor);
  zone.uniforms.uDirectionalIntensity.value = lighting.directionalIntensity;
  getGlobalDirectionalLightDirection(zone.uniforms.uDirectionalDirection.value);

  const rankedLights: RankedLocalLight[] = [];
  const zoneCenter = zone.root.position;
  const effectiveRadius = zone.boundsRadius;
  for (const light of auraLights) {
    if (light.intensity <= 0.001 || light.distance <= 0.001) continue;
    const dx = light.position.x - zoneCenter.x;
    const dy = light.position.y - FLOOR_Y;
    const dz = light.position.z - zoneCenter.z;
    const distanceToZone = Math.hypot(dx, dy, dz);
    const reach = light.distance + effectiveRadius;
    if (distanceToZone >= reach) continue;

    rankedLights.push({
      light,
      weight: light.intensity * (1 - distanceToZone / reach),
    });
  }

  rankedLights.sort((a, b) => b.weight - a.weight);
  const localLightCount = Math.min(MAX_LOCAL_LIGHTS, rankedLights.length);
  zone.uniforms.uLocalLightCount.value = localLightCount;

  for (let i = 0; i < MAX_LOCAL_LIGHTS; i += 1) {
    const lightTarget = zone.uniforms.uLocalLights.value[i];
    const colorTarget = zone.uniforms.uLocalLightColor.value[i];
    const ranked = i < localLightCount ? rankedLights[i] : null;
    if (!ranked) {
      lightTarget.set(0, 0, 0, 0);
      colorTarget.set(0, 0, 0, 0);
      continue;
    }

    lightTarget.set(
      ranked.light.position.x,
      ranked.light.position.y,
      ranked.light.position.z,
      ranked.light.distance,
    );
    colorTarget.set(
      ranked.light.color.r,
      ranked.light.color.g,
      ranked.light.color.b,
      ranked.light.intensity,
    );
  }
}

export function destroyGrassZoneVisual(scene: THREE.Scene, zone: GrassZoneVisual): void {
  zone.unregisterCull();
  scene.remove(zone.root);
  zone.floor.geometry.dispose();
  zone.floor.material.dispose();
  zone.mesh.geometry.dispose();
  zone.mesh.material.dispose();
}
