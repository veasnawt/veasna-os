# Keyframe system audit and implementation plan

## Existing behavior to preserve

- `timeline/keyframes.ts` evaluates six clip-local tracks: transform, effects, gain,
  color grading, text style and text crop. Numeric values interpolate linearly;
  discrete text values and color curves hold. Canvas and seeking use these resolvers.
- Inspector and canvas edits already auto-key armed groups using one upsert helper.
  Number fields preview without filling undo history; real edits use commands.
- Playback has its own high-frequency clock. Unanimated Inspector selections avoid
  subscribing to every playback update. Preserve this separation.
- Export supports continuous position/scale/rotation/effects expressions when possible,
  and frame-based geometry/text rendering otherwise. Audio has a gain expression.
- Commands and serialization already support the legacy tracks. Keep these project fields
  readable and keep existing static/animated projects visually unchanged.

## Confirmed weaknesses

- Group snapshots couple unrelated properties; a Position X edit can capture Scale too.
- Keyframes have no interpolation/easing metadata. Export expression implementations are
  separate linear formulas and can drift from the preview evaluator.
- Keyframe diamonds exist only on an Inspector mini-track. There is no timeline selection,
  bulk deletion, or keyframe-aware keyboard routing.
- Mini-track dragging commits repeatedly and permits equal timestamps; clicking a marker
  captures a drag without seeking. Deleting the last marker restores an old static value.
- Splitting handles only transform/effects, loses bracketing interpolation at the cut, and
  copies other track times without rebasing. Ordinary trims do not rebase animation.
- Retimed trims/exports repeat incomplete track lists. Normalization needs finite values,
  bounded/unique times and stable unique IDs, including legacy data loaded from disk.
- Masks and LUT intensity are supported static controls but are not animated. The existing
  transform uses uniform scale and a fixed center pivot; nonuniform scale is not supported.

## Incremental implementation

1. Add a shared property registry and scalar/discrete tracks alongside the legacy fields.
   Resolve them through the existing animation module, not a second playback engine.
   Register supported transform/crop, effects, text numeric styling/crop, gain, mask and
   LUT intensity properties with value validation and applicability rules.
2. Share Linear, Hold, Ease In, Ease Out and Ease In-Out mathematics and FFmpeg expression
   generation. Keep the evaluator extensible for custom cubic Bezier easing. Preserve
   legacy linear/held defaults. Binary-search sorted tracks and avoid per-frame sorting.
3. Centralize animation window slicing/rebasing for split, trim, overwrite carving and
   range export, preserving values at cut boundaries. Harden setters and save/load.
4. Add per-property diamond/previous/next controls using existing icons and NumberField.
   Auto-key only animated properties when typed or manipulated on canvas. Keep existing
   group-track controls functional for old projects. Bake current values when removing
   the last keyframe, with one reversible command.
5. Render clip-local timeline diamonds with exact seeking, visible selection, multi-select,
   bounded drag/snapping, one undo entry per drag, and scoped Delete/Backspace. Add a compact
   easing picker and an expandable actual curve view; no inactive controls or TODO UI.
6. Wire all registered animation into preview and export, including supported mask/LUT
   intensity. Add pivot support only with shared canvas/handle/export geometry, never a
   preview-only anchor control. Frame sampling must not silently omit new animation.
7. Add regression tests for normalization, editing, easing, arbitrary seek, split/trim,
   retiming, duplication/clipboard, undo/redo, persistence and real FFmpeg parity across
   frame rates/resolutions. Run meaningful browser interaction QA plus typechecks and
   existing regressions after each major stage; rebuild/deploy only the verified result.

The 0.2.11 account/sync/scrollbar release is built from root `bd913e8` and shared `8f23155`.
Its artifacts must be described separately from subsequent animation changes. The current
release deployment is `987c4038-d73d-411c-bea7-297070a3bd91`. Physical Android/iOS testing and
production Store signing remain outside verification available on this Windows machine.
