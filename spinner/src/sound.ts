const SOUNDS_BASE = `${import.meta.env.BASE_URL}sounds`;
const CLASH_SOUND_URL = `${SOUNDS_BASE}/clash.wav`;
const CLASH_SOUND_URL_2 = `${SOUNDS_BASE}/clash2.mp3`;
const CLASH_SOUND_KEY = 'clash';
const CLASH_SOUND_KEY_2 = 'clash-2';
const CLASH_MIN_IMPACT = 0.85;
const EXPLOSION_SOUND_URL = `${SOUNDS_BASE}/explode.ogg`;
const EXPLOSION_SOUND_URL_2 = `${SOUNDS_BASE}/explode2.wav`;
const EXPLOSION_SOUND_KEY = 'explode';
const EXPLOSION_SOUND_KEY_2 = 'explode-2';
const LASER_SOUND_URL = `${SOUNDS_BASE}/laserbeam.wav`;
const LASER_SOUND_KEY = 'laser';
const LASER_PROJECTILE_SOUND_URL = `${SOUNDS_BASE}/laser.wav`;
const LASER_PROJECTILE_SOUND_KEY = 'laser-projectile';
const DEFAULT_AMBIENT_SOUND_URL = `${SOUNDS_BASE}/saturnambient.mp3`;
const SCRAPE_SOUND_URL = `${SOUNDS_BASE}/scrape.wav`;
const SCRAPE_SOUND_KEY = 'wall-scrape';
const PICKUP_SOUND_URL = `${SOUNDS_BASE}/pickup.wav`;
const PICKUP_SOUND_KEY = 'pickup';
const ZOMBIE_SLASH_SOUND_URL = `${SOUNDS_BASE}/zombieslash.wav`;
const ZOMBIE_SLASH_SOUND_KEY = 'zombie-slash';
const ZOMBIE_ROAR_SOUND_URL = `${SOUNDS_BASE}/zombieroar.wav`;
const ZOMBIE_ROAR_SOUND_KEY = 'zombie-roar';
const SPIDERLEG_SOUND_URL = `${SOUNDS_BASE}/spiderleg.wav`;
const SPIDERLEG_SOUND_KEY = 'spiderleg';
const SPINNER_MOTOR_SOUND_URL = `${SOUNDS_BASE}/spinner-motor.mp3`;
const SPINNER_MOTOR_PREFIX = 'spinner-motor:';
const SPATIAL_MAX_DISTANCE = 64;
const ONE_SHOT_SOUND_DEFINITIONS = [
  { key: CLASH_SOUND_KEY, url: CLASH_SOUND_URL },
  { key: CLASH_SOUND_KEY_2, url: CLASH_SOUND_URL_2 },
  { key: EXPLOSION_SOUND_KEY, url: EXPLOSION_SOUND_URL },
  { key: EXPLOSION_SOUND_KEY_2, url: EXPLOSION_SOUND_URL_2 },
  { key: LASER_SOUND_KEY, url: LASER_SOUND_URL },
  { key: LASER_PROJECTILE_SOUND_KEY, url: LASER_PROJECTILE_SOUND_URL },
  { key: PICKUP_SOUND_KEY, url: PICKUP_SOUND_URL },
  { key: ZOMBIE_SLASH_SOUND_KEY, url: ZOMBIE_SLASH_SOUND_URL },
  { key: ZOMBIE_ROAR_SOUND_KEY, url: ZOMBIE_ROAR_SOUND_URL },
  { key: SPIDERLEG_SOUND_KEY, url: SPIDERLEG_SOUND_URL },
] as const;
const LOOP_SOUND_DEFINITIONS = [
  { key: SCRAPE_SOUND_KEY, url: SCRAPE_SOUND_URL },
  { key: getAmbientLoopKey(DEFAULT_AMBIENT_SOUND_URL), url: DEFAULT_AMBIENT_SOUND_URL },
  { key: `${SPINNER_MOTOR_PREFIX}template`, url: SPINNER_MOTOR_SOUND_URL },
] as const;

let audioEnabled = false;
let listenersInstalled = false;
const lastPlayTimes = new Map<string, number>();
const preloadedAudio = new Map<string, HTMLAudioElement>();
const loopingAudio = new Map<string, HTMLAudioElement>();
const pendingAudioLoads = new WeakMap<HTMLAudioElement, Promise<void>>();
const listenerPosition = { x: 0, z: 0 };
let ambientTrackUrl = DEFAULT_AMBIENT_SOUND_URL;
let ambientTrackVolume = 0.18;
let ambientTrackPlaybackRate = 1;
let activeAmbientLoopKey: string | null = null;

// Web Audio path: one-shot SFX are decoded once into AudioBuffers and played
// from cheap source nodes so polyphony is essentially free and there is no
// per-play decode latency competing with other audio sources (e.g. iframes).
let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
const oneShotBuffers = new Map<string, AudioBuffer>();
const pendingOneShotLoads = new Map<string, Promise<AudioBuffer | null>>();

export interface SpinnerMotorLoop {
  key: string;
  volume: number;
  playbackRate: number;
}

function getAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;
  const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctx) return null;
  try {
    const ctx = new Ctx();
    audioContext = ctx;
    masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);
  } catch {
    return null;
  }
  return audioContext;
}

function unlockAudio(): void {
  audioEnabled = true;
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
}

async function loadOneShotBuffer(key: string, url: string): Promise<AudioBuffer | null> {
  const cached = oneShotBuffers.get(key);
  if (cached) return cached;
  const inflight = pendingOneShotLoads.get(key);
  if (inflight) return inflight;
  const ctx = getAudioContext();
  if (!ctx) return null;

  const promise = (async (): Promise<AudioBuffer | null> => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch audio ${url}: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arrayBuffer);
      oneShotBuffers.set(key, buffer);
      return buffer;
    } catch (error) {
      console.warn('Failed to decode one-shot audio:', url, error);
      return null;
    } finally {
      pendingOneShotLoads.delete(key);
    }
  })();

  pendingOneShotLoads.set(key, promise);
  return promise;
}

function getNowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function distanceFalloff(source: { x: number; z: number } | undefined): number {
  if (!source) return 1;
  const dx = source.x - listenerPosition.x;
  const dz = source.z - listenerPosition.z;
  const distance = Math.hypot(dx, dz);
  const normalized = clamp01(1 - distance / SPATIAL_MAX_DISTANCE);
  return normalized * normalized;
}

function sanitizeLoopKeyPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function getAmbientLoopKey(url: string): string {
  return `ambient:${sanitizeLoopKeyPart(url)}`;
}

function resolveAmbientTrackUrl(track: string): string {
  if (/^https?:\/\//i.test(track)) return track;
  const stripped = track.replace(/^\/+/, '').replace(/^sounds\//, '');
  return `${SOUNDS_BASE}/${stripped}`;
}

function waitForAudioReady(audio: HTMLAudioElement): Promise<void> {
  const existing = pendingAudioLoads.get(audio);
  if (existing) return existing;

  if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve();
  }

  const promise = new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      audio.removeEventListener('loadeddata', handleLoaded);
      audio.removeEventListener('canplaythrough', handleLoaded);
      audio.removeEventListener('error', handleError);
      pendingAudioLoads.delete(audio);
    };

    const handleLoaded = (): void => {
      cleanup();
      resolve();
    };

    const handleError = (): void => {
      cleanup();
      reject(audio.error ?? new Error(`Failed to load audio: ${audio.src}`));
    };

    audio.addEventListener('loadeddata', handleLoaded, { once: true });
    audio.addEventListener('canplaythrough', handleLoaded, { once: true });
    audio.addEventListener('error', handleError, { once: true });
  });

  pendingAudioLoads.set(audio, promise);
  return promise;
}

function getPreloadedAudio(key: string, url: string): HTMLAudioElement {
  let audio = preloadedAudio.get(key);
  if (!audio) {
    audio = new Audio(url);
    audio.preload = 'auto';
    audio.load();
    preloadedAudio.set(key, audio);
  }
  return audio;
}

function playOneShot(key: string, url: string, volume: number, playbackRate: number): void {
  if (!audioEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;

  // The unlock listener resumes the context, but a play call may race that
  // (e.g. play triggered from a frame timer immediately after the click).
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const buffer = oneShotBuffers.get(key);
  if (!buffer) {
    // Buffer hasn't decoded yet — kick off the load so the next call works.
    void loadOneShotBuffer(key, url);
    return;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = Math.max(0.5, Math.min(2.0, playbackRate));

  const voiceGain = ctx.createGain();
  voiceGain.gain.value = Math.max(0, Math.min(1, volume));

  source.connect(voiceGain);
  voiceGain.connect(masterGain);

  source.onended = (): void => {
    source.disconnect();
    voiceGain.disconnect();
  };

  source.start(0);
}

function getLoopingAudio(key: string, url: string): HTMLAudioElement {
  let audio = loopingAudio.get(key);
  if (!audio) {
    audio = new Audio(url);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    audio.load();
    loopingAudio.set(key, audio);
  }
  return audio;
}

function setLoopState(audio: HTMLAudioElement, volume: number, playbackRate: number): void {
  const clampedVolume = Math.max(0, Math.min(1, volume));
  const clampedRate = Math.max(0.5, Math.min(2, playbackRate));
  // Audio property writes trigger native work even when the value is unchanged;
  // skip when within a small epsilon of what's already set.
  // Same DSP-reconfig story as playbackRate below — volume changes under
  // ~1% are inaudible, so a generous 0.02 epsilon keeps the per-frame cost
  // low without any audible loss of fidelity.
  if (Math.abs(audio.volume - clampedVolume) > 0.02) {
    audio.volume = clampedVolume;
  }
  // 0.02 epsilon: pitch differences below ~2% are imperceptible, but on Mac
  // Chrome each `audio.playbackRate` write costs several hundred microseconds
  // because it reconfigures the underlying DSP. With per-frame RPM updates,
  // a 0.001 epsilon used to fire nearly every frame and dominate CPU time.
  if (Math.abs(audio.playbackRate - clampedRate) > 0.02) {
    audio.playbackRate = clampedRate;
  }

  if (!audioEnabled || clampedVolume <= 0.001) {
    if (!audio.paused) audio.pause();
    return;
  }

  if (audio.paused) {
    void audio.play().catch(() => {});
  }
}

export function initSound(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;

  // Create the AudioContext eagerly so decodes can start before the first
  // user gesture; it stays in the 'suspended' state until unlockAudio resumes.
  getAudioContext();

  for (const sound of LOOP_SOUND_DEFINITIONS) {
    if (sound.key.startsWith(SPINNER_MOTOR_PREFIX)) getPreloadedAudio(sound.key, sound.url);
    else getLoopingAudio(sound.key, sound.url);
  }
  window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
  window.addEventListener('keydown', unlockAudio, { once: true });
}

export async function preloadSoundAssets(extraAmbientTracks: readonly string[] = []): Promise<void> {
  initSound();

  const pending: Promise<unknown>[] = [];

  for (const sound of ONE_SHOT_SOUND_DEFINITIONS) {
    pending.push(loadOneShotBuffer(sound.key, sound.url));
  }

  pending.push(waitForAudioReady(getPreloadedAudio(SCRAPE_SOUND_KEY, SCRAPE_SOUND_URL)));
  pending.push(waitForAudioReady(getPreloadedAudio(`${SPINNER_MOTOR_PREFIX}template`, SPINNER_MOTOR_SOUND_URL)));
  pending.push(waitForAudioReady(getLoopingAudio(getAmbientLoopKey(DEFAULT_AMBIENT_SOUND_URL), DEFAULT_AMBIENT_SOUND_URL)));

  for (const track of extraAmbientTracks) {
    const url = resolveAmbientTrackUrl(track);
    pending.push(waitForAudioReady(getLoopingAudio(getAmbientLoopKey(url), url)));
  }

  await Promise.all(pending);
}

export function setSoundListenerPosition(pos: { x: number; z: number }): void {
  listenerPosition.x = pos.x;
  listenerPosition.z = pos.z;
}

export function playClashSound(impactForce: number): void {
  const normalized = Math.max(0, Math.min(1, (impactForce - CLASH_MIN_IMPACT) / 6.5));
  if (normalized <= 0) return;

  const now = getNowMs();
  const cooldownMs = 35 + (1 - normalized) * 45;
  const lastPlayedAt = lastPlayTimes.get(CLASH_SOUND_KEY) ?? -Infinity;
  if (now - lastPlayedAt < cooldownMs) return;
  lastPlayTimes.set(CLASH_SOUND_KEY, now);

  const volume = Math.min(0.95, 0.18 + normalized * 0.5);
  const baseRate = 1.03 - normalized * 0.12;
  const playbackRate = Math.max(0.82, Math.min(1.14, baseRate + (Math.random() - 0.5) * 0.12));
  const useSecondClash = Math.random() < 0.5;
  playOneShot(
    useSecondClash ? CLASH_SOUND_KEY_2 : CLASH_SOUND_KEY,
    useSecondClash ? CLASH_SOUND_URL_2 : CLASH_SOUND_URL,
    volume,
    playbackRate,
  );
}

export function playExplosionSound(size = 1): void {
  const normalized = Math.max(0, Math.min(1, size));
  const now = getNowMs();
  const cooldownMs = 55 + (1 - normalized) * 50;
  const lastPlayedAt = lastPlayTimes.get(EXPLOSION_SOUND_KEY) ?? -Infinity;
  if (now - lastPlayedAt < cooldownMs) return;
  lastPlayTimes.set(EXPLOSION_SOUND_KEY, now);

  const volume = Math.min(1, 0.28 + normalized * 0.42);
  const baseRate = 1.02 - normalized * 0.18;
  const playbackRate = Math.max(0.72, Math.min(1.1, baseRate + (Math.random() - 0.5) * 0.08));
  const useSecondExplosion = Math.random() < 0.5;
  playOneShot(
    useSecondExplosion ? EXPLOSION_SOUND_KEY_2 : EXPLOSION_SOUND_KEY,
    useSecondExplosion ? EXPLOSION_SOUND_URL_2 : EXPLOSION_SOUND_URL,
    volume,
    playbackRate,
  );
}

export function playLaserHitSound(
  sourcePos?: { x: number; z: number },
  intensity = 1,
): void {
  const normalized = Math.max(0, Math.min(1, intensity));
  const proximity = distanceFalloff(sourcePos);
  if (proximity <= 0.01) return;

  const now = getNowMs();
  const cooldownMs = 70 + (1 - normalized) * 55;
  const key = `${EXPLOSION_SOUND_KEY_2}:laser-hit`;
  const lastPlayedAt = lastPlayTimes.get(key) ?? -Infinity;
  if (now - lastPlayedAt < cooldownMs) return;
  lastPlayTimes.set(key, now);

  const volume = proximity * Math.min(0.85, 0.22 + normalized * 0.34);
  const baseRate = 1.0 - normalized * 0.08;
  const playbackRate = Math.max(0.8, Math.min(1.08, baseRate + (Math.random() - 0.5) * 0.06));
  playOneShot(EXPLOSION_SOUND_KEY_2, EXPLOSION_SOUND_URL_2, volume, playbackRate);
}

export function playLaserSound(
  sourcePos?: { x: number; z: number },
  intensity = 1,
): void {
  const normalized = Math.max(0, Math.min(1, intensity));
  const proximity = distanceFalloff(sourcePos);
  if (proximity <= 0.01) return;

  const now = getNowMs();
  const cooldownMs = 26 + (1 - normalized) * 22;
  const lastPlayedAt = lastPlayTimes.get(LASER_SOUND_KEY) ?? -Infinity;
  if (now - lastPlayedAt < cooldownMs) return;
  lastPlayTimes.set(LASER_SOUND_KEY, now);

  const volume = proximity * Math.min(0.42, 0.1 + normalized * 0.16);
  const baseRate = 0.96 + normalized * 0.16;
  const playbackRate = Math.max(0.82, Math.min(1.24, baseRate + (Math.random() - 0.5) * 0.08));
  playOneShot(LASER_SOUND_KEY, LASER_SOUND_URL, volume, playbackRate);
}

export function playProjectileLaserSound(
  sourcePos?: { x: number; z: number },
  intensity = 1,
): void {
  const normalized = Math.max(0, Math.min(1, intensity));
  const proximity = distanceFalloff(sourcePos);
  if (proximity <= 0.01) return;

  const now = getNowMs();
  const cooldownMs = 30 + (1 - normalized) * 24;
  const lastPlayedAt = lastPlayTimes.get(LASER_PROJECTILE_SOUND_KEY) ?? -Infinity;
  if (now - lastPlayedAt < cooldownMs) return;
  lastPlayTimes.set(LASER_PROJECTILE_SOUND_KEY, now);

  const volume = proximity * Math.min(0.42, 0.1 + normalized * 0.16);
  const baseRate = 0.96 + normalized * 0.16;
  const playbackRate = Math.max(0.82, Math.min(1.24, baseRate + (Math.random() - 0.5) * 0.08));
  playOneShot(LASER_PROJECTILE_SOUND_KEY, LASER_PROJECTILE_SOUND_URL, volume, playbackRate);
}

export function playPickupSound(kind: 'normal' | 'hyper' | 'growth'): void {
  const now = getNowMs();
  const cooldownMs = kind === 'normal' ? 28 : 20;
  const key = `${PICKUP_SOUND_KEY}:${kind}`;
  const lastPlayedAt = lastPlayTimes.get(key) ?? -Infinity;
  if (now - lastPlayedAt < cooldownMs) return;
  lastPlayTimes.set(key, now);

  const volume = kind === 'normal' ? 0.34 : kind === 'hyper' ? 0.48 : 0.52;
  const baseRate = kind === 'normal' ? 1.0 : kind === 'hyper' ? 1.14 : 0.9;
  const variance = kind === 'normal' ? 0.06 : 0.05;
  const playbackRate = Math.max(0.78, Math.min(1.3, baseRate + (Math.random() - 0.5) * variance));
  playOneShot(PICKUP_SOUND_KEY, PICKUP_SOUND_URL, volume, playbackRate);
}

export function playZombieSlashSound(
  sourcePos?: { x: number; z: number },
  intensity = 1,
): void {
  const normalized = Math.max(0, Math.min(1, intensity));
  const proximity = distanceFalloff(sourcePos);
  if (proximity <= 0.01) return;

  const now = getNowMs();
  const cooldownMs = 70 + (1 - normalized) * 35;
  const lastPlayedAt = lastPlayTimes.get(ZOMBIE_SLASH_SOUND_KEY) ?? -Infinity;
  if (now - lastPlayedAt < cooldownMs) return;
  lastPlayTimes.set(ZOMBIE_SLASH_SOUND_KEY, now);

  const volume = proximity * Math.min(0.6, 0.16 + normalized * 0.22);
  const baseRate = 0.94 + normalized * 0.12;
  const playbackRate = Math.max(0.8, Math.min(1.18, baseRate + (Math.random() - 0.5) * 0.08));
  playOneShot(ZOMBIE_SLASH_SOUND_KEY, ZOMBIE_SLASH_SOUND_URL, volume, playbackRate);
}

export function playZombieRoarSound(
  key: string,
  sourcePos?: { x: number; z: number },
  intensity = 1,
): void {
  const normalized = Math.max(0, Math.min(1, intensity));
  const proximity = distanceFalloff(sourcePos);
  if (proximity <= 0.01) return;

  const now = getNowMs();
  const cooldownKey = `${ZOMBIE_ROAR_SOUND_KEY}:${key}`;
  const cooldownMs = 900 + (1 - normalized) * 500;
  const lastPlayedAt = lastPlayTimes.get(cooldownKey) ?? -Infinity;
  if (now - lastPlayedAt < cooldownMs) return;
  lastPlayTimes.set(cooldownKey, now);

  const volume = proximity * Math.min(0.85, 0.24 + normalized * 0.3);
  const baseRate = 0.92 + normalized * 0.08;
  const playbackRate = Math.max(0.78, Math.min(1.08, baseRate + (Math.random() - 0.5) * 0.05));
  playOneShot(ZOMBIE_ROAR_SOUND_KEY, ZOMBIE_ROAR_SOUND_URL, volume, playbackRate);
}

export function playSpiderLegPlantSound(
  key: string,
  intensity = 1,
  sourcePos?: { x: number; z: number },
): void {
  const normalized = Math.max(0, Math.min(1, intensity));
  const now = getNowMs();
  const cooldownKey = `${SPIDERLEG_SOUND_KEY}:${key}`;
  const cooldownMs = 90 + (1 - normalized) * 45;
  const lastPlayedAt = lastPlayTimes.get(cooldownKey) ?? -Infinity;
  if (now - lastPlayedAt < cooldownMs) return;

  const proximity = distanceFalloff(sourcePos);
  if (proximity <= 0.01) return;
  lastPlayTimes.set(cooldownKey, now);

  const volume = proximity * Math.min(0.72, 0.18 + normalized * 0.28);
  const baseRate = 1.02 - normalized * 0.12;
  const playbackRate = Math.max(0.78, Math.min(1.1, baseRate + (Math.random() - 0.5) * 0.07));
  playOneShot(SPIDERLEG_SOUND_KEY, SPIDERLEG_SOUND_URL, volume, playbackRate);
}

export function syncWallScrapeLoop(volume: number, playbackRate: number): void {
  const audio = getLoopingAudio(SCRAPE_SOUND_KEY, SCRAPE_SOUND_URL);
  setLoopState(audio, volume, playbackRate);
}

export function setAmbientTrack(track: string, volume = 0.18, playbackRate = 1): void {
  ambientTrackUrl = resolveAmbientTrackUrl(track);
  ambientTrackVolume = Math.max(0, Math.min(1, volume));
  ambientTrackPlaybackRate = Math.max(0.5, Math.min(2, playbackRate));
}

export function resetAmbientTrack(): void {
  ambientTrackUrl = DEFAULT_AMBIENT_SOUND_URL;
  ambientTrackVolume = 0.18;
  ambientTrackPlaybackRate = 1;
}

export function syncAmbientLoop(): void {
  const loopKey = getAmbientLoopKey(ambientTrackUrl);
  const audio = getLoopingAudio(loopKey, ambientTrackUrl);
  setLoopState(audio, ambientTrackVolume, ambientTrackPlaybackRate);

  if (activeAmbientLoopKey && activeAmbientLoopKey !== loopKey) {
    const previous = loopingAudio.get(activeAmbientLoopKey);
    if (previous) setLoopState(previous, 0, previous.playbackRate || 1);
  }
  activeAmbientLoopKey = loopKey;
}

export function syncSpinnerMotorLoops(loops: SpinnerMotorLoop[]): void {
  const activeKeys = new Set<string>();

  for (const loop of loops) {
    const key = `${SPINNER_MOTOR_PREFIX}${loop.key}`;
    activeKeys.add(key);
    const audio = getLoopingAudio(key, SPINNER_MOTOR_SOUND_URL);
    setLoopState(audio, loop.volume, loop.playbackRate);
  }

  for (const [key, audio] of loopingAudio) {
    if (!key.startsWith(SPINNER_MOTOR_PREFIX)) continue;
    if (activeKeys.has(key)) continue;
    setLoopState(audio, 0, audio.playbackRate || 1);
  }
}
