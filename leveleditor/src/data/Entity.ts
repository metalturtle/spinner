export interface EntityData {
  id: string;
  name: string;
  type: string;
  position: { x: number; y: number };
  rotation: number;
  properties: Record<string, string>;
}
