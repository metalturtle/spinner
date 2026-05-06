# Project Analysis: Level Editor

## Overview

This project is a browser-based 2D level editor built with TypeScript, Vite, and Three.js. It focuses on geometry authoring rather than game runtime logic: users can create polygons, circles, room outlines, regular polygons, and point entities, then edit them with selection, dragging, properties, save/load, grid snapping, and polygon boolean operations.

At a high level, the app is small, readable, and organized around a clean editor core:

- `Editor` composes the runtime pieces.
- `LevelData` stores the authoritative document state.
- renderers subscribe to `LevelData` events and mirror data into Three.js objects.
- tools interpret user input and turn edits into commands.
- `CommandHistory` provides undo/redo for command-backed changes.

That overall shape is good. The codebase is approachable, and most features are easy to trace from UI event to state mutation to render update.

## Stack

- Build/dev: Vite
- Language: TypeScript
- Rendering: Three.js with an orthographic camera
- Geometry ops: `polygon-clipping`
- UI style: direct DOM + HTML/CSS, no framework

## Project Structure

### Entry and UI shell

- `index.html`: toolbar, panels, status bar, hidden file input
- `src/main.ts`: app bootstrap, renderer/tool registration, toolbar wiring, save/load, CSG actions
- `styles/editor.css`: editor layout and styling

### Editor runtime

- `src/editor/Editor.ts`: root composition, tool registration, render loop, global undo/redo shortcuts
- `src/editor/InputManager.ts`: pointer/keyboard routing, grid snapping, snap cursor integration
- `src/editor/Camera.ts`: orthographic camera, zoom, pan, WASD movement
- `src/editor/Selection.ts`: single + multi-selection state
- `src/editor/Grid.ts`, `src/editor/Renderer.ts`: viewport visuals and render orchestration

### Data model

- `src/data/LevelData.ts`: in-memory document model plus event bus
- `src/data/Polygon.ts`
- `src/data/Circle.ts`
- `src/data/Entity.ts`
- `src/data/Serializer.ts`: JSON save/load

### Editing behavior

- `src/tools/*`: authoring tools and selection behavior
- `src/commands/*`: undoable edits
- `src/ui/PropertiesPanel.ts`: inspector-style property editing

### Rendering

- `src/rendering/*`: shape/entity/gizmo/snap-cursor rendering layers

### Utilities

- `src/utils/math.ts`: coordinate conversions and snapping helpers
- `src/utils/csg.ts`: polygon boolean conversion helpers
- `src/utils/ids.ts`: ID generation

## Runtime Flow

The most important runtime loop looks like this:

1. `src/main.ts` creates the `Editor`, renderers, tools, and UI bindings.
2. User input reaches `InputManager`.
3. `InputManager` converts screen coordinates to world coordinates and applies optional grid snapping.
4. The active tool handles the normalized editor event.
5. Tools usually create a command such as `AddPolygonCmd`, `MoveObjectCmd`, or `BooleanOpCmd`.
6. The command mutates `LevelData`.
7. `LevelData` emits events like `polygon-added` or `entity-changed`.
8. Renderers listen for those events and rebuild the affected Three.js objects.

This event-driven split is one of the strongest parts of the project. State and rendering are not tightly interleaved, which makes the code easier to extend.

## Data Model Notes

The saved file format is a simple JSON snapshot with:

- `version`
- `unit`
- `gridSize`
- `polygons`
- `circles`
- `entities`

`LevelData` is both the document model and the app-wide event source. That works well at this size, though it also means there is no separate validation layer between imported JSON and runtime state.

## What Is Working Well

### 1. Clear architecture for a small editor

The app avoids overengineering but still separates concerns in a healthy way:

- tools own interaction logic
- commands own undoable mutations
- renderers own scene objects
- `LevelData` owns persisted state

That makes feature discovery fast for new contributors.

### 2. Command pattern is used in the right places

Create/move/delete/property changes mostly go through commands, which gives the editor a real foundation for undo/redo instead of bolting it on later.

### 3. Low-friction UI

Using plain DOM for toolbars and panels keeps the UI surface easy to reason about. For an internal editor or early-stage tool, this is a sensible tradeoff.

### 4. Good fit for orthographic editing

Three.js is being used in a focused way: 2D geometry in world space with an orthographic camera, lightweight overlays, and simple hit testing through raycasting.

## Risks and Gaps

### 1. Current build is failing

Running `npm run build` currently fails with:

- `src/tools/SelectTool.ts`: `Property 'holes' does not exist on type 'PolygonData'`

This is the most immediate issue because it blocks production builds and signals a mismatch between the polygon editing logic and the declared data model.

### 2. Polygon model and CSG support are out of sync

There are signs the editor wants to support polygon holes:

- `SelectTool` tries to move `poly.holes`
- `src/utils/csg.ts` only converts the exterior ring and only reads `polygon[0]` on the way back
- `PolygonData` does not declare a `holes` field

This means the geometry model is currently inconsistent. If hole support is planned, the type model, renderer, serializer, commands, and CSG conversion need to be updated together.

### 3. Some property edits bypass undo/redo

`PropertiesPanel` uses `EditPropertyCmd` for many field changes, but custom property add/delete mutates objects directly and only emits change notifications. That creates an inconsistent editor experience:

- some edits are undoable
- some edits are permanent unless manually reversed

For an editor, users usually expect the inspector to be fully undoable.

### 4. Coordinate math is tied to the window, not the canvas

Several conversions use `window.innerWidth` / `window.innerHeight` instead of canvas dimensions. That is okay only while the canvas fills the viewport exactly. If the layout changes, picking and close-threshold logic can drift.

This shows up in:

- `SelectTool.toNDC`
- `PolygonTool.worldToScreen`
- camera projection sizing logic

### 5. Undo history is not obviously reset on load

`loadLevel()` replaces the in-memory level snapshot, but the bootstrap code does not also clear selection and command history. That can leave stale undo/redo state after loading a different file.

### 6. Direct HTML rendering in the properties panel increases UI risk

`PropertiesPanel` builds inspector markup with `innerHTML`. The code does escape string values, which helps, but the panel logic is still fairly manual and easy to drift as fields grow more complex.

This is not a crisis today, just a maintainability pressure point.

## Recommended Next Steps

### High priority

1. Fix the polygon data model mismatch so `npm run build` passes.
2. Decide whether polygon holes are officially supported.
3. Make all property panel mutations command-backed.
4. Clear command history and selection after loading a level.

### Medium priority

1. Normalize all coordinate conversions around the canvas bounds.
2. Add import validation for malformed JSON snapshots.
3. Introduce a small test layer around:
   - command behavior
   - serialization round-trips
   - boolean operations

### Nice-to-have

1. Add explicit editor state for dirty/unsaved changes.
2. Add keyboard shortcut/help discoverability in the UI.
3. Separate document state events from persistence/version migration logic if the app grows.

## Suggested Mental Model For Contributors

When changing behavior, start from this question:

"Is this a new interaction, a new mutation, or a new visual?"

That usually points to the right place:

- interaction -> `src/tools`
- mutation/undo -> `src/commands`
- persisted shape state -> `src/data`
- scene output -> `src/rendering`
- app wiring -> `src/main.ts`

That is a sign the project already has a useful internal structure.

## Bottom Line

This is a solid early-stage editor codebase with a good architectural backbone. The best parts are the event-driven state/render split, the command-based editing model, and the overall readability. The biggest issues are not conceptual; they are integration gaps where the data model, undo behavior, and geometry features have drifted slightly apart.

Once the build break and state-model inconsistencies are cleaned up, this project should be a strong base for adding richer authoring features.
