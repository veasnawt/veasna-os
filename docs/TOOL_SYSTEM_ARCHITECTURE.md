# Rixie Tool System Architecture

---

## 🛠️ Tool System Overview

To evolve into a true OS companion, Rixie's Tool System is structured around **5 Core Tool Categories**, unifying native local tools, operating system control, Model Context Protocol (MCP), and studio APIs:

```
                                ┌───────────────────────────────┐
                                │      RIXIE TOOL REGISTRY      │
                                └───────────────┬───────────────┘
                                                │
       ┌──────────────────┬─────────────────────┼─────────────────────┬──────────────────┐
       ▼                  ▼                     ▼                     ▼                  ▼
┌──────────────┐   ┌──────────────┐      ┌──────────────┐      ┌──────────────┐   ┌──────────────┐
│  MCP PROTOCOL│   │  OS SYSTEM   │      │ MULTI-STUDIO │      │  SUBAGENT    │   │  WEB & DATA  │
│  INTEGRATION │   │  CONTROL     │      │ NATIVE APIS  │      │ DELEGATION   │   │  INTEGRATION │
│ (MCP Servers)│   │ (Files, CLI) │      │ (FFmpeg, Canvas)    │ (Sub-agents) │   │ (Search, API)│
└──────────────┘   └──────────────┘      └──────────────┘      └──────────────┘   └──────────────┘
```

---

## 1. MCP (Model Context Protocol) Integration

- **Role**: Connect Rixie to external Model Context Protocol (MCP) servers (local filesystems, databases, GitHub, DevTools, media pipelines).
- **Interface**:
  ```ts
  export interface MCPToolAdapter {
    serverName: string;
    connect(serverUri: string): Promise<void>;
    getTools(): Promise<ProviderTool[]>;
    callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  }
  ```

---

## 2. OS & System Control Tools (Claude Code / Jarvis Capabilities)

- **File System**: `read_file`, `write_file`, `list_directory`, `search_files`, `file_diff`.
- **Command Execution**: `run_command` (scoped to `veasna-os` workspace), `check_process_status`, `terminate_process`.
- **System Health**: `get_system_health` (CPU, Memory, Disk, GPU utilization).

---

## 3. Multi-Studio Native Tools

- **BP Studio**: FFmpeg video rendering, timeline composition, scene script assembly.
- **Art Studio**: Style prompt generation, Canvas WebGL asset compilation, color palette manager.
- **Music Studio**: Tone.js / WebAudio scoring, lyric composition, stem arrangement.
- **Game Dev Studio**: Sprite sheet generation, level layout JSON export, mechanics verification.

---

## 4. Subagent Delegation Tools

- `spawn_subagent`: Launch a specialist background subagent (e.g. Video Editor, Audio Scorer) with restricted tools and an isolated context window.
- `send_message`: Communicate with a running subagent.
- `kill_subagent`: Terminate a background subagent.

---

## 5. Web & Data Integration Tools

- `search_web`: Perform live web searches for research, news, or trend analysis.
- `read_url_content`: Fetch and convert web documentation/pages to clean Markdown.
- `fetch_api`: Execute safe HTTP REST API calls to external services.
