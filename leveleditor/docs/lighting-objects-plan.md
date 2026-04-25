# Lighting Objects Plan

## Goal

Add placeable lighting objects that work in both:

- the level editor
- the `spinner` game runtime

The first version should let us place lights in the editor, edit their core properties, save them into level JSON, and have the game instantiate matching Three.js lights when the level loads.

## Recommendation

Implement lights as `entities`, not as a new top-level level-data section.

This fits the current architecture well because:

- the editor already supports entity placement, selection, editing, and serialization
- the game already imports generic level entities
- lights are point-like scene objects with properties, which matches entity behavior closely

## V1 Scope

Start with one light type:

- `light_point`

This should be enough to validate the full workflow without adding too much UI or runtime complexity.

## Why Use Entities

Using entities avoids introducing a parallel system for objects that are already:

- placeable
- selectable
- serializable
- editable through the properties panel

It also keeps the level format simpler and easier to evolve.

## Proposed Data Model

Keep the existing `EntityData` shape and store light settings in `properties`.

### Entity type

- `type: "light_point"`

### Suggested properties

- `color`
- `intensity`
- `range`
- `decay`
- `height`

Example:

```json
{
  "id": "light_1",
  "name": "Point Light 1",
  "type": "light_point",
  "position": { "x": 4, "y": 7 },
  "rotation": 0,
  "properties": {
    "color": "#ffaa66",
    "intensity": "2.5",
    "range": "8",
    "decay": "1.5",
    "height": "1.8"
  }
}
```

## Editor Plan

## Phase 1: Add Light Entity Type

### Goal

Let the editor place light entities just like other entities.

### Changes

- add `light_point` to the entity type dropdown in `index.html`
- allow `EntityTool` to create light entities
- choose sensible defaults for newly placed lights

### Suggested defaults

- `color = "#ffd080"`
- `intensity = "2.0"`
- `range = "8"`
- `decay = "1.5"`
- `height = "1.5"`

### Acceptance Criteria

- user can select `light_point`
- clicking in the editor places a light entity
- light entity saves and loads correctly

## Phase 2: Editor Visual Marker

### Goal

Make light entities easy to identify in the editor.

### Changes

- update `EntityRenderer` to render `light_point` differently from spawn/trigger/waypoint
- use a distinct color, likely warm yellow or amber
- optionally draw a radius ring that reflects `range`

### Recommendation

For V1:

- use a stronger light-specific marker color
- optionally render a simple ring for `range`

Do not try to simulate real lighting in the editor yet.

### Acceptance Criteria

- light entities are visually distinct
- range is easy to understand at a glance if ring preview is included

## Phase 3: Properties Panel Support

### Goal

Expose light properties in a clean way in the editor inspector.

### Changes

- update `PropertiesPanel`
- when selected entity type is `light_point`, show:
  - Color
  - Intensity
  - Range
  - Decay
  - Height

### Recommendation

Keep these as explicit fields in the panel rather than leaving them buried in generic custom properties.

### Acceptance Criteria

- selecting a light shows light-specific controls
- editing values updates the entity
- changes are saved into the level JSON

## Phase 4: Undo/Redo

### Goal

Make light editing feel like normal editor work.

### Changes

- ensure light property edits go through commands
- preserve undo/redo behavior for:
  - placement
  - deletion
  - light property changes

### Acceptance Criteria

- undo/redo works for all light edits

## Spinner Runtime Plan

## Phase 5: Runtime Light Instantiation

### Goal

Convert level light entities into real Three.js lights when a level loads.

### Changes

- scan imported level entities for `type === "light_point"`
- create `THREE.PointLight` instances
- place them in world space using:
  - `x -> x`
  - `y -> z`
  - `height -> y`

### Recommendation

Create a dedicated level-light setup pass instead of forcing this into the enemy/entity gameplay systems.

These are environment objects, not gameplay-controlled ECS entities.

### Acceptance Criteria

- level loads instantiate point lights from level JSON
- light color/intensity/range/decay/height are respected

## Phase 6: Runtime Cleanup / Reset

### Goal

Make level lights behave correctly when the level reloads or resets.

### Changes

- track created lights/groups
- remove them cleanly during level teardown/reset

### Acceptance Criteria

- no duplicate lights after reset
- no leaked runtime light objects

## Performance Guidance

Real dynamic lights can get expensive quickly, so V1 should stay conservative.

### Recommendation

For placed level lights in V1:

- use `THREE.PointLight`
- do **not** enable per-light shadows
- assume a modest number of lights per level

### Why

This keeps the system usable without immediately turning lighting into a performance problem.

## Coordinate System Notes

The level editor is 2D:

- entity position is `{ x, y }`

The game world is effectively XZ ground plane plus vertical Y:

- level `x -> game x`
- level `y -> game z`
- light `height -> game y`

This is why `height` should be a first-class light property.

## Non-Goals For V1

Do not include these in the first pass:

- spotlight support
- area lights
- baked lighting
- editor-side physically accurate light preview
- shadow-casting placed lights
- animated or flickering light behavior
- light linking/masking

## Nice-to-Have Later

After `light_point` works end to end, possible next steps:

- `light_spot`
- flicker/pulse properties
- range gizmos with better editing handles
- light grouping or tags
- optional shadow flag for hero lights
- color temperature presets

## Suggested File Touch List

### Level editor

- `index.html`
- `src/tools/EntityTool.ts`
- `src/rendering/EntityRenderer.ts`
- `src/ui/PropertiesPanel.ts`
- `src/data/Serializer.ts` if any explicit handling is needed

### Spinner

- `src/levelLoader.ts`
- likely a new level-light runtime module
- `src/game.ts` or another scene/bootstrap path depending on where level setup belongs

## Suggested Runtime Module

Consider a dedicated file such as:

- `spinner/src/levelLights.ts`

Responsibilities:

- read `light_point` entities
- create/remove Three.js lights
- keep bootstrap/reset logic tidy

## Risks

### 1. Too many real lights

This is the biggest technical risk.

Mitigation:

- start with no shadows
- keep light counts reasonable

### 2. Editor/runtime mismatch

If the editor preview becomes too fancy or too different from runtime, users may place lights based on misleading feedback.

Mitigation:

- keep editor preview symbolic
- keep runtime behavior simple and predictable

### 3. Property typing

Because entity properties are stored as strings, runtime parsing must be careful.

Mitigation:

- parse with defaults
- clamp invalid values

## Recommended Order

1. add `light_point` entity type in the editor
2. add editor marker rendering
3. add light-specific inspector controls
4. add runtime light instantiation in `spinner`
5. add reset/cleanup handling
6. polish preview/range ring if needed

## Definition Of Done

This feature is complete for V1 when:

- lights can be placed in the editor
- lights can be selected and edited in the properties panel
- lights are saved into level JSON
- `spinner` loads those lights and creates working `PointLight`s
- reset/reload does not duplicate them
- the performance remains acceptable with a small number of level lights
