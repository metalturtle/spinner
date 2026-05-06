import * as THREE from 'three';

type LaserLightBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

type WorldPoint = {
  x: number;
  z: number;
};

export interface LaserLightSegment {
  start: WorldPoint;
  end: WorldPoint;
  width: number;
  color: THREE.ColorRepresentation;
  intensity?: number;
}

export interface LaserLightPoint {
  point: WorldPoint;
  radius: number;
  color: THREE.ColorRepresentation;
  intensity?: number;
}

const LIGHTMAP_SIZE = 512;
const canvas = document.createElement('canvas');
canvas.width = LIGHTMAP_SIZE;
canvas.height = LIGHTMAP_SIZE;
const canvasContext = canvas.getContext('2d');
if (!canvasContext) throw new Error('Failed to create laser light buffer context.');
const ctx: CanvasRenderingContext2D = canvasContext;

const laserLightTexture = new THREE.CanvasTexture(canvas);
laserLightTexture.colorSpace = THREE.SRGBColorSpace;
laserLightTexture.minFilter = THREE.LinearFilter;
laserLightTexture.magFilter = THREE.LinearFilter;
laserLightTexture.wrapS = THREE.ClampToEdgeWrapping;
laserLightTexture.wrapT = THREE.ClampToEdgeWrapping;
laserLightTexture.generateMipmaps = false;

const laserLightBounds = new THREE.Vector4(-20, -20, 20, 20);
const sharedUniforms = {
  uLaserLightMap: { value: laserLightTexture },
  uLaserLightBounds: { value: laserLightBounds },
  uLaserLightBoost: { value: 5.25 },
};
const scratchColor = new THREE.Color();

function clearCanvas(): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

clearCanvas();
laserLightTexture.needsUpdate = true;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function currentSpanX(): number {
  return Math.max(0.001, laserLightBounds.z - laserLightBounds.x);
}

function currentSpanZ(): number {
  return Math.max(0.001, laserLightBounds.w - laserLightBounds.y);
}

function worldToCanvas(point: WorldPoint): { x: number; y: number } {
  const u = clamp01((point.x - laserLightBounds.x) / currentSpanX());
  const v = clamp01((point.z - laserLightBounds.y) / currentSpanZ());
  return {
    x: u * (canvas.width - 1),
    y: (1 - v) * (canvas.height - 1),
  };
}

function widthToPixels(width: number): number {
  const dominantSpan = Math.max(currentSpanX(), currentSpanZ());
  return Math.max(2, (width / dominantSpan) * canvas.width);
}

function colorToCss(color: THREE.ColorRepresentation, alpha: number): string {
  scratchColor.set(color);
  const r = Math.round(scratchColor.r * 255);
  const g = Math.round(scratchColor.g * 255);
  const b = Math.round(scratchColor.b * 255);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`;
}

function drawGlowStroke(
  start: { x: number; y: number },
  end: { x: number; y: number },
  widthPx: number,
  color: THREE.ColorRepresentation,
  alpha: number,
  blur: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = colorToCss(color, alpha);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, widthPx);
  ctx.shadowBlur = blur;
  ctx.shadowColor = colorToCss(color, Math.min(1, alpha * 1.2));
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.restore();
}

export function setLaserLightBounds(bounds: LaserLightBounds): void {
  laserLightBounds.set(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ);
}

export function beginLaserLightFrame(): void {
  clearCanvas();
}

export function addLaserLightSegment(segment: LaserLightSegment): void {
  const start = worldToCanvas(segment.start);
  const end = worldToCanvas(segment.end);
  const intensity = Math.max(0, segment.intensity ?? 1);
  if (intensity <= 0.001) return;

  const widthPx = widthToPixels(segment.width);
  drawGlowStroke(start, end, widthPx * 8.8, segment.color, 0.08 * intensity, widthPx * 14.0);
  drawGlowStroke(start, end, widthPx * 4.7, segment.color, 0.17 * intensity, widthPx * 9.0);
  drawGlowStroke(start, end, widthPx * 2.3, segment.color, 0.34 * intensity, widthPx * 4.8);
  drawGlowStroke(start, end, widthPx * 1.18, segment.color, 0.62 * intensity, widthPx * 2.0);
}

export function addLaserLightPoint(light: LaserLightPoint): void {
  const center = worldToCanvas(light.point);
  const radiusPx = Math.max(4, widthToPixels(light.radius));
  const intensity = Math.max(0, light.intensity ?? 1);
  if (intensity <= 0.001) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radiusPx);
  gradient.addColorStop(0, colorToCss(light.color, 0.8 * intensity));
  gradient.addColorStop(0.3, colorToCss(light.color, 0.32 * intensity));
  gradient.addColorStop(1, colorToCss(light.color, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function endLaserLightFrame(): void {
  laserLightTexture.needsUpdate = true;
}

export function applyLaserLightToMaterial(material: THREE.MeshStandardMaterial): void {
  if (material.userData.laserLightPatched) return;

  const previousOnBeforeCompile = material.onBeforeCompile;
  const previousProgramCacheKey = material.customProgramCacheKey?.bind(material);

  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile?.(shader, renderer);
    shader.uniforms.uLaserLightMap = sharedUniforms.uLaserLightMap;
    shader.uniforms.uLaserLightBounds = sharedUniforms.uLaserLightBounds;
    shader.uniforms.uLaserLightBoost = sharedUniforms.uLaserLightBoost;

    shader.vertexShader = `
      varying vec3 vLaserLightWorldPos;
    ` + shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
       vLaserLightWorldPos = worldPosition.xyz;`,
    );

    shader.fragmentShader = `
      uniform sampler2D uLaserLightMap;
      uniform vec4 uLaserLightBounds;
      uniform float uLaserLightBoost;
      varying vec3 vLaserLightWorldPos;

      vec3 sampleLaserLight(vec3 worldPos) {
        vec2 spans = max(uLaserLightBounds.zw - uLaserLightBounds.xy, vec2(0.001));
        vec2 uv = vec2(
          clamp((worldPos.x - uLaserLightBounds.x) / spans.x, 0.0, 1.0),
          clamp((worldPos.z - uLaserLightBounds.y) / spans.y, 0.0, 1.0)
        );
        vec3 lightColor = texture2D(uLaserLightMap, vec2(uv.x, 1.0 - uv.y)).rgb;
        return lightColor * uLaserLightBoost;
      }
    ` + shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       totalEmissiveRadiance += sampleLaserLight(vLaserLightWorldPos);`,
    );
  };

  material.customProgramCacheKey = () => {
    const baseKey = previousProgramCacheKey ? previousProgramCacheKey() : '';
    return `${baseKey}|laser-light-floor-v1`;
  };

  material.userData.laserLightPatched = true;
  material.needsUpdate = true;
}
