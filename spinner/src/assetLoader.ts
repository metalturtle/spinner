export interface LoadTask {
  label: string;
  weight?: number;
  run: () => Promise<void>;
}

export interface LoadProgressState {
  activeLabel: string;
  completedTasks: number;
  totalTasks: number;
  completedWeight: number;
  totalWeight: number;
  progress: number;
}

function buildProgressState(
  tasks: readonly LoadTask[],
  completedTasks: number,
  completedWeight: number,
  activeLabel: string,
): LoadProgressState {
  const totalWeight = tasks.reduce((sum, task) => sum + Math.max(0.001, task.weight ?? 1), 0);
  return {
    activeLabel,
    completedTasks,
    totalTasks: tasks.length,
    completedWeight,
    totalWeight,
    progress: totalWeight > 0 ? Math.min(1, completedWeight / totalWeight) : 1,
  };
}

export async function runLoadTasks(
  tasks: readonly LoadTask[],
  onProgress?: (state: LoadProgressState) => void,
): Promise<void> {
  if (tasks.length === 0) {
    onProgress?.({
      activeLabel: 'Ready',
      completedTasks: 0,
      totalTasks: 0,
      completedWeight: 1,
      totalWeight: 1,
      progress: 1,
    });
    return;
  }

  let completedWeight = 0;
  onProgress?.(buildProgressState(tasks, 0, 0, tasks[0]?.label ?? 'Preparing'));

  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    onProgress?.(buildProgressState(tasks, index, completedWeight, task.label));
    await task.run();
    completedWeight += Math.max(0.001, task.weight ?? 1);
    const nextLabel = tasks[index + 1]?.label ?? 'Ready';
    onProgress?.(buildProgressState(tasks, index + 1, completedWeight, nextLabel));
  }
}
