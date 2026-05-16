precision highp float;

uniform float iTime;

varying vec2 vUv;

#define PI 3.14159265359

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 equirectToDir(vec2 uv) {
  float lon = (uv.x - 0.5) * PI * 2.0;
  float lat = (uv.y - 0.5) * PI;
  float y = sin(lat);
  float r = cos(lat);
  return normalize(vec3(cos(lon) * r, y, sin(lon) * r));
}

float starLayer(vec2 uv, float scale, float threshold, float baseRadius) {
  vec2 grid = uv * scale;
  vec2 cell = floor(grid);
  vec2 f = fract(grid) - 0.5;
  float seed = hash21(cell);
  if (seed < threshold) return 0.0;

  vec2 jitter = vec2(hash21(cell + 13.7), hash21(cell + 41.3)) - 0.5;
  vec2 p = f - jitter * 0.82;
  float radius = mix(baseRadius, baseRadius * 1.9, hash21(cell + 7.1));
  float d = max(abs(p.x), abs(p.y));
  float core = 1.0 - smoothstep(radius, radius + 0.0022, d);
  float twinkle = 0.9 + 0.1 * sin(iTime * (0.22 + hash21(cell + 91.7) * 0.45) + seed * 20.0);

  return core * twinkle * mix(0.8, 1.15, seed);
}

float moonCrater(vec2 p, vec2 center, float radius, float depth) {
  float dist = length(p - center);
  float rim = 1.0 - smoothstep(radius, radius + 0.03, dist);
  float inner = 1.0 - smoothstep(radius * 0.18, radius * 0.92, dist);
  return rim * inner * depth;
}

void main() {
  vec2 uv = vUv;
  vec3 dir = equirectToDir(uv);
  vec3 sky = vec3(0.0);

  float stars = 0.0;
  stars += starLayer(uv + vec2(0.0, 0.013), 132.0, 0.9898, 0.026);
  stars += starLayer(uv * vec2(1.0, 0.985) + vec2(0.071, 0.02), 230.0, 0.9946, 0.017);
  stars += starLayer(uv * vec2(1.0, 1.015) + vec2(0.19, -0.01), 360.0, 0.9974, 0.012);
  stars += starLayer(uv + vec2(-0.14, 0.031), 72.0, 0.985, 0.036);
  sky += vec3(0.9, 0.94, 1.0) * stars * 1.55;

  vec3 moonDir = normalize(vec3(-0.03, 0.94, -0.34));
  vec3 moonRight = normalize(cross(vec3(0.0, 1.0, 0.0), moonDir));
  vec3 moonUp = normalize(cross(moonDir, moonRight));
  float moonRadius = 0.118;
  float moonDist = acos(clamp(dot(dir, moonDir), -1.0, 1.0));
  float moonEdge = max(fwidth(moonDist) * 1.25, 0.00055);
  float moonMask = 1.0 - smoothstep(moonRadius, moonRadius + moonEdge, moonDist);
  float moonGlow = 1.0 - smoothstep(moonRadius * 0.78, moonRadius + 0.1, moonDist);
  vec2 moonUv = vec2(dot(dir, moonRight), dot(dir, moonUp)) / moonRadius;

  float moonDisc = clamp(1.0 - dot(moonUv, moonUv), 0.0, 1.0);
  float craterField = 0.0;
  craterField += moonCrater(moonUv, vec2(-0.28, 0.2), 0.23, 0.24);
  craterField += moonCrater(moonUv, vec2(0.12, 0.28), 0.18, 0.16);
  craterField += moonCrater(moonUv, vec2(0.18, -0.08), 0.22, 0.18);
  craterField += moonCrater(moonUv, vec2(-0.16, -0.24), 0.19, 0.14);
  craterField += moonCrater(moonUv, vec2(0.36, -0.26), 0.11, 0.12);
  float maria = smoothstep(-0.2, 0.85, 0.55 - dot(moonUv * vec2(0.7, 1.0), moonUv));

  vec3 moonColor = mix(vec3(0.88, 0.93, 1.02), vec3(1.12, 1.16, 1.2), moonDisc);
  moonColor *= 0.95 - craterField * 0.3;
  moonColor *= 0.98 + maria * 0.06;
  moonColor += vec3(0.04, 0.045, 0.06) * (1.0 - smoothstep(0.76, 1.0, moonDisc));

  sky += vec3(0.09, 0.11, 0.16) * moonGlow * moonGlow * 0.85;
  sky = mix(sky, moonColor, moonMask);

  gl_FragColor = vec4(sky, 1.0);
}
