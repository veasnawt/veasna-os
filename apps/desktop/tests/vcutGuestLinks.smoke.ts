import { app, BrowserWindow, type WebContents } from "electron";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { installVCutGuestLinks } from "../src/windows/vcutGuestLinks";

async function serve() {
  const server = createServer((_request, response) => response.end("<html><body>BP test guest</body></html>"));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function main() {
  const profile = path.join(process.cwd(), "user-data");
  mkdirSync(profile, { recursive: true });
  app.setPath("userData", profile);
  await app.whenReady();
  const bp = await serve();
  const other = await serve();
  const opened: string[] = [];
  let guest: WebContents;
  let ready: () => void;
  const guestReady = new Promise<void>(resolve => { ready = resolve; });
  app.on("web-contents-created", (_event, contents) => {
    if (contents.getType() !== "webview") return;
    guest = contents;
    installVCutGuestLinks(contents, () => bp.url, async url => { opened.push(url); }, "http://127.0.0.1:3002");
    contents.once("did-finish-load", () => ready());
  });
  const win = new BrowserWindow({ show: false, webPreferences: { webviewTag: true, contextIsolation: true, nodeIntegration: false, sandbox: false } });
  let failure: unknown;
  try {
    await win.loadURL("data:text/html," + encodeURIComponent(`<webview src="${bp.url}" allowpopups></webview>`));
    await Promise.race([guestReady, new Promise((_, reject) => setTimeout(() => reject(new Error("Guest startup timed out")), 15000))]);
    async function open(url: string) {
      await guest.executeJavaScript(`window.open(${JSON.stringify(url)}, '_blank'); void 0`, true);
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    await open("https://vcut.io/");
    await open("http://127.0.0.1:3002/edit?projectId=id&projectName=title");
    assert.deepEqual(opened, ["https://vcut.io/", "http://127.0.0.1:3002/edit?projectId=id&projectName=title"]);
    await open("https://example.com/");
    await open("file:///C:/secret");
    await guest!.loadURL(other.url);
    await open("https://vcut.io/");
    assert.equal(opened.length, 2, "Untrusted destination or guest opened an external URL");
    assert.equal(BrowserWindow.getAllWindows().length, 1, "An unmanaged popup was created");
    console.log("PASS: BP guest launches validated VCut links; other destinations and guests are denied; no popup windows.");
  } catch (error) {
    failure = error;
    console.error(error);
  } finally {
    win.destroy();
    await Promise.all([bp, other].map(({ server }) => new Promise<void>(resolve => server.close(() => resolve()))));
    app.exit(failure ? 1 : 0);
  }
}

void main().catch(error => { console.error(error); app.exit(1); });
