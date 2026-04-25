import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Camera } from './Camera';
import { Grid } from './Grid';
import { InputManager } from './InputManager';
import { Selection } from './Selection';
import { LevelData } from '../data/LevelData';
import { CommandHistory } from '../commands/CommandHistory';
import type { Tool } from '../tools/Tool';

export class Editor {
  readonly renderer: Renderer;
  readonly camera: Camera;
  readonly grid: Grid;
  readonly input: InputManager;
  readonly selection: Selection;
  readonly levelData: LevelData;
  readonly commandHistory: CommandHistory;
  readonly scene: THREE.Scene;

  private tools = new Map<string, Tool>();
  private activeToolName = '';

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.renderer = new Renderer(canvas);
    this.camera = new Camera();
    this.grid = new Grid(this.scene, this.camera);
    this.input = new InputManager(canvas, this.camera);
    this.selection = new Selection();
    this.levelData = new LevelData();
    this.commandHistory = new CommandHistory();

    // Global keyboard shortcuts
    window.addEventListener('keydown', (e) => this.onGlobalKeyDown(e));
  }

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  setActiveTool(name: string): void {
    const tool = this.tools.get(name);
    if (!tool) return;
    this.activeToolName = name;
    this.input.setActiveTool(tool);
  }

  getActiveTool(): string {
    return this.activeToolName;
  }

  private onGlobalKeyDown(e: KeyboardEvent): void {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;

    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.commandHistory.undo();
    } else if (e.ctrlKey && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      this.commandHistory.redo();
    } else if (e.ctrlKey && e.key === 'y') {
      e.preventDefault();
      this.commandHistory.redo();
    }
  }

  start(): void {
    const loop = () => {
      requestAnimationFrame(loop);
      this.camera.update();
      this.grid.rebuild();
      this.renderer.render(this.scene, this.camera.camera);
    };
    loop();
  }
}
