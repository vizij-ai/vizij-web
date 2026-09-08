# Vizij Authoring References

This folder stores active reference docs that support implementation but are not core contracts.

## Current references

1. `apps/vizij-authoring/docs/references/ui-component-inventory.md`
   Used for UI decomposition/refactor planning and mapping component work to backlog items.
2. `apps/vizij-authoring/docs/references/export-bake-performance.md`
   Where a GLB export's 29 seconds go, measured, and the options for it. Nothing fixed.
3. `apps/vizij-authoring/docs/references/pose-capture-vs-render.md`
   Why a pose captured at a frame can render differently, and which candidate causes survive.
4. `apps/vizij-authoring/docs/references/e2e-workflow-failures.md`
   What the six `workflow` e2e failures actually were, and the techniques that found them.
5. `apps/vizij-authoring/docs/references/animation-blender-round-trip.md`
   Why the baked glTF export is one way, measured against Blender 5.2.1, and the
   decision not to build Blender-specific tooling to change that. The diagram is the
   `.d2` alongside, rendered to `.svg`.

## Usage rules

1. Keep references concise and practical.
2. Promote concrete action items into `apps/vizij-authoring/docs/plans/BACKLOG.md`.
3. Move obsolete references into `apps/vizij-authoring/docs/archive/`.
