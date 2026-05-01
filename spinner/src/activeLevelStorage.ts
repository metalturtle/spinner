import type { LevelData } from './levelLoader';

const ACTIVE_LEVEL_STORAGE_KEY = 'spinner.activeLevel';

function getBrowserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadActiveLevelFromBrowser(): LevelData | null {
  const storage = getBrowserStorage();
  if (!storage) return null;

  const raw = storage.getItem(ACTIVE_LEVEL_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as LevelData;
  } catch (error) {
    console.warn('Failed to parse browser-stored active level:', error);
    return null;
  }
}
