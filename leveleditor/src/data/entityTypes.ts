export interface EntityTypeOption {
  value: string;
  label: string;
  color?: number;
}

export const CUSTOM_ENTITY_TYPE_VALUE = '__custom__';

export const ENTITY_TYPE_OPTIONS: EntityTypeOption[] = [
  { value: 'player_spawn', label: 'Player Spawn', color: 0x44ff44 },
  { value: 'pickup', label: 'Pickup', color: 0x4dd0e1 },
  { value: 'pickup_hyper', label: 'Hyper Pickup', color: 0x80ffff },
  { value: 'obstacle', label: 'Obstacle', color: 0xb08b5b },
  { value: 'robot', label: 'Robot', color: 0xff6666 },
  { value: 'siege_engine', label: 'Siege Engine', color: 0xff9966 },
  { value: 'turret', label: 'Turret', color: 0xffaa44 },
  { value: 'enemy_spinner', label: 'Enemy Spinner', color: 0xcc66ff },
  { value: 'dreadnought', label: 'Dreadnought', color: 0xff4455 },
  { value: 'hive_boss', label: 'Hive Boss', color: 0xff77aa },
  { value: 'slug_big', label: 'Big Slug', color: 0x88ff66 },
  { value: 'slug_baby', label: 'Baby Slug', color: 0xaaff88 },
  { value: 'fire_torch', label: 'Fire Torch', color: 0xff8a33 },
  { value: 'light_point', label: 'Point Light', color: 0xffd066 },
  { value: 'trigger', label: 'Trigger', color: 0xff8844 },
  { value: 'waypoint', label: 'Waypoint', color: 0x4488ff },
  { value: 'spawn', label: 'Spawn (Legacy)', color: 0x44ff44 },
];

export const ENTITY_TYPE_COLORS: Record<string, number> = Object.fromEntries(
  ENTITY_TYPE_OPTIONS
    .filter((option) => option.color !== undefined)
    .map((option) => [option.value, option.color as number]),
);

export function isKnownEntityType(type: string): boolean {
  return ENTITY_TYPE_OPTIONS.some((option) => option.value === type);
}

export function getEntityTypeLabel(type: string): string {
  return ENTITY_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}
