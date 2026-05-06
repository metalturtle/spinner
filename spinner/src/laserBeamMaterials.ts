import * as THREE from 'three';
import { TextureManager } from './textureUtils';

const fallbackNoiseTexture = new THREE.DataTexture(
  new Uint8Array([
    96, 128, 160, 255,
    182, 74, 121, 255,
    138, 196, 102, 255,
    220, 110, 84, 255,
  ]),
  2,
  2,
  THREE.RGBAFormat,
);
fallbackNoiseTexture.wrapS = THREE.RepeatWrapping;
fallbackNoiseTexture.wrapT = THREE.RepeatWrapping;
fallbackNoiseTexture.magFilter = THREE.LinearFilter;
fallbackNoiseTexture.minFilter = THREE.LinearFilter;
fallbackNoiseTexture.colorSpace = THREE.NoColorSpace;
fallbackNoiseTexture.needsUpdate = true;

let cachedNoiseTexture: THREE.Texture | null = null;

function getNoiseTexture(): THREE.Texture {
  if (cachedNoiseTexture) return cachedNoiseTexture;
  const texture = TextureManager.get('perlinnoise') ?? fallbackNoiseTexture;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  cachedNoiseTexture = texture;
  return cachedNoiseTexture;
}

const LASER_GLOW_VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LASER_GLOW_FRAGMENT_SHADER = `
  uniform sampler2D uNoiseMap;
  uniform vec3 uCoreColor;
  uniform vec3 uHaloColor;
  uniform float uOpacity;
  uniform float uTime;

  varying vec2 vUv;

  float gaussian(float x, float sigma) {
    return exp(-(x * x) / max(0.0001, 2.0 * sigma * sigma));
  }

  void main() {
    float cross = (vUv.x - 0.5) * 2.0;
    float endFade = smoothstep(0.0, 0.07, vUv.y) * (1.0 - smoothstep(0.91, 1.0, vUv.y));
    vec2 noiseUv = vec2(vUv.y * 3.6 - uTime * 0.45, vUv.x * 4.0 + uTime * 0.12);
    float noise = texture2D(uNoiseMap, noiseUv).r;
    float streak = 0.78 + 0.22 * sin(vUv.y * 42.0 - uTime * 13.5 + noise * 6.2831853);

    float halo = gaussian(cross, 0.42);
    float core = gaussian(cross, 0.14);
    float filament = gaussian(cross + (noise - 0.5) * 0.18, 0.09);

    float alpha = (halo * 0.34 + core * 0.58 + filament * 0.45) * endFade * uOpacity * streak;
    if (alpha <= 0.002) discard;

    vec3 color = mix(uHaloColor, uCoreColor, clamp(core + filament * 0.7, 0.0, 1.0));
    color += uCoreColor * filament * 0.5;
    gl_FragColor = vec4(color, alpha);
  }
`;

const LASER_REFRACTION_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec4 vClipPos;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vClipPos = projectionMatrix * viewMatrix * worldPos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LASER_REFRACTION_FRAGMENT_SHADER = `
  uniform sampler2D uSceneTexture;
  uniform sampler2D uNoiseMap;
  uniform vec2 uTexelSize;
  uniform vec3 uTint;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uRefractionStrength;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec4 vClipPos;

  float gaussian(float x, float sigma) {
    return exp(-(x * x) / max(0.0001, 2.0 * sigma * sigma));
  }

  void main() {
    vec2 screenUv = (vClipPos.xy / max(vClipPos.w, 0.0001)) * 0.5 + 0.5;
    float cross = (vUv.x - 0.5) * 2.0;
    float endFade = smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.9, 1.0, vUv.y));
    float shell = gaussian(cross, 0.5);
    float shellThin = gaussian(cross, 0.22);

    vec2 noiseUvA = vec2(vUv.y * 3.1 - uTime * 0.38 + vWorldPos.x * 0.045, vUv.x * 3.8 + uTime * 0.11);
    vec2 noiseUvB = vec2(vUv.y * 5.6 + uTime * 0.19 + vWorldPos.z * 0.03, vUv.x * 2.5 - uTime * 0.07);
    vec2 noiseA = texture2D(uNoiseMap, noiseUvA).rg * 2.0 - 1.0;
    vec2 noiseB = texture2D(uNoiseMap, noiseUvB).rg * 2.0 - 1.0;
    vec2 distortion = (noiseA * 0.62 + noiseB * 0.38) * shell * endFade;

    vec2 sampleUv = clamp(screenUv + distortion * (uTexelSize * uRefractionStrength), vec2(0.001), vec2(0.999));
    vec3 sceneColor = texture2D(uSceneTexture, sampleUv).rgb;

    float gleam = shellThin * (0.16 + 0.12 * sin(vUv.y * 34.0 - uTime * 8.0 + noiseA.x * 5.0));
    vec3 refracted = mix(sceneColor, sceneColor * (1.0 + uTint * 0.22), 0.26 * shell);
    refracted += uTint * gleam;

    float alpha = uOpacity * (shell * 0.56 + shellThin * 0.18) * endFade;
    if (alpha <= 0.002) discard;

    gl_FragColor = vec4(refracted, alpha);
  }
`;

export function createLaserGlowMaterial(
  coreColor: THREE.ColorRepresentation,
  haloColor: THREE.ColorRepresentation,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uNoiseMap: { value: getNoiseTexture() },
      uCoreColor: { value: new THREE.Color(coreColor) },
      uHaloColor: { value: new THREE.Color(haloColor) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: LASER_GLOW_VERTEX_SHADER,
    fragmentShader: LASER_GLOW_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function createLaserRefractionMaterial(
  tint: THREE.ColorRepresentation,
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSceneTexture: { value: null },
      uNoiseMap: { value: getNoiseTexture() },
      uTexelSize: { value: new THREE.Vector2(1, 1) },
      uTint: { value: new THREE.Color(tint) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uRefractionStrength: { value: 28.0 },
    },
    vertexShader: LASER_REFRACTION_VERTEX_SHADER,
    fragmentShader: LASER_REFRACTION_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  material.userData.isMirrorRefractionMaterial = true;
  return material;
}
