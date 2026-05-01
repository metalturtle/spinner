import type { LevelDataSnapshot } from './LevelData';

const ACTIVE_LEVEL_STORAGE_KEY = 'spinner.activeLevel';

function getBrowserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveActiveLevelToBrowser(snapshot: LevelDataSnapshot): boolean {
  const storage = getBrowserStorage();
  if (!storage) return false;

  try {
    storage.setItem(ACTIVE_LEVEL_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (error) {
    console.warn('Failed to save active level to browser storage:', error);
    return false;
  }
}

export function loadActiveLevelFromBrowser(): LevelDataSnapshot | null {
  const storage = getBrowserStorage();
  if (!storage) return null;

  const raw = storage.getItem(ACTIVE_LEVEL_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as LevelDataSnapshot;
  } catch (error) {
    console.warn('Failed to parse browser-stored active level:', error);
    return null;
  }
}
