const CLASH_SOUND_URL = '/sounds/clash.wav';
const CLASH_SOUND_URL_2 = '/sounds/clash2.mp3';
const CLASH_SOUND_KEY = 'clash';
const CLASH_SOUND_KEY_2 = 'clash-2';
const CLASH_MIN_IMPACT = 0.85;
const EXPLOSION_SOUND_URL = '/sounds/explode.ogg';
const EXPLOSION_SOUND_URL_2 = '/sounds/explode2.wav';
const EXPLOSION_SOUND_KEY = 'explode';
const EXPLOSION_SOUND_KEY_2 = 'explode-2';
const LASER_SOUND_URL = '/sounds/laser.wav';
const LASER_SOUND_KEY = 'laser';
const DEFAULT_AMBIENT_SOUND_URL = '/sounds/saturnambient.mp3';
const SCRAPE_SOUND_URL = '/sounds/scrape.wav';
const SCRAPE_SOUND_KEY = 'wall-scrape';
const PICKUP_SOUND_URL = '/sounds/pickup.wav';
const PICKUP_SOUND_KEY = 'pickup';
const ZOMBIE_SLASH_SOUND_URL = '/sounds/zombieslash.wav';
const ZOMBIE_SLASH_SOUND_KEY = 'zombie-slash';
const ZOMBIE_ROAR_SOUND_URL = '/sounds/zombieroar.wav';
const ZOMBIE_ROAR_SOUND_KEY = 'zombie-roar';
const SPIDERLEG_SOUND_URL = '/sounds/spiderleg.wav';
const SPIDERLEG_SOUND_KEY = 'spiderleg';
const SPINNER_MOTOR_SOUND_URL = '/sounds/spinner-motor.mp3';
const SPINNER_MOTOR_PREFIX = 'spinner-motor:';
const SPATIAL_MAX_DISTANCE = 64;

let audioEnabled = false;
let listenersInstalled = false;
const lastPlayTimes = new Map<string, number>();
const preloadedAudio = new Map<string, HTMLAudioElement>();
const loopingAudio = new Map<string, HTMLAudioElement>();
const oneShotVoicePools = new Map<string, HTMLAudioElement[]>();
const oneShotPoolIndices = new Map<string, number>();
const listenerPosition = { x: 0, z: 0 };
let ambientTrackUrl = DEFAULT_AMBIENT_SOUND_URL;
let ambientTrackVolume = 0.18;
let ambientTrackPlaybackRate = 1;
let activeAmbientLoopKey: string | null = null;

export interface SpinnerMotorLoop {
  key: string;
  volume: number;
  playbackRate: number;
}

function unlockAudio(): void {
  audioEnabled = true;
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
  if (track.startsWith('/')) return track;
  return `/sounds/${track}`;
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

function getOneShotPoolSize(key: string): number {
  switch (key) {
    case LASER_SOUND_KEY:
      return 14;
    case CLASH_SOUND_KEY:
    case CLASH_SOUND_KEY_2:
    case EXPLOSION_SOUND_KEY:
    case EXPLOSION_SOUND_KEY_2:
      return 10;
    case PICKUP_SOUND_KEY:
    case ZOMBIE_SLASH_SOUND_KEY:
    case SPIDERLEG_SOUND_KEY:
      return 6;
    case ZOMBIE_ROAR_SOUND_KEY:
      return 10;
    default:
      return 8;
  }
}

function getOneShotPoolMaxSize(key: string): number {
  switch (key) {
    case LASER_SOUND_KEY:
      return 20;
    case ZOMBIE_ROAR_SOUND_KEY:
      return 18;
    case CLASH_SOUND_KEY:
    case CLASH_SOUND_KEY_2:
    case EXPLOSION_SOUND_KEY:
    case EXPLOSION_SOUND_KEY_2:
      return 14;
    default:
      return getOneShotPoolSize(key);
  }
}

function getOneShotPool(key: string, url: string): HTMLAudioElement[] {
  let pool = oneShotVoicePools.get(key);
  if (pool) return pool;

  const size = getOneShotPoolSize(key);
  pool = [];
  for (let i = 0; i < size; i += 1) {
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.load();
    pool.push(audio);
  }
  oneShotVoicePools.set(key, pool);
  oneShotPoolIndices.set(key, 0);
  return pool;
}

function createOneShotVoice(url: string): HTMLAudioElement {
  const audio = new Audio(url);
  audio.preload = 'auto';
  audio.load();
  return audio;
}

function pickOneShotVoice(key: string, url: string): HTMLAudioElement {
  const pool = getOneShotPool(key, url);
  for (const voice of pool) {
    if (voice.paused || voice.ended) return voice;
  }

  const maxSize = getOneShotPoolMaxSize(key);
  if (pool.length < maxSize) {
    const voice = createOneShotVoice(url);
    pool.push(voice);
    return voice;
  }

  const nextIndex = oneShotPoolIndices.get(key) ?? 0;
  oneShotPoolIndices.set(key, (nextIndex + 1) % pool.length);
  return pool[nextIndex];
}

function playOneShot(key: string, url: string, volume: number, playbackRate: number): void {
  if (!audioEnabled) return;

  getPreloadedAudio(key, url);
  const voice = pickOneShotVoice(key, url);
  if (!voice.paused) voice.pause();
  voice.currentTime = 0;
  voice.volume = volume;
  voice.playbackRate = playbackRate;
  void voice.play().catch(() => {});
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
  audio.volume = clampedVolume;
  audio.playbackRate = clampedRate;

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

  getOneShotPool(CLASH_SOUND_KEY, CLASH_SOUND_URL);
  getOneShotPool(CLASH_SOUND_KEY_2, CLASH_SOUND_URL_2);
  getOneShotPool(EXPLOSION_SOUND_KEY, EXPLOSION_SOUND_URL);
  getOneShotPool(EXPLOSION_SOUND_KEY_2, EXPLOSION_SOUND_URL_2);
  getOneShotPool(LASER_SOUND_KEY, LASER_SOUND_URL);
  getPreloadedAudio(SCRAPE_SOUND_KEY, SCRAPE_SOUND_URL);
  getOneShotPool(PICKUP_SOUND_KEY, PICKUP_SOUND_URL);
  getOneShotPool(ZOMBIE_SLASH_SOUND_KEY, ZOMBIE_SLASH_SOUND_URL);
  getOneShotPool(ZOMBIE_ROAR_SOUND_KEY, ZOMBIE_ROAR_SOUND_URL);
  getOneShotPool(SPIDERLEG_SOUND_KEY, SPIDERLEG_SOUND_URL);
  getLoopingAudio(getAmbientLoopKey(DEFAULT_AMBIENT_SOUND_URL), DEFAULT_AMBIENT_SOUND_URL);
  getPreloadedAudio(`${SPINNER_MOTOR_PREFIX}template`, SPINNER_MOTOR_SOUND_URL);
  window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
  window.addEventListener('keydown', unlockAudio, { once: true });
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
