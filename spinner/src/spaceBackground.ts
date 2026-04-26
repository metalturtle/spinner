const GALAXY_VIDEO_URL = new URL('../video/galaxy.mov', import.meta.url).href;

let videoEl: HTMLVideoElement | null = null;

function tryPlayVideo(): void {
  if (!videoEl) return;
  void videoEl.play().catch(() => {
    // Autoplay may be blocked until the first user interaction.
  });
}

export function initSpaceBackground(): void {
  if (videoEl) return;

  const video = document.createElement('video');
  video.className = 'space-background-video';
  video.src = GALAXY_VIDEO_URL;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.autoplay = true;
  video.setAttribute('aria-hidden', 'true');
  videoEl = video;

  document.body.prepend(video);
  tryPlayVideo();
  window.addEventListener('pointerdown', tryPlayVideo, { passive: true });
  window.addEventListener('keydown', tryPlayVideo);
}

export function updateSpaceBackground(_time: number): void {
  if (!videoEl) return;
}
