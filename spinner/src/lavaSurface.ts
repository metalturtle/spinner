import * as THREE from 'three';

const lavaMaterials = new Set<THREE.ShaderMaterial>();

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform float uTime;
uniform vec2 uResolution;
uniform float uScale;
varying vec2 vUv;

void main() {
  vec2 u = vUv * uResolution * uScale;
  vec2 R = vec2(0.0, uResolution.y + sin(uTime / 25.0) * 8.24);
  vec2 p = 5.0 * ((u + u) + vec2(800.0, cos((uTime + 5.0) / 10.0) * 4000.0) - R) / R.y;
  vec2 r = vec2(0.0);

  for (float f = 1.0; f < 40.0; f *= 1.05) {
    r += sin(p * f + uTime * 0.85) / f;
    p = p * mat2(8.0, 6.0, -8.0, 6.0) * 0.1 + r * 0.4;
  }

  float l = length(r);
  vec3 fire = vec3(l * 0.29, l * l * 0.024, l * l * l * 0.0016);
  vec3 lava = mix(vec3(0.09, 0.01, 0.0), vec3(1.35, 0.34, 0.04), clamp(fire * 1.7, 0.0, 1.0));
  lava += vec3(1.0, 0.48, 0.08) * pow(clamp(l, 0.0, 1.0), 6.0) * 0.45;

  gl_FragColor = vec4(lava, 1.0);
}
`;

export function createLavaMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(512, 512) },
      uScale: { value: 0.3 },
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    toneMapped: false,
  });

  lavaMaterials.add(material);
  return material;
}

export function updateLavaSurfaces(time: number): void {
  for (const material of lavaMaterials) {
    material.uniforms.uTime.value = time;
  }
}

export function disposeLavaMaterial(material: THREE.Material): void {
  if (material instanceof THREE.ShaderMaterial) {
    lavaMaterials.delete(material);
  }
  material.dispose();
}
