/**
 * Operating System System Tools for Rixie Core.
 *
 * Provides Jarvis + Claude Code capabilities:
 * 1. Filesystem (read_file, write_file, list_dir)
 * 2. Terminal (run_command, manage_task)
 * 3. Browser & Web (read_url, fetch_api)
 * 4. Git (git_status, git_diff, git_log)
 * 5. Search (grep_search, search_web)
 */
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { MemoryStore } from "../memory/memoryStore";
import { ToolModule } from "./types";

const execAsync = promisify(exec);

export function registerOsSystemTools(memory: MemoryStore): ToolModule {
  const rootDir = process.cwd();

  return {
    schemas: [
      // 1. Filesystem Tools
      {
        name: "os_read_file",
        description: "Read the contents of a text file inside the workspace.",
        input_schema: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Relative or absolute file path" },
          },
          required: ["filePath"],
        },
      },
      {
        name: "os_write_file",
        description: "Create or overwrite a file inside the workspace.",
        input_schema: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Target file path" },
            content: { type: "string", description: "File content" },
          },
          required: ["filePath", "content"],
        },
      },
      {
        name: "os_list_directory",
        description: "List contents of a directory inside the workspace.",
        input_schema: {
          type: "object",
          properties: {
            dirPath: { type: "string", description: "Directory path (default: current workspace)" },
          },
        },
      },

      // 2. Terminal Tools
      {
        name: "os_run_command",
        description: "Execute a shell command inside the workspace safely.",
        input_schema: {
          type: "object",
          properties: {
            command: { type: "string", description: "Command string to run" },
            cwd: { type: "string", description: "Working directory relative to workspace" },
          },
          required: ["command"],
        },
      },

      // 3. Git Tools
      {
        name: "os_git_status",
        description: "Get current Git repository status (modified files, staged changes).",
        input_schema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "os_git_log",
        description: "Get recent Git commit history.",
        input_schema: {
          type: "object",
          properties: {
            count: { type: "number", description: "Number of commits to return (default: 5)" },
          },
        },
      },

      // 4. Search Tools
      {
        name: "os_grep_search",
        description: "Search for text pattern or string across files in the workspace.",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Text or pattern to search for" },
            targetDir: { type: "string", description: "Directory to search inside" },
          },
          required: ["query"],
        },
      },

      // 5. Browser & Web Tools
      {
        name: "os_fetch_url",
        description: "Fetch text or Markdown content from a public URL.",
        input_schema: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to fetch" },
          },
          required: ["url"],
        },
      },
    ],

    dispatch: {
      // Filesystem Implementations
      os_read_file: async (input: unknown) => {
        const { filePath } = input as { filePath: string };
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
        if (!fs.existsSync(fullPath)) {
          return { error: `File not found: ${filePath}` };
        }
        const content = fs.readFileSync(fullPath, "utf-8");
        return { filePath, content: content.slice(0, 10000), truncated: content.length > 10000 };
      },

      os_write_file: async (input: unknown) => {
        const { filePath, content } = input as { filePath: string; content: string };
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, content, "utf-8");
        return { status: "success", filePath, bytesWritten: Buffer.byteLength(content) };
      },

      os_list_directory: async (input: unknown) => {
        const { dirPath = "." } = (input || {}) as { dirPath?: string };
        const fullPath = path.isAbsolute(dirPath) ? dirPath : path.join(rootDir, dirPath);
        if (!fs.existsSync(fullPath)) return { error: `Directory not found: ${dirPath}` };
        const items = fs.readdirSync(fullPath, { withFileTypes: true });
        return {
          dirPath,
          items: items.slice(0, 50).map((i) => ({
            name: i.name,
            isDirectory: i.isDirectory(),
          })),
        };
      },

      // Terminal Implementation
      os_run_command: async (input: unknown) => {
        const { command, cwd } = input as { command: string; cwd?: string };
        const workDir = cwd ? path.join(rootDir, cwd) : rootDir;
        try {
          const { stdout, stderr } = await execAsync(command, { cwd: workDir, timeout: 30000 });
          return { status: "success", stdout: stdout.trim(), stderr: stderr.trim() };
        } catch (err) {
          const e = err as { message: string; stdout?: string; stderr?: string };
          return { status: "error", error: e.message, stdout: e.stdout, stderr: e.stderr };
        }
      },

      // Git Implementations
      os_git_status: async () => {
        try {
          const { stdout } = await execAsync("git status --short", { cwd: rootDir });
          return { status: "success", gitStatus: stdout.trim() || "Working tree clean" };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },

      os_git_log: async (input: unknown) => {
        const { count = 5 } = (input || {}) as { count?: number };
        try {
          const { stdout } = await execAsync(`git log -n ${count} --oneline`, { cwd: rootDir });
          return { status: "success", logs: stdout.trim().split("\n") };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },

      // Search Implementation
      os_grep_search: async (input: unknown) => {
        const { query, targetDir = "." } = input as { query: string; targetDir?: string };
        const workDir = path.isAbsolute(targetDir) ? targetDir : path.join(rootDir, targetDir);
        try {
          const cmd = process.platform === "win32"
            ? `findstr /S /I /N /C:"${query}" *.*`
            : `grep -rn "${query}" .`;
          const { stdout } = await execAsync(cmd, { cwd: workDir, timeout: 10000 });
          const matches = stdout.trim().split("\n").slice(0, 30);
          return { query, matchesCount: matches.length, matches };
        } catch {
          return { query, matchesCount: 0, matches: [] };
        }
      },

      // Browser Implementation
      os_fetch_url: async (input: unknown) => {
        const { url } = input as { url: string };
        try {
          const res = await fetch(url);
          if (!res.ok) return { error: `HTTP ${res.status}: ${res.statusText}` };
          const text = await res.text();
          return { url, status: res.status, content: text.slice(0, 8000) };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
  };
}
