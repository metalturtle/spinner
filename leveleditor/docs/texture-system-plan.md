# Texture System Plan

## Decisions Locked In

This plan assumes the following product decisions:

1. Textures apply to `polygons` and `circles`.
2. Existing `color` remains visible when a texture is assigned.
3. The first implementation stays simple.
4. Texture mapping should be `world-aligned`.

## Goal

Add a first-pass texture system that lets users:

- select a polygon or circle
- choose a texture from the properties/selection panel
- apply or clear that texture
- keep the existing color visible as part of the final appearance
- save and load textured shapes through the existing level format

This first version should fit the current architecture cleanly and avoid introducing a separate paint workflow or a heavyweight material system.
