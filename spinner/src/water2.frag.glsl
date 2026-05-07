precision highp float;

uniform sampler2D iChannel0;
uniform sampler2D iChannel2;
uniform sampler2D uRippleState;
uniform vec2 uRippleTexel;
uniform vec2 uWorldMin;
uniform vec2 uWorldSize;
uniform vec3 uCameraPos;
uniform vec3 uTint;

varying vec2 vUv;
varying vec3 vWorldPos;

#define pi 3.1415927

vec3 degamma(vec3 c) { return pow(c, vec3(2.2)); }
vec3 gammaEnc(vec3 c) { return pow(c, vec3(1.0 / 1.6)); }

vec2 dirToEquirect(vec3 d) {
  d = normalize(d);
  float u = atan(d.z, d.x) / (2.0 * pi) + 0.5;
  float v = asin(clamp(d.y, -1.0, 1.0)) / pi + 0.5;
  return vec2(u, v);
}

float sampleHeight(vec2 simUv) {
  return texture2D(uRippleState, clamp(simUv, vec2(0.0), vec2(1.0))).r * 2.0 - 1.0;
}

void main() {
  vec2 simUv = clamp((vWorldPos.xz - uWorldMin) / max(uWorldSize, vec2(0.001)), vec2(0.0), vec2(1.0));

  float h = sampleHeight(simUv);
  float hx = sampleHeight(simUv + vec2(uRippleTexel.x, 0.0));
  float hy = sampleHeight(simUv + vec2(0.0, uRippleTexel.y));
  vec2 grad = vec2(hx - h, hy - h);
  float rippleEnergy = clamp(length(grad) * 28.0 + abs(h) * 0.95, 0.0, 1.0);
  float normalStrength = mix(3.0, 4.8, rippleEnergy);
  float distortionStrength = mix(0.075, 0.12, rippleEnergy);

  vec3 nWorld = normalize(vec3(grad.x * normalStrength, 1.0, grad.y * normalStrength));
  vec3 E = normalize(uCameraPos - vWorldPos);
  vec3 rv = reflect(-E, nWorld);
  vec3 reflectColor = degamma(texture2D(iChannel2, dirToEquirect(rv)).xyz);

  vec2 distortedUv = vUv + grad * distortionStrength;
  vec3 baseColor = degamma(texture2D(iChannel0, distortedUv).xyz) * uTint;
  float fresnel = pow(1.0 - max(dot(nWorld, E), 0.0), 2.1);
  float rippleShade = 1.0 - clamp(abs(h) * 0.22, 0.0, 0.34);

  vec3 c = baseColor * rippleShade;
  c = mix(c, reflectColor, 0.11 + fresnel * 0.18 + rippleEnergy * 0.05);

  vec3 L = normalize(vec3(1.0, 1.0, 1.0));
  float dl = max(dot(nWorld, L), 0.0) * 0.68 + 0.32;
  c *= dl;

  c = gammaEnc(c);
  gl_FragColor = vec4(c, 1.0);
}
