import { LevelData } from './LevelData';
import type { LevelDataSnapshot } from './LevelData';

export function saveLevel(levelData: LevelData): void {
  const snapshot = levelData.toSnapshot();
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'level.json';
  a.click();
  URL.revokeObjectURL(url);
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
