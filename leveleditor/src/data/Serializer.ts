import { LevelData } from './LevelData';
import type { LevelDataSnapshot } from './LevelData';
import { loadActiveLevelFromBrowser, saveActiveLevelToBrowser } from './activeLevelStorage';

export async function saveLevel(levelData: LevelData): Promise<'server' | 'local' | 'download'> {
  const snapshot = levelData.toSnapshot();
  const json = JSON.stringify(snapshot, null, 2);
  const savedToBrowser = saveActiveLevelToBrowser(snapshot);

  try {
    const response = await fetch('/api/active-level', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return 'server';
  } catch (error) {
    if (savedToBrowser) {
      console.warn('Falling back to browser storage save:', error);
      return 'local';
    }

    console.warn('Falling back to download save:', error);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'level-active.json';
    a.click();
    URL.revokeObjectURL(url);
    return 'download';
  }
}

export async function loadActiveLevel(levelData: LevelData): Promise<boolean> {
  try {
    const response = await fetch('/api/active-level');
    if (!response.ok) {
      if (response.status === 404) return false;
      throw new Error(await response.text());
    }

    const snapshot = await response.json() as LevelDataSnapshot;
    levelData.fromSnapshot(snapshot);
    return true;
  } catch (error) {
    console.warn('Failed to load active level from the dev API:', error);
  }

  const browserSnapshot = loadActiveLevelFromBrowser();
  if (!browserSnapshot) return false;

  levelData.fromSnapshot(browserSnapshot);
  return true;
}

export function loadLevel(levelData: LevelData): void {
  const input = document.getElementById('file-input') as HTMLInputElement;
  input.value = '';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const snapshot = JSON.parse(reader.result as string) as LevelDataSnapshot;
        levelData.fromSnapshot(snapshot);
      } catch (e) {
        console.error('Failed to load level:', e);
        alert('Failed to load level file. Check console for details.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
