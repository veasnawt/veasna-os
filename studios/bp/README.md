# 🎬 BP Studio

> The creative operating system for Beyond Perspective.

BP Studio is the internal production studio used to create Beyond Perspective episodes from the first spark of an idea to publishing.

The goal is simple:

> Make creating videos effortless.

---

# Vision

Most creative tools solve only one part of the process.

One app for notes.
One app for writing.
One app for editing.
One app for publishing.

BP Studio brings the entire workflow into one place.

---

# Current Workflow

Every project moves through four creative workspaces.

```
💡 Idea
    ↓
📝 Script
    ↓
🎬 Create
    ↓
🚀 Publish
```

## 💡 Idea

Capture ideas, brainstorm, collect inspiration, and define the direction of the project.

## 📝 Script

Research, outline, and write the narration.

## 🎬 Create

Produce the final video. This stage embeds [VStudio](../vstudio) — a full timeline editor with its
own standalone app (`studios/vstudio`) — via `<iframe>`, rather than BP owning the editor itself. Same
project data either way; BP never touches it directly, only through VStudio's own API.

## 🚀 Publish

Export and publish the finished project.

---

# Features

Current

- ✅ Project management
- ✅ Create projects
- ✅ Rename projects
- ✅ Delete projects
- ✅ Local storage persistence
- ✅ Editable project title
- ✅ Project dashboard
- ✅ Workflow navigation

Also done, via VStudio (see [vstudio's own README](../vstudio/README.md) for the full list)

- ✅ Timeline editor — multi-track video/audio, transitions, effects, transform
- ✅ Voice generation — live microphone recording straight onto the timeline
- ✅ Export manager — in/out range export to MP4, via bundled FFmpeg

Planned

- AI brainstorming
- Rich text editor
- Script assistant
- Asset manager
- Multi-platform publishing
- Cloud sync
- Collaboration

---

# Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS

---

# Project Structure

```
app/
components/
lib/
types/
```

Project workspaces

```
projects/
    [id]/
        page.tsx
        idea/
        script/
        create/
        publish/
```

---

# Philosophy

BP Studio is not just another editor.

It is designed around the creative process.

Every screen should answer one simple question.

Home

> What should I work on?

Idea

> What am I creating?

Script

> What am I saying?

Create

> How do I turn this into reality?

Publish

> How do I share it with the world?

---

# Development Status

🚧 Early Development

The project is currently focused on building a strong architecture before adding advanced features.

Every feature should reduce friction and help creators stay in flow.

---

Made with ❤️ by Veasna.