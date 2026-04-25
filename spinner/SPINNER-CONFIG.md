# Spinner Config — Design

## Problem

Spinner properties currently live as module-level constants imported from `constants.ts`.
They can't change at runtime, so upgrades aren't possible without rearchitecting later.

## Solution

Extract all spinner-owned properties into a single mutable object: `spinnerConfig`.
Game code reads from it every frame. An upgrade is just:

```typescript
spinnerConfig.rpmHalfPoint += 20;
spinnerConfig.rpmDecayRate  -= 0.2;
playerBody.mass = spinnerConfig.mass; // sync collidable if mass changes
```

No other change needed — the game loop picks it up on the next frame.

---

## What goes in SpinnerConfig

These are properties that belong to *this specific spinner*, not the world:

| Property       | Initial | Unit         | Upgrade archetype        |
|----------------|---------|--------------|--------------------------|
| `radius`       | 0.5     | world units  | Size — bigger hitbox     |
| `mass`         | 1.0     | kg           | Weight — hits harder     |
| `maxSpeed`     | 15      | units/s      | Mobility                 |
| `acceleration` | 25      | units/s²     | Mobility                 |
| `friction`     | 0.97    | multiplier/frame | Control feel         |
| `spinSpeed`    | 12      | rad/s        | Visual power             |
| `rpmDecayRate` | 1.0     | RPM/s        | Endurance — lasts longer |
| `rpmSpeedDrain`| 0.3     | RPM/(unit/s)/s | Efficiency             |
| `rpmSoftCap`   | 70      | RPM          | Stamina — overdrain threshold rises |
| `rpmHalfPoint` | 100     | RPM          | Capacity — pickups more effective at high RPM |

## What stays in constants.ts (world rules)

These are fixed rules of the arena, not properties of any one spinner:

| Constant             | Reason it stays global                          |
|----------------------|-------------------------------------------------|
| `RPM_MAX`            | Physics normaliser — used for effective mass    |
| `RPM_HYPER_MAX`      | Visual reference for overcharge glow            |
| `RPM_OVERDRAIN`      | World rule — cost of being overcharged          |
| `WALL_RPM_PENALTY`   | World rule — wall bounce cost                   |
| `PICKUP_RPM_BOOST`   | Pickup property, not spinner property           |
| `HYPER_BOOST`        | Pickup property                                 |
| `BASE_COLLISION_DAMAGE` | World rule — base damage coefficient        |
| `RESTITUTION`        | World physics constant                          |
| `ARENA_SIZE`         | Arena property                                  |
| `WALL_HEIGHT/THICKNESS` | Arena property                              |
| `OBSTACLE_MASS`      | Obstacle property                               |

---

## Upgrade flow (future)

Upgrades will be applied between rounds or via in-arena pickups. Each upgrade
mutates one or more `spinnerConfig` fields. If `radius` or `mass` change, the
caller must also update `playerBody.radius` / `playerBody.mass`.

Example upgrade definitions (future):

```typescript
const UPGRADES = {
  capacity:   { rpmHalfPoint: +25 },          // pickups more effective
  endurance:  { rpmDecayRate: -0.15 },         // slower natural drain
  stamina:    { rpmSoftCap: +10 },             // overdrain kicks in later
  mobility:   { maxSpeed: +2, acceleration: +3 },
  heavyweight:{ mass: +0.3 },                  // hit harder, hit slower
};
```

---

## Why a plain mutable object (not a class or reactive store)

- The game loop already reads every relevant value every frame — no change needed.
- Upgrades are rare, discrete events — no need for subscriptions.
- TypeScript's structural typing keeps it safe without boilerplate.
- Easy to serialise for save/load later.
