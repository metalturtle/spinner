precision highp float;

uniform sampler2D iChannel0;
uniform sampler2D iChannel2;
uniform sampler2D uRippleState;
uniform vec2 uRippleTexel;
uniform vec2 uWorldMin;
uniform vec2 uWorldSize;
uniform vec3 uCameraPos;
uniform vec3 uTint;
uniform float uNightBlend;

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
  vec2 uv = clamp(simUv, vec2(0.0), vec2(1.0));
  vec2 tx = uRippleTexel * 0.75;
  float c = texture2D(uRippleState, uv).r;
  float x1 = texture2D(uRippleState, clamp(uv + vec2(tx.x, 0.0), vec2(0.0), vec2(1.0))).r;
  float x2 = texture2D(uRippleState, clamp(uv - vec2(tx.x, 0.0), vec2(0.0), vec2(1.0))).r;
  float y1 = texture2D(uRippleState, clamp(uv + vec2(0.0, tx.y), vec2(0.0), vec2(1.0))).r;
  float y2 = texture2D(uRippleState, clamp(uv - vec2(0.0, tx.y), vec2(0.0), vec2(1.0))).r;
  return (c * 0.42 + (x1 + x2 + y1 + y2) * 0.145) * 2.0 - 1.0;
}

void main() {
  vec2 simUv = clamp((vWorldPos.xz - uWorldMin) / max(uWorldSize, vec2(0.001)), vec2(0.0), vec2(1.0));

  float h = sampleHeight(simUv);
  float hx1 = sampleHeight(simUv + vec2(uRippleTexel.x, 0.0));
  float hx2 = sampleHeight(simUv - vec2(uRippleTexel.x, 0.0));
  float hy1 = sampleHeight(simUv + vec2(0.0, uRippleTexel.y));
  float hy2 = sampleHeight(simUv - vec2(0.0, uRippleTexel.y));
  vec2 grad = vec2(hx1 - hx2, hy1 - hy2) * 0.5;
  float rippleEnergy = clamp(length(grad) * 28.0 + abs(h) * 0.95, 0.0, 1.0);
  float normalStrength = mix(4.0, 6.2, rippleEnergy);
  float distortionStrength = mix(0.12, 0.19, rippleEnergy);

  vec3 nWorld = normalize(vec3(grad.x * normalStrength, 1.0, grad.y * normalStrength));
  vec3 E = normalize(uCameraPos - vWorldPos);
  vec3 reflectDir = reflect(-E, nWorld);
  vec2 reflectUv = dirToEquirect(reflectDir);
  float reflectLod = mix(0.0, 0.9, uNightBlend) + clamp(rippleEnergy * 1.25, 0.0, 1.4);
  vec3 reflectColor = degamma(texture2D(iChannel2, reflectUv, reflectLod).xyz);

  vec2 distortedUv = vUv + grad * distortionStrength;
  vec3 baseColor = degamma(texture2D(iChannel0, distortedUv).xyz) * uTint;
  baseColor *= mix(1.0, 0.0, uNightBlend);
  float fresnel = pow(1.0 - max(dot(nWorld, E), 0.0), 2.1);
  float rippleShade = 1.0 - clamp(abs(h) * 0.22, 0.0, 0.34);

  vec3 c = baseColor * mix(rippleShade, 0.82, uNightBlend);
  float reflectMix = mix(
    0.11 + fresnel * 0.18 + rippleEnergy * 0.05,
    0.76 + fresnel * 0.16 + rippleEnergy * 0.06,
    uNightBlend
  );
  c = mix(c, reflectColor, clamp(reflectMix, 0.0, 0.95));

  vec3 L = normalize(vec3(1.0, 1.0, 1.0));
  float dl = max(dot(nWorld, L), 0.0) * 0.68 + 0.32;
  c *= mix(dl, dl * 0.84, uNightBlend);

  c = gammaEnc(c);
  gl_FragColor = vec4(c, 1.0);
}
