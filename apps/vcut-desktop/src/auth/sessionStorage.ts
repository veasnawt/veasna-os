import { ipcMain, safeStorage, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import fs from "node:fs";
import path from "node:path";

/** One encrypted app-owned store, independent of the Next server's changing loopback port. */
export function installSessionStorage(file: string, window: () => BrowserWindow | null, origin: () => string) {
  const sessionKey = /^sb-[a-z0-9._-]+$/i;
  function authorize(event: IpcMainInvokeEvent, key: unknown): asserts key is string {
    const win = window();
    if (!win || event.sender !== win.webContents) {
      throw new Error("Session storage is only available to the app window.");
    }
    if (event.senderFrame?.url) {
      try {
        const senderOrigin = new URL(event.senderFrame.url).origin;
        const expectedOrigin = origin();
        const normalizeLoopback = (o: string) => o.replace("127.0.0.1", "localhost");
        if (expectedOrigin && senderOrigin !== expectedOrigin && normalizeLoopback(senderOrigin) !== normalizeLoopback(expectedOrigin)) {
          throw new Error("Session storage is only available to the app window.");
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("Session storage")) throw err;
      }
    }
    if (typeof key !== "string" || key.length > 200 || !sessionKey.test(key)) throw new Error("Invalid session key.");
  }
  function read(): Record<string, string> {
    if (!fs.existsSync(file)) return {};
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure session storage is unavailable.");
    try {
      const data: unknown = JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
      if (!data || typeof data !== "object" || Array.isArray(data)) return {};
      return Object.fromEntries(Object.entries(data).filter(([key, value]) => sessionKey.test(key) && typeof value === "string"));
    } catch { return {}; } // An unreadable old credential requires reauthentication, not project deletion.
  }
  function write(data: Record<string, string>) {
    if (!safeStorage.isEncryptionAvailable() || (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")) throw new Error("Secure session storage is unavailable.");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, safeStorage.encryptString(JSON.stringify(data)), { mode: 0o600 });
    fs.renameSync(temp, file);
  }
  ipcMain.handle("auth:storage-get", (event, key: unknown) => { authorize(event, key); return read()[key] ?? null; });
  // An empty encrypted store is retained after sign-out, so another old loopback origin cannot
  // silently restore stale localStorage credentials through the one-time migration path.
  ipcMain.handle("auth:storage-can-migrate", (event, key: unknown) => { authorize(event, key); return !fs.existsSync(file); });
  ipcMain.handle("auth:storage-set", (event, key: unknown, value: unknown) => {
    authorize(event, key);
    if (typeof value !== "string" || value.length > 200_000) throw new Error("Invalid session value.");
    const data = read(); data[key] = value;
    if (Object.keys(data).length > 24) throw new Error("Too many session keys.");
    write(data);
  });
  ipcMain.handle("auth:storage-remove", (event, key: unknown) => { authorize(event, key); const data = read(); delete data[key]; write(data); });
}
