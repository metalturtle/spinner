precision highp float;

uniform sampler2D iChannel0;
uniform sampler2D iChannel2;
uniform float iTime;
uniform float uAspect;
uniform vec3 uCameraPos;
uniform vec3 uTint;

#define MAX_CLICKS 64
uniform vec3 uClicks[MAX_CLICKS]; // xy = shader-uv position, z = spawn time

varying vec2 vUv;
varying vec3 vWorldPos;

#define pi 3.1415927
float bias(float x, float b) {
  return x / ((1.0/b - 2.0) * (1.0 - x) + 1.0);
}

vec3 degamma(vec3 c) { return pow(c, vec3(2.2)); }
vec3 gammaEnc(vec3 c) { return pow(c, vec3(1.0/1.6)); }

vec2 dirToEquirect(vec3 d) {
  d = normalize(d);
  float u = atan(d.z, d.x) / (2.0 * pi) + 0.5;
  float v = asin(clamp(d.y, -1.0, 1.0)) / pi + 0.5;
  return vec2(u, v);
}

float computeRippleHeight(vec2 uv, float time) {
  float h = 0.0;

  for (int i = 0; i < MAX_CLICKS; i++) {
    vec3 ck = uClicks[i];
    float age = time - ck.z;
    if (age < 0.0 || age > 12.0) continue;
    vec2 v2 = uv - ck.xy;
    float d2 = pow(dot(v2, v2), 0.7);
    float life2 = 8.0;
    float n2 = age * 5.0 + 0.3;
    float x2 = d2 * 99.0;
    float T2 = x2 < (2.0 * pi * n2) ? 1.0 : 0.0;
    float e2 = max(1.0 - age / life2, 0.0);
    float F2 = e2 * x2 / (2.0 * pi * n2);
    float s2 = sin(x2 - (2.0 * pi * n2) - pi * 0.5);
    s2 = s2 * 0.5 + 0.5;
    s2 = bias(s2, 0.6);
    s2 = (F2 * s2) / (x2 + 1.1) * T2;
    h += s2 * 200.0;
  }

  return h;
}

void main() {
  vec2 uv = vec2(vUv.x * uAspect, 1.0 - vUv.y);
  float time = iTime;

  float h  = computeRippleHeight(uv, time);
  float eps = 0.0015;
  vec2 uvx = uv + vec2(eps, 0.0);
  vec2 uvy = uv + vec2(0.0, eps);
  float hx = computeRippleHeight(uvx, time);
  float hy = computeRippleHeight(uvy, time);
  vec2 grad = vec2(hx - h, hy - h) / eps;

  // tangent-space normal — same recipe as the original `vec3(dFdx(h), 17., dFdy(h))`
  // but driven by analytical gradients so it stays stable across viewing angles
  float k = 1.0 / 1080.0;
  vec3 n = normalize(vec3(grad.x * k, 17.0, grad.y * k));

  // for a horizontal plane (rotateX -PI/2) lying in xz, the tangent-space basis aligns
  // with world axes — n is already a world-space normal
  vec3 nWorld = n;

  vec3 E = normalize(uCameraPos - vWorldPos);
  vec3 rv = reflect(-E, nWorld);
  vec3 reflect_color = degamma(texture2D(iChannel2, dirToEquirect(rv)).xyz);

  vec3 fn = refract(vec3(0.0, 1.0, 0.0), n, 2.5);
  vec2 sampleUv = uv + fn.xz * 0.1 + vec2(0.66, 0.0);
  float lod = length(fn.xz) * 10.0;

  vec3 c = vec3(0.0);
  c += degamma(texture2D(iChannel0, sampleUv, lod).xyz);
  c *= 1.0 - h * 0.0125;
  c += reflect_color * 0.3;
  c *= uTint;
  c *= 1.18;

  vec3 L = normalize(vec3(1.0, 1.0, 1.0));
  float dl = max(dot(nWorld, L), 0.0) * 0.7 + 0.3;
  c *= dl;

  c = gammaEnc(c);
  gl_FragColor = vec4(c, 1.0);
}
