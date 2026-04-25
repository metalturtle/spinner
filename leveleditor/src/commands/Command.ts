export interface Command {
  description: string;
  execute(): void;
  undo(): void;
}
