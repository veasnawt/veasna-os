import React, { useState } from "react";
import { Download, X, FileCode, Globe, Copy, Check, Loader2, AlertTriangle } from "lucide-react";
import confetti from "canvas-confetti";
import type { TileMapData } from "../loom/gameEngine";

interface ExportModalProps {
  loomCode: string;
  projectName: string;
  tileMap: TileMapData;
  worldWidth: number;
  worldHeight: number;
  onClose: () => void;
}

// The HTML parser looks for the literal byte sequence "</script" regardless of
// whether it's inside a string, so anything embedded inside a <script> tag (the
// runtime bundle, or a user's Loom source/log text) has to have that sequence
// broken up or it would prematurely close the tag and corrupt the page.
function escapeForScriptTag(s: string): string {
  return s.replace(/<\/script/gi, "<\\/script");
}

export const ExportModal: React.FC<ExportModalProps> = ({
  loomCode,
  projectName,
  tileMap,
  worldWidth,
  worldHeight,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleDownloadLoom = () => {
    const blob = new Blob([loomCode], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "game.loom";
    a.click();
    URL.revokeObjectURL(url);
    confetti({ particleCount: 50, spread: 60 });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(loomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadHTML = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/loom-runtime.js");
      if (!res.ok) throw new Error(`Runtime bundle request failed (${res.status})`);
      const runtimeJs = await res.text();

      const projectData = JSON.stringify({
        loomCode,
        tileMap,
        worldWidth,
        worldHeight,
      });

      const safeTitle = (projectName || "Loom Game").replace(/[<>&]/g, "");

      const standaloneHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safeTitle}</title>
    <style>
        html, body { margin: 0; padding: 0; height: 100%; background: #020617; overflow: hidden; }
        body { display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: system-ui, sans-serif; }
        #game { width: 100vw; height: 100vh; display: block; }
        .credit { position: fixed; bottom: 8px; left: 50%; transform: translateX(-50%); font-size: 11px; color: #64748B; pointer-events: none; }
    </style>
</head>
<body>
    <canvas id="game"></canvas>
    <div class="credit">${safeTitle} -- built with Loom Engine</div>

    <script id="loom-project-data" type="application/json">${escapeForScriptTag(projectData)}</script>

    <script>${escapeForScriptTag(runtimeJs)}</script>

    <script>
    (function () {
      var data = JSON.parse(document.getElementById("loom-project-data").textContent);
      var engine = new LoomRuntime.LoomGameEngine(data.loomCode);
      engine.worldWidth = data.worldWidth || 800;
      engine.worldHeight = data.worldHeight || 600;
      if (data.tileMap) engine.tileMap = data.tileMap;
      // The constructor already loaded the world once, before worldWidth/worldHeight
      // above were applied -- camera-follow's "does this level need scrolling" check
      // (loadSource in gameEngine.ts) runs off those dimensions, so it would've seen
      // the default 800x600 and left the camera static. Reload now that the real
      // world size is set, so e.g. Platformer Odyssey's camera follows Player like
      // it does in the Studio.
      engine.loadSource(data.loomCode);

      var canvas = document.getElementById("game");
      engine.canvas = canvas;
      engine.ctx = canvas.getContext("2d");

      function resize() {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        engine.render();
      }
      window.addEventListener("resize", resize);
      resize();

      engine.start();
    })();
    </script>
</body>
</html>`;

      const blob = new Blob([standaloneHTML], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "loom-game.html";
      a.click();
      URL.revokeObjectURL(url);
      confetti({ particleCount: 80, spread: 80 });
    } catch (err: any) {
      setExportError(err.message || "Failed to build the standalone export.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="h-12 px-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-cyan-400" />
            <span className="font-bold text-sm text-slate-100">Export Loom Project</span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Export Options */}
        <div className="p-6 space-y-4">
          <button
            onClick={handleDownloadLoom}
            className="w-full p-4 bg-slate-950 hover:bg-slate-800 rounded-xl border border-slate-800 flex items-center gap-3 transition group text-left"
          >
            <div className="w-10 h-10 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800 flex items-center justify-center shrink-0">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-200 group-hover:text-cyan-300">
                Download .loom Source Code
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Save the complete Loom declarative world specification file.
              </div>
            </div>
          </button>

          <button
            onClick={handleDownloadHTML}
            disabled={exporting}
            className="w-full p-4 bg-slate-950 hover:bg-slate-800 disabled:opacity-60 rounded-xl border border-slate-800 flex items-center gap-3 transition group text-left"
          >
            <div className="w-10 h-10 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-800 flex items-center justify-center shrink-0">
              {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Globe className="w-5 h-5" />}
            </div>
            <div>
              <div className="text-xs font-bold text-slate-200 group-hover:text-indigo-300">
                {exporting ? "Building Standalone Game..." : "Download Standalone HTML Web App"}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                A real, playable game -- the actual Loom engine embedded, no Studio needed. Open the file in any browser.
              </div>
            </div>
          </button>

          {exportError && (
            <div className="flex items-start gap-2 p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-[11px]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{exportError}</span>
            </div>
          )}

          <button
            onClick={handleCopyCode}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? "Copied to Clipboard!" : "Copy Loom Source to Clipboard"}</span>
          </button>
        </div>

        {/* Footer */}
        <div className="h-12 px-4 border-t border-slate-800 flex items-center justify-end bg-slate-950/60">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
