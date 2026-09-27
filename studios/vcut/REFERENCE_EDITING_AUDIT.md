# Reference editing capability audit — 2026-09-28

Reference: `C:/Users/Vergenzee/Desktop/IMG_4160.MOV`, 21.97 seconds,
720×1280, variable frame rate, stereo AAC. Inspected a 2-second contact sheet.
Visible techniques: tightly cut product/detail/face shots, vertical reframing,
outlined stacked vlog lettering, small decorative marks and white rounded
framing/reveals. Treat this as a capability benchmark, not a hard-coded template.

## Exists and good — preserve

- Timeline: multi-track video/text/audio, overlays, trim/split, overwrite carving,
  duplication, clipboard snapshots, track moves, snapping, frame stepping and zoom.
  Existing operations/commands/clipboard/timeline tests cover these primitives.
- Transform: sequence-space position, uniform scale, unrestricted rotation,
  crop, flips, opacity, blending. Canvas handles share transformed-box geometry.
- Text: fonts, size, bold/italic, alignment, colors, multiple outlines/shadows,
  glow, spacing, backgrounds, word styling, IN/OUT/loop animations. Reusable
  `textStylePresets.ts` already contains vlog/sticker/bubble/cute/subtitle styles.
  Do not create a second style or text animation engine.
- Speed: constant/curved speed, reverse, source-time seeking and export retiming.
- Transitions: crossfade, directional wipes/slides, circle/slice reveals, zoom
  blur, whip pan and flash zoom. Existing transition motion/render tests apply.
- Audio: multiple tracks, waveform, clip/track/master gain, fades, mute, pan,
  trims/splits, beat detection and scheduling. Keyframed gain has export expressions.
- Color/filter: brightness/contrast/saturation/blur/opacity, RGB/master curves,
  LUTs and reusable effects looks. Curves already provide tonal/RGB balancing;
  avoid adding named controls that merely duplicate existing ones.
- Decorative elements: imported transparent overlays, color assets, animated
  stickers/GIFs use normal clips and the existing transform/export pipeline.

## Exists but needs improvement — active implementation

- Legacy group snapshots couple unrelated animation parameters; incomplete trim/
  split/retime logic loses animation. Shared scalar registrations, curve windowing,
  finite/bounded normalization and binary-search evaluation are now implemented
  locally alongside backward-compatible legacy tracks.
- Per-property diamonds, timeline selection/drag/deletion and easing were absent.
  Local implementation now connects commands, canvas, timeline and persistence.
  Verification must include actual UI interactions, not only pure math tests.
- Style keyframes previously excluded browser text rendering. Animated text now
  uses the preview canvas renderer on native and browser exports, sampled at output
  frame starts. Hosted rendering must reject its frame limit instead of dropping style.
- Masks have rectangle/ellipse, position/size, feather and invert. The new generic
  channels animate their existing numeric parameters; add rotation, expansion,
  linear masks and independently rounded rectangle masks using shared mask geometry.
- LUT intensity animation needs the existing LUT materialization pipeline to resolve
  every sampled intensity. Verify native and hosted path maps, not just the plan.
- Static effects have documented preview/export approximations (blur kernels and
  browser color/filter behavior). Do not claim universal pixel identity based on
  passing transform tests. Add targeted renders and fix demonstrated differences.

## Missing

- Transform Corner Radius, linked/unlinked: implemented locally with actual canvas
  clipping, shared overlap normalization, continuous FFmpeg alpha expressions,
  independent channels, link-curve conversion, undo and serialization. Real FFmpeg
  tests pass for animation and asymmetric crop/scale/rotation/flips; UI QA pending.
- Image/video animation presets producing ordinary editable property keyframes.
  Add a compact IN/OUT/Motion selector; reuse commands/easing, not a second player.
- An advanced editable value/speed/Bezier graph. The current expandable curve view
  reads actual segment metadata; keep the architecture extensible, avoid fake handles.
- Dedicated exposure/temperature/tint/highlight/shadow/sharpen sliders. Existing
  curves/looks cover reference tonal adjustments; new sliders need shared color math.
- Nonuniform Scale X/Y, arbitrary vector mask editing, proper temporal motion blur,
  and adjustment layers. These are not currently supported primitives.

## Architectural blockers

- Nonuniform scale affects source fitting, canvas handles/hit testing, export geometry
  and transition buffers. Uniform scale is an existing contract, not two hidden controls.
- Proper motion blur needs multiple temporally evaluated visual samples and shutter
  bounds without changing audio clocks or asynchronous video seek state. Existing zoom
  blur transitions are intentional transition effects, not general motion blur.
- Adjustment layers require effects to operate on an ordered composite of lower tracks.
  Current effects run on source clips before compositing. Mutating lower clips or placing
  an opaque colored clip on top would not implement a real adjustment layer.
- A Bezier editor needs the same numerical inversion in preview and export. Current
  paired easing evaluators/expressions and outgoing segment metadata prepare this;
  implementing draggable handles alone would be misleading.

## Prioritized incremental plan

1. Finish generic keyframes/easing/window operations and timeline/UI verification.
2. Finish Transform Corner Radius and pivot verification; retain square/center defaults.
3. Verify styled/animated text renders and LUT intensity across export adapters.
4. Add editable clip IN/OUT/Motion presets on existing property tracks.
5. Improve mask primitives and animate them through the same registry/evaluator.
6. Run speed/audio/transition/clipboard regressions and a multi-track benchmark.
7. Record remaining compositor-level work separately: true motion blur, adjustment
   layers, nonuniform geometry and advanced graphs. Do not ship placeholder controls.

After each stage: focused tests and typecheck. Before release: full suite, lint,
production build and browser workflow/render QA; then rebuild Android/desktop,
sync iOS source and update handoffs. Physical native playback and Store production
signing cannot be verified on this Windows workstation.

## Verified foundation / current limits

- Per-property numeric tracks, four easing curves and Hold, clip-local windows,
  canvas auto-key and timeline gestures are connected. Old group snapshots remain
  readable; existing color-grading curve snapshots remain discrete/held.
- Corner radius is sequence pixels on the cropped bounds, default zero. Linking
  uses Top Left as master; unlinking copies the full master curve. Source flips
  keep corner labels attached to visible clip bounds. Outline/glow follow the
  rounded silhouette and can expand beyond the clip bounds.
- Masks now include linear reveal, rotation, expansion and independent rectangle
  radius (percent of smaller cropped-source dimension). Existing rectangle/ellipse
  defaults and feather behavior remain compatible. Full-resolution, pixel-centered
  FFmpeg alpha tests match the shared canvas math within one 8-bit alpha value in
  portrait and landscape cases; a combined 20fps-video/24fps-output test verifies
  animated mask and rounded bounds together.
- Clip IN/OUT/Motion presets generate normal editable scalar tracks. Applying IN
  preserves OUT keys; unrelated parameters remain intact. Text styles and bulk
  font/size patches update existing property overrides too.
- Actual browser Inspector/timeline QA passed add/auto-key/seek/easing/unlink/edit,
  undo/redo and multi-channel dragging at 390/768/1280 widths, plus preset application
  and rounded-outline canvas checks.
- Numeric evaluation benchmark: 200 clips with 400,000 total keys, evaluated over
  240 frames, median 1.72ms and p95 2.63ms per frame on this workstation. This measures
  evaluators, not full 4K video decoding or native playback performance.
- Frame fallback is accurate rather than silently coarsened. Long crop/mask/pivot/
  blur fallback exports exceeding 2,400 frames locally or 600 hosted frames report
  a clear error and suggest a shorter range. Continuous transform/corner expressions
  do not consume that fallback budget. Animated native/browser styled text also has
  an explicit frame budget; no styled text is silently dropped.
- Full shared lint was compared with committed source: 143 existing errors before,
  139 after, no added error categories/counts per file. These old React-hook/compiler
  errors still require separate cleanup; do not describe lint as fully passing.
- Full tests, final typecheck/build and release artifact results are recorded in the
  handoff when finished. Physical Android/iOS playback remains device QA.
- True temporal motion blur, adjustment layers, nonuniform scale and editable Bezier
  graphs remain architectural follow-up work, without placeholder controls. Existing
  approximate color/blur/pixel effects are not certified universally pixel-identical.
