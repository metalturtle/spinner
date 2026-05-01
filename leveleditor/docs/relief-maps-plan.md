# Relief Maps Plan

## Goal

Add optional normal/bump map support for textured polygons and circles so authored surfaces can gain lighting detail in `spinner`, while keeping the level editor workflow simple.

## Current State

- Shapes already support `textureId` and `textureScale`
- Textures are discovered from the shared folder at `spinner-game/textures`
- `spinner` already applies base color textures to floor and wall materials
- The current shared texture set includes:
  - `rock_wall_16.jpg`
  - `rock_wall_16_disp_1k.png`
  - `rock_wall_16_normal.exr`
  - `rock_wall_16_rough_1k.exr`

This means we already have a real companion-map set to build against.

## Design Decision

Use a single per-shape toggle instead of manual map pickers.

- Keep `textureId` as the selected base texture
- Add a boolean shape field for relief usage
- Resolve companion maps automatically from the texture library

Recommended field:

- `useReliefMap?: boolean`

Supported objects in v1:

- polygons
- circles

## Map Resolution Rules

Companion maps should be grouped by texture family in the shared texture library.

Preferred map priority:

1. `normalMap`
2. fallback `bumpMap`

Filename patterns to support in v1:

- base color: `_diff`, `_albedo`, `_basecolor`
- normal: `_nor`, `_normal`
- bump/displacement: `_disp`, `_height`, `_bump`
- roughness: `_rough`

For the current texture set:

- normal map should come from `rock_wall_16_normal.exr`
- bump fallback can come from `rock_wall_16_disp_1k.png`

## Phase 1: Shared Texture Metadata

Extend the shared texture discovery so each texture definition can expose:

- `baseColorSrc`
- `normalSrc?`
- `bumpSrc?`
- `roughnessSrc?`
- `hasRelief`

Implementation notes:

- do this in the shared texture-library generation path, not ad hoc in renderers
- keep the texture `id` stable and based on the base-color texture
- non-color maps must not be treated as sRGB textures

Definition of done:

- texture definitions know whether a matching relief map exists
- current rock wall texture resolves normal/displacement companions correctly

## Phase 2: Level Data Model

Add relief usage to polygons and circles:

- `useReliefMap?: boolean`

Update:

- editor-side shape types
- snapshot load/save
- property editing command path
- any cleanup/backfill logic

Definition of done:

- relief toggle persists in level JSON
- missing/false values remain backward compatible

## Phase 3: Level Editor UI

Add a toggle to the Properties panel for polygons and circles.

Behavior:

- show the toggle only if the selected `textureId` has a relief companion
- label it clearly, e.g. `Use Relief`
- hide or disable it when no compatible map exists

Editor rendering:

- normal edit mode does not need full relief preview
- true-light mode may optionally use the normal/bump map if cheap enough

Definition of done:

- user can enable/disable relief per textured polygon/circle
- no extra map-selection UI is required

## Phase 4: Spinner Material Support

Update runtime material creation for textured floors and walls.

Rules:

- if `useReliefMap` is true and `normalSrc` exists, use `normalMap`
- else if `useReliefMap` is true and `bumpSrc` exists, use `bumpMap`
- otherwise keep the current material path

Initial tuning:

- floor `normalScale` should be subtle
- wall `normalScale` can be a bit stronger
- if using `bumpMap`, start with conservative `bumpScale`

Important:

- base color maps use sRGB
- normal, bump, roughness maps use linear/non-color handling

Definition of done:

- enabling relief changes runtime lighting response in `spinner`
- disabling relief falls back to the existing texture-only surface

## Phase 5: Optional Enhancements

After v1 works, consider:

- roughness map hookup
- editor true-light relief preview
- per-surface strength controls
- texture manifest overrides for unusual naming

## Risks

### Naming ambiguity

Not all texture packs use the same suffixes.

Mitigation:

- start with a small supported pattern set
- add manifest overrides later if needed

### EXR handling

Normal or roughness maps stored as `.exr` may need loader support beyond `TextureLoader`.

Mitigation:

- verify whether current Vite/Three setup handles `.exr`
- if not, either add an EXR loader path or prefer PNG/JPG companion maps first

### Editor complexity

Too much map UI would clutter the inspector.

Mitigation:

- keep v1 to one boolean toggle

## Recommended First Implementation Slice

1. extend texture metadata discovery
2. add `useReliefMap` to polygons/circles
3. add Properties panel toggle
4. apply normal map in `spinner` when available
5. fallback to bump/displacement if no normal map exists

## Success Criteria

- user selects a textured polygon or circle
- if a companion relief map exists, the editor shows a toggle
- saving preserves that toggle in level data
- loading the level in `spinner` uses the relief map automatically
- current rock wall texture gains visible runtime surface detail
