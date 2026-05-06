// Persistent player settings. Read once at module load, mutated via setters
// that write back to localStorage. Pool sizes are sampled when each pool is
// first instantiated, so changing the value only takes effect on the next
// page load.

const STORAGE_KEY = 'spinner.settings.v1';

interface Settings {
  /**
   * Maximum size for each runtime light pool (aura + projectile). Each pool
   * adds this many `THREE.PointLight`s to the scene, even when idle. Every
   * lit fragment runs `for (i = 0; i < NUM_POINT_LIGHTS; i++)` per pixel —
   * smaller pools = cheaper shader = higher framerate on weaker GPUs.
   *
   * 0 disables the pools entirely (no aura on the player, no glow on
   * enemy projectiles).
   */
  lightPoolSize: number;
  /** When true, all dynamic point lights are forced to intensity 0. */
  lightsDisabled: boolean;
  /**
   * When true, mirror walls are hidden and the refraction render pass is
   * skipped. Refraction renders the entire scene to a separate target
   * once per frame so mirror walls can sample it — disabling it roughly
   * halves the rendering cost on busy levels.
   */
  refractionDisabled: boolean;
  /**
   * When true, the renderer's shadow map pass is skipped. Shadow rendering
   * is a depth-only re-render of the scene from the directional light's
   * point of view; turning it off reclaims that pass entirely.
   */
  shadowsDisabled: boolean;
}

export const LIGHT_POOL_SIZE_MIN = 0;
export const LIGHT_POOL_SIZE_MAX = 8;
export const LIGHT_POOL_SIZE_DEFAULT = 4;

const DEFAULTS: Settings = {
  lightPoolSize: LIGHT_POOL_SIZE_DEFAULT,
  lightsDisabled: false,
  refractionDisabled: false,
  shadowsDisabled: false,
};

function clampPoolSize(value: number): number {
  if (!Number.isFinite(value)) return LIGHT_POOL_SIZE_DEFAULT;
  return Math.max(LIGHT_POOL_SIZE_MIN, Math.min(LIGHT_POOL_SIZE_MAX, Math.round(value)));
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings> & { lightsEnabled?: boolean };
    // Migrate the old boolean flag — false = 0 lights, true = default count.
    if (typeof parsed.lightPoolSize !== 'number' && typeof parsed.lightsEnabled === 'boolean') {
      return {
        lightPoolSize: parsed.lightsEnabled ? LIGHT_POOL_SIZE_DEFAULT : 0,
        lightsDisabled: false,
        refractionDisabled: false,
        shadowsDisabled: false,
      };
    }
    return {
      lightPoolSize: clampPoolSize(parsed.lightPoolSize ?? DEFAULTS.lightPoolSize),
      lightsDisabled: parsed.lightsDisabled === true,
      refractionDisabled: parsed.refractionDisabled === true,
      shadowsDisabled: parsed.shadowsDisabled === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

const current: Settings = loadSettings();

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // localStorage may be unavailable (private mode, quota); ignore.
  }
}

export function getLightPoolSize(): number {
  return current.lightPoolSize;
}

export function setLightPoolSize(value: number): void {
  current.lightPoolSize = clampPoolSize(value);
  persist();
}

export function getLightsDisabled(): boolean {
  return current.lightsDisabled;
}

export function setLightsDisabled(value: boolean): void {
  current.lightsDisabled = value;
  persist();
}

export function getRefractionDisabled(): boolean {
  return current.refractionDisabled;
}

export function setRefractionDisabled(value: boolean): void {
  current.refractionDisabled = value;
  persist();
}

export function getShadowsDisabled(): boolean {
  return current.shadowsDisabled;
}

export function setShadowsDisabled(value: boolean): void {
  current.shadowsDisabled = value;
  persist();
}
