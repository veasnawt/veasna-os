# Group clips audit and implementation plan

## Existing systems to reuse

- `selectedClipIds`, canvas hit testing and timeline multi-selection already support
  selecting heterogeneous visual clips. Timeline multi-drag computes one bounded,
  snapped delta; children already remain on their original tracks.
- `groupMove.ts` produces live overrides for moving a selection; TransformHandles
  and TextTransformHandles commit one batch. This is temporary multi-selection,
  not a persisted parent transform, and currently only translates children.
- Property registrations, numeric curve evaluation, easing/windowing, per-property
  diamonds and timeline markers now provide the shared animation foundation.
- Existing scoped commands/UndoStack, clipboard snapshots, deep-cloned duplicate
  IDs and serialization provide reversible edits and independent copies.
- Template track groups organize inserted templates. Preserve them separately:
  they are track ownership tags, not general clip parent transforms.
- Shared transform-box/pivot geometry and text layout are used by preview and
  export. Parent composition must integrate here rather than rewrite child data.

## Missing foundations

- Persistent clip groups, hierarchy validation and a cached membership index.
- Group-aware selection, entering/exiting children, common canvas scale/rotation
  handles and group Inspector controls.
- Parent transforms/opacity evaluated alongside child keyframes, identical in
  preview, native text rendering, export planning and thumbnail paths.
- Hierarchy cloning for clipboard/duplicate, locked-parent guards, and scoped
  undo snapshots that include groups when membership changes.

## Proposed data model

- Optional `Project.groups: ClipGroup[]`; old projects default to no groups.
- Each clip has optional `groupId`; each group has optional `parentId`.
  Store one parent relationship per node. Derive children through an index to
  avoid inconsistent duplicated member lists.
- Group: stable id/name, lock flag, clip-local animation time origin, rest bounds
  and pivot, transform plus property tracks/values using the existing numeric
  registry/evaluator. No new playback engine and no nested timeline.
- Validate parent existence, self/circular links, unique IDs and finite values.
  Bound nesting depth and clean dangling relationships on delete/load.
- Compose parent uniform-scale/rotation/translation matrices; multiply opacity.
  Keep child source/timing/style/effects/mask/keyframes unchanged during playback.
  Preserve global track stacking rather than flattening a group into one track.

## Files / modules affected

Project types/serialize/createProject; a shared project group index/composition
module; commands/group operations and existing duplicate/paste/delete snapshots;
store selection/history; timeline multi-drag/markers/context menu; Preview hit
selection; group canvas handles and Inspector; PlaybackEngine/text layout;
export plan/native/browser text adapters; clipboard and regression/render tests.

## Implementation order

1. Finish and commit the current animation/corner/mask verification as a stable
   foundation; existing 0.2.11 artifacts do not contain that work.
2. Add validated group model/index, shared world composition and pure tests.
3. Group/Ungroup/rename/lock/move commands, hierarchy-aware copy/duplicate/delete,
   persistence and history regression tests.
4. Connect parent rendering to preview/export/text/thumbnail paths; real render
   parity tests with animated parent and child before exposing UI controls.
5. Group selection/edit mode, shortcuts/context menu, bounds/handles, Inspector
   property diamonds and timeline markers. Support safe nesting through the model.
6. Full tests/typecheck/lint/build and real browser workflow; rebuild native artifacts
   containing grouping only after its complete workflow is verified.

No Compound Clips, new template engine, destructive per-frame child rewrites,
placeholder group controls or changes to template-track grouping.

## Implemented and verified

Persistent nested groups now compose parent matrices and opacity through the shared
animation evaluator. Group/Ungroup, rename, lock, rigid timeline movement, canvas
move/scale/rotate, child edit mode, shortcuts, contextual actions, property diamonds,
timeline markers, hierarchy copy/paste/duplicate, scoped undo and save/load are wired.
Original tracks and child curves stay intact. Ungroup retains independent, editable
transform layers so animated compositions do not jump or lose their motion.

Project schema is now 2: schema 1 projects remain readable without a database
migration. Older apps reject new-format files explicitly rather than silently
discarding groups and animation. Update cloud/web and native apps together.

Verification: 1,587 full-suite tests passed, plus 29 focused tests after the final
multi-group movement and collage-copy fixes. A real FFmpeg render checks animated
parent scale/rotation/opacity and child movement. Actual browser Inspector/Preview/
Timeline workflows and full-app keyboard shortcuts passed. Grouped text matched
preview/export pixel-for-pixel across 48 frames. Host typecheck passed; mobile
production build passed. Lint retains the existing 139 errors with no new errors.

Native installers are being rebuilt as 0.2.12/build 16. Real-device Android export,
touch/keyboard checks and a Mac iOS archive still require validation. Existing
frame-rasterization budgets remain explicit export errors, never silent styling
fallbacks. Group opacity multiplies child opacity; global track order is preserved.
