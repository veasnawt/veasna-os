import type { ToolModule } from "@veasna/ai";
import { ApiError } from "../../_lib/sandboxedFs";
import { listEntries, readFileContent, writeFileContent, mkdir, createFile, renameEntry, deleteEntries, statEntry } from "../../_lib/fileOps";

const THEME_OPTIONS = ["dark", "light", "glass"] as const;

function errMessage(err: unknown): string {
  return err instanceof ApiError || err instanceof Error ? err.message : String(err);
}

/** Rixie's genuine "things a Veasna OS user can do" toolkit — everything here operates through the
 *  exact same sandboxed Desktop workspace (studios/universe/app/api/_lib/fileOps.ts, the same code
 *  the File Manager/Terminal use) or signals a client-side action the shell already supports (open
 *  an icon, change the theme). Deliberately separate from @veasna/ai's own osSystemTools (disabled
 *  entirely in route.ts's getAgent — real host filesystem/shell/git, not sandbox-aware at all):
 *  this module can only ever reach the sandbox, never the real machine underneath Veasna OS. */
export function buildVeasnaOsTools(): ToolModule {
  return {
    schemas: [
      {
        name: "desktop_list_files",
        description:
          "List files and folders inside the user's Desktop workspace (the sandboxed OS filesystem — same scope as the File Manager app).",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Folder path relative to the Desktop root. Empty/omitted = Desktop root itself." },
          },
        },
      },
      {
        name: "desktop_read_file",
        description: "Read the text content of a file inside the user's Desktop workspace.",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path relative to the Desktop root." },
          },
          required: ["path"],
        },
      },
      {
        name: "desktop_create_file",
        description: "Create a new file inside the user's Desktop workspace, optionally with initial text content.",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Parent folder path relative to the Desktop root. Empty/omitted = Desktop root." },
            name: { type: "string", description: "File name, including extension — e.g. 'notes.txt'." },
            content: { type: "string", description: "Initial text content. Optional, defaults to empty." },
          },
          required: ["name"],
        },
      },
      {
        name: "desktop_create_folder",
        description: "Create a new folder inside the user's Desktop workspace.",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Parent folder path relative to the Desktop root. Empty/omitted = Desktop root." },
            name: { type: "string", description: "Folder name." },
          },
          required: ["name"],
        },
      },
      {
        name: "desktop_rename_item",
        description: "Rename a file or folder inside the user's Desktop workspace.",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Current path of the file/folder, relative to the Desktop root." },
            newName: { type: "string", description: "New name only — not a full path." },
          },
          required: ["path", "newName"],
        },
      },
      {
        name: "desktop_delete_item",
        description: "Move a file or folder inside the user's Desktop workspace to the Trash — recoverable, same as pressing Delete in File Manager.",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path of the file/folder to delete, relative to the Desktop root." },
          },
          required: ["path"],
        },
      },
      {
        name: "desktop_open_item",
        description:
          "Open a file or folder in the OS, the same as the user double-clicking its desktop icon — a file opens in its viewer/editor, a folder opens in File Manager.",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path of the file/folder to open, relative to the Desktop root." },
          },
          required: ["path"],
        },
      },
      {
        name: "desktop_set_theme",
        description: "Change Veasna OS's visual theme, the same as the user picking one in Settings → Personalize.",
        input_schema: {
          type: "object",
          properties: {
            theme: { type: "string", description: "One of: dark, light, glass." },
          },
          required: ["theme"],
        },
      },
    ],
    dispatch: {
      desktop_list_files: async (input: unknown) => {
        const { path: relPath = "" } = (input || {}) as { path?: string };
        try {
          return { path: relPath, entries: await listEntries(relPath) };
        } catch (err) {
          return { error: errMessage(err) };
        }
      },
      desktop_read_file: async (input: unknown) => {
        const { path: relPath } = input as { path: string };
        try {
          const content = await readFileContent(relPath);
          return { path: relPath, content: content.slice(0, 10000), truncated: content.length > 10000 };
        } catch (err) {
          return { error: errMessage(err) };
        }
      },
      desktop_create_file: async (input: unknown) => {
        const { path: parentPath = "", name, content } = input as { path?: string; name: string; content?: string };
        try {
          const createdPath = await createFile(parentPath, name);
          if (content) await writeFileContent(createdPath, content);
          return { status: "success", path: createdPath };
        } catch (err) {
          return { error: errMessage(err) };
        }
      },
      desktop_create_folder: async (input: unknown) => {
        const { path: parentPath = "", name } = input as { path?: string; name: string };
        try {
          return { status: "success", path: await mkdir(parentPath, name) };
        } catch (err) {
          return { error: errMessage(err) };
        }
      },
      desktop_rename_item: async (input: unknown) => {
        const { path: relPath, newName } = input as { path: string; newName: string };
        try {
          return { status: "success", path: await renameEntry(relPath, newName) };
        } catch (err) {
          return { error: errMessage(err) };
        }
      },
      desktop_delete_item: async (input: unknown) => {
        const { path: relPath } = input as { path: string };
        try {
          const result = await deleteEntries([relPath]);
          if (result.errors.length > 0) return { error: result.errors[0].message };
          return { status: "success", path: relPath };
        } catch (err) {
          return { error: errMessage(err) };
        }
      },
      desktop_open_item: async (input: unknown) => {
        const { path: relPath } = input as { path: string };
        try {
          // No actual "open" happens here — the desktop shell runs entirely client-side, and this
          // route only ever sees one HTTP request/response, not a live connection to it. The
          // frontend (RixieWindow.tsx) inspects THIS tool call in the response and performs the
          // real open; this dispatch only validates the target exists and reports its kind.
          const stat = await statEntry(relPath);
          return { status: "success", path: relPath, kind: stat.kind };
        } catch (err) {
          return { error: errMessage(err) };
        }
      },
      desktop_set_theme: async (input: unknown) => {
        const { theme } = input as { theme: string };
        if (!(THEME_OPTIONS as readonly string[]).includes(theme)) {
          return { error: `Invalid theme "${theme}" — must be one of: ${THEME_OPTIONS.join(", ")}` };
        }
        // Same reasoning as desktop_open_item — theme lives in the client's own React state/
        // localStorage, nowhere this server can reach. The frontend applies it after seeing this
        // tool call succeed.
        return { status: "success", theme };
      },
    },
  };
}
