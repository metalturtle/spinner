// Background music via the YouTube IFrame Player API.
// The player is hosted inside an off-screen <div> (NOT display:none — the
// IFrame API requires the iframe to be rendered for playback to work). The
// first call to `playYoutubeMusic` must happen inside a user-gesture handler
// (e.g. the START GAME button) to satisfy browser autoplay policies.

declare global {
  interface Window {
    YT?: {
      Player: new (target: HTMLElement | string, config: YTPlayerConfig) => YTPlayer;
      PlayerState: { UNSTARTED: -1; ENDED: 0; PLAYING: 1; PAUSED: 2; BUFFERING: 3; CUED: 5 };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  setVolume(volume: number): void;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
}

interface YTPlayerConfig {
  height?: string | number;
  width?: string | number;
  videoId: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YTPlayer }) => void;
    onStateChange?: (event: { target: YTPlayer; data: number }) => void;
  };
}

const HOST_ID = 'yt-bg-music-host';

let apiReadyPromise: Promise<void> | null = null;
let player: YTPlayer | null = null;
let pendingPlay = false;
let pendingVolume: number | null = null;

function loadYouTubeAPI(): Promise<void> {
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise<void>((resolve) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    document.head.appendChild(script);
  });

  return apiReadyPromise;
}

export interface YoutubeMusicOptions {
  /** 0..1; clamped. Defaults to 0.4. */
  volume?: number;
  /** Loops indefinitely when true. Defaults to true. */
  loop?: boolean;
}

export async function initYoutubeMusic(videoId: string, options: YoutubeMusicOptions = {}): Promise<void> {
  if (player) return;
  await loadYouTubeAPI();
  if (!window.YT?.Player) return;

  // Off-screen host. NOT display:none — the iframe must remain rendered.
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = [
    'position:fixed',
    'left:-9999px',
    'top:0',
    'width:1px',
    'height:1px',
    'pointer-events:none',
    'opacity:0',
  ].join(';');
  document.body.appendChild(host);

  const inner = document.createElement('div');
  host.appendChild(inner);

  const loop = options.loop ?? true;
  const initialVolume = Math.max(0, Math.min(1, options.volume ?? 0.4));

  const playerVars: Record<string, string | number> = {
    playsinline: 1,
    controls: 0,
    disablekb: 1,
    modestbranding: 1,
    rel: 0,
    iv_load_policy: 3,
  };
  if (loop) {
    // YouTube's loop param needs `playlist` set to the same video to function.
    playerVars.loop = 1;
    playerVars.playlist = videoId;
  }

  player = new window.YT.Player(inner, {
    height: '180',
    width: '320',
    videoId,
    playerVars,
    events: {
      onReady: (event) => {
        event.target.setVolume(Math.round(initialVolume * 100));
        if (pendingVolume !== null) {
          event.target.setVolume(Math.round(pendingVolume * 100));
          pendingVolume = null;
        }
        if (pendingPlay) {
          event.target.playVideo();
          pendingPlay = false;
        }
      },
      onStateChange: (event) => {
        // Defensive looping: even with loop=1, some browsers fire ENDED once.
        if (loop && window.YT && event.data === window.YT.PlayerState.ENDED) {
          event.target.seekTo(0, true);
          event.target.playVideo();
        }
      },
    },
  });
}

export function playYoutubeMusic(): void {
  if (player) {
    player.playVideo();
  } else {
    pendingPlay = true;
  }
}

export function pauseYoutubeMusic(): void {
  pendingPlay = false;
  player?.pauseVideo();
}

export function setYoutubeMusicVolume(volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume));
  if (player) {
    player.setVolume(Math.round(clamped * 100));
  } else {
    pendingVolume = clamped;
  }
}
