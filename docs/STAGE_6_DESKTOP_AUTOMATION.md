# Stage 6: Desktop Automation & GUI Control Specification

---

## 🖥️ Stage 6 Architecture Overview

Stage 6 expands Rixie from workspace file/command manipulation into **Full Desktop GUI Automation & Computer Use**, enabling Rixie to interact directly with native desktop software (e.g. Adobe Premiere, Blender, Photoshop, DaVinci Resolve, VS Code, Web Browsers) via visual screen inspection, mouse/keyboard input, and window management:

```
                          ┌────────────────────────────────┐
                          │   STAGE 6 DESKTOP AUTOMATION   │
                          └───────────────┬───────────────┘
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            │                             │                             │
    ┌───────▼───────┐             ┌───────▼───────┐             ┌───────▼───────┐
    │ VISUAL GROUND │             │ MOUSE/KEYBOARD│             │ APPLICATION   │
    │ SCREEN CAPTURE│             │ INPUT CONTROL │             │ WINDOW CONTROL│
    │ (Screenshots) │             │ (Click, Type) │             │ (Launch, Focus)│
    └───────────────┘             └───────────────┘             └───────────────┘
```

---

## 1. Visual Grounding & Screen Capture Tools

- `desktop_take_screenshot`: Captures current screen image for multimodal visual inspection.
- `desktop_find_element_coordinates`: Uses visual OCR / vision model to locate UI buttons, input fields, or menus by coordinates `(x, y)`.

---

## 2. Mouse & Keyboard Input Control Tools

- `desktop_click_at`: Moves mouse cursor to `(x, y)` and clicks (left, right, double-click).
- `desktop_type_text`: Types text string into active window with configurable keypress delay.
- `desktop_press_hotkey`: Triggers system key combinations (e.g., `Ctrl+S`, `Alt+Tab`, `Ctrl+Z`).
- `desktop_drag_and_drop`: Simulates dragging from `(x1, y1)` to `(x2, y2)`.

---

## 3. Application & Window Control Tools

- `desktop_launch_app`: Launches local applications (e.g., Premiere, Photoshop, Blender, VS Code).
- `desktop_focus_window`: Brings target window to front by title match.
- `desktop_get_clipboard`: Reads system clipboard content.
- `desktop_set_clipboard`: Sets system clipboard content.

---

## 4. Security & Safety Guardrails (Emergency Kill-Switch)

Desktop automation carries inherent risks. Rixie enforces strict safety guardrails:
1. **Emergency Abort Hotkey**: Pressing `Esc` or `Ctrl+Alt+S` instantly halts all mouse/keyboard automation loops.
2. **Tier 3 Confirmation**: Desktop GUI control outside `veasna-os` requires explicit Tier 3 user confirmation before execution.
3. **Screen Boundary Bounding**: Actions are constrained to active workspace screens.
