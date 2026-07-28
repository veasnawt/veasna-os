# Rixie Plugin & Permission Architecture

---

## 🔌 1. Plugin & Tool Registration Architecture

### Should tools be plugins?
**YES, 100%.**  
To maintain a clean, extensible codebase for 10 years, `rixie-core` must NOT hardcode studio tools or OS tools inside the core agent loop. Every tool suite (Code Editing, Image Generation, Voice, Calendar, Email, MCP Servers) must be a self-contained **Rixie Plugin**.

### Plugin Interface Specification

```ts
export type PermissionLevel = "read" | "write" | "system" | "admin";

export interface PluginPermission {
  level: PermissionLevel;
  resource: string; // e.g. "fs:*", "terminal:exec", "email:send"
  description: string;
}

export interface PluginContext {
  workspaceDir: string;
  memoryStore: MemoryStore;
  permissionManager: PermissionManager;
}

export interface RixiePlugin {
  id: string;
  name: string;
  version: string;
  permissions?: PluginPermission[];

  // Tool definitions exposed to LLM providers
  tools: ProviderTool[];

  // Tool dispatch functions
  dispatch: Record<
    string,
    (input: any, context: PluginContext) => Promise<unknown>
  >;

  // Optional Lifecycle hooks
  onInit?(context: PluginContext): Promise<void>;
  onShutdown?(): Promise<void>;
}
```

### Fluent Registration API

```ts
const agent = Rixie.builder()
  .usePlugin(codeEditingPlugin)
  .usePlugin(imageGenPlugin)
  .usePlugin(voicePlugin)
  .usePlugin(calendarPlugin)
  .usePlugin(emailPlugin)
  .build();
```

---

## 🔒 2. Security & Permission Management Architecture

An AI operating system companion with shell, email, and file capabilities MUST enforce a multi-tiered security model to prevent accidental file destruction or unauthorized actions.

### 3 Permission Tiers

```
                             ┌───────────────────────────────┐
                             │     PERMISSION MANAGER        │
                             └───────────────┬───────────────┘
                                             │
      ┌──────────────────────────────┼──────────────────────────────┐
      ▼                              ▼                              ▼
┌──────────────┐              ┌──────────────┐              ┌──────────────┐
│ TIER 1: READ │              │ TIER 2: WRITE│              │TIER 3: HIGH  │
│ (Auto-Approve│              │ (Policy      │              │RISK / SYSTEM │
│ Read-only)   │              │ Checked)     │              │(User Prompt) │
└──────────────┘              └──────────────┘              └──────────────┘
```

1. **Tier 1 (Read-Only — Auto-Approved)**:
   - Reading files, listing directories, searching memory, checking system health, fetching URL content.
2. **Tier 2 (Workspace Write — Policy Checked)**:
   - Creating workspace files, saving generated images, writing code patches, scheduling calendar events.
3. **Tier 3 (High-Risk System / Admin — User Confirmation Required)**:
   - Running arbitrary shell commands (`os_run_command`), sending emails (`email_send`), deleting files/git branches, financial API calls.

### Permission Manager API

```ts
export interface PermissionRequest {
  pluginId: string;
  toolName: string;
  level: PermissionLevel;
  target: string;
  reason: string;
}

export class PermissionManager {
  async authorize(req: PermissionRequest): Promise<boolean> {
    if (req.level === "read") return true; // Tier 1 Auto-approve

    if (req.level === "system" || req.level === "admin") {
      // Tier 3: Trigger interactive confirmation modal/prompt in UI or CLI
      return await this.promptUserForApproval(req);
    }

    return true;
  }
}
```

---

## 🛠️ 3. Capability Architectural Specifications

### A. Code Editing Plugin (`codeEditingPlugin`)
- `code_replace_chunk`: Precise line-range replacement for multi-file code editing.
- `code_apply_diff`: Unified diff patch application.
- `code_typecheck`: Runs incremental TypeScript compilation to verify syntax before saving.

### B. Image Generation Plugin (`imageGenPlugin`)
- `image_generate`: Connects to local ComfyUI, Stable Diffusion WebUI, or cloud API.
- `image_edit_background`: Background removal and mask editing.
- `image_save_asset`: Auto-saves generated image into target studio assets directory.

### C. Voice & Audio Plugin (`voicePlugin`)
- `voice_text_to_speech`: Converts script text to speech audio via ElevenLabs, Coqui, or WebSpeech API.
- `voice_speech_to_text`: Transcribes voice input via local Whisper model.
- `voice_playback_control`: Play/pause audio previews in the UI console.

### D. Calendar Plugin (`calendarPlugin`)
- `calendar_schedule_event`: Schedules video production deadlines or milestones.
- `calendar_get_schedule`: Checks availability and upcoming studio tasks.

### E. Email & Communication Plugin (`emailPlugin`)
- `email_draft`: Drafts client or team email updates.
- `email_send` (**Requires Tier 3 Permission**): Prompts user for approval before sending.
