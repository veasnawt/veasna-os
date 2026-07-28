# Stage 4: Comprehensive Multi-Studio Tool Architecture Specification

---

## 🛠️ Stage 4 Tools Overview

Stage 4 expands Rixie's capabilities into a complete **Multi-Studio Operating System Engine**, equipping Rixie with specialized tools across BP Studio, Digital Art Studio, Music Studio, Game Dev Studio, and OS System Control:

```
                                ┌───────────────────────────────┐
                                │   STAGE 4 TOOL ARCHITECTURE   │
                                └───────────────┬───────────────┘
                                                │
       ┌──────────────────┬─────────────────────┼─────────────────────┬──────────────────┐
       ▼                  ▼                     ▼                     ▼                  ▼
┌──────────────┐   ┌──────────────┐      ┌──────────────┐      ┌──────────────┐   ┌──────────────┐
│  BP STUDIO   │   │  DIGITAL ART │      │ MUSIC STUDIO │      │   GAME DEV   │   │  OS SYSTEM   │
│  (Video)     │   │  (Visuals)   │      │  (Audio)     │      │   (Games)    │   │  (Files/CLI) │
└──────────────┘   └──────────────┘      └──────────────┘      └──────────────┘   └──────────────┘
```

---

## 1. 🎬 BP Studio Tools (Short-Form Video Production)

- `bp_generate_video_ideas`: Generates short-form video concepts optimized for TikTok / YouTube Shorts / Reels.
- `bp_plan_scene_breakdown`: Creates second-by-second visual and audio shot breakdowns for video editing.
- `bp_compose_script`: Drafts spoken narration, hook, call-to-action, and subtitle cues.
- `bp_trigger_render`: Dispatches FFmpeg / Remotion video compilation pipeline.

---

## 2. 🎨 Digital Art Studio Tools

- `art_create_palette`: Creates and stores theme palettes (colors, HSL, hex, mood).
- `art_generate_asset_prompt`: Drafts high-precision image generation prompts (ComfyUI / Stable Diffusion).
- `art_background_remove`: Triggers automated background removal on visual assets.
- `art_upscale_resolution`: Upscales image resolution for production export.

---

## 3. 🎵 Music & Audio Studio Tools

- `music_plan_track`: Specifies track metadata (BPM, key signature, genre, mood, stem arrangement).
- `music_write_lyrics`: Composes verses, chorus, and bridge lyrics in any language.
- `music_arrange_stems`: Configures drum, bass, synth, and vocal stem mixing parameters.
- `music_render_score_preview`: Synthesizes WebAudio / Tone.js audio score preview.

---

## 4. 🎮 Game Dev Studio Tools

- `gamedev_design_mechanic`: Defines interaction mechanics, control schemes, and physics parameters.
- `gamedev_export_level_json`: Exports tilemap and entity placement JSON specs for Phaser / Pixi.js.
- `gamedev_spec_sprite_sheet`: Defines sprite dimensions, animation frames, and hitboxes.

---

## 5. 🖥️ OS System Control Tools

- `os_read_file`: Reads workspace code, scripts, or documentation.
- `os_write_file`: Creates or updates workspace code and configuration files.
- `os_run_command`: Executes shell scripts safely inside `veasna-os` workspace.
- `os_git_status`: Inspects modified files and staged git commits.
- `os_grep_search`: Performs fast workspace ripgrep pattern searches.
