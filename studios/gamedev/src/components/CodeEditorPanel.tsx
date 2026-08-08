import React, { useState, useEffect, useRef } from "react";
import { Code2, CheckCircle2, AlertTriangle, GripHorizontal } from "lucide-react";
import { parse } from "../loom/parser";

interface CodeEditorPanelProps {
  code: string;
  onChangeCode: (newCode: string) => void;
  onCompile: (loomCode: string, silent?: boolean) => boolean;
  onStartResize?: (e: React.MouseEvent) => void;
}

const SNIPPETS = [
  {
    name: "Entity + Gravity",
    code: `entity Hero {\n    x: 100,\n    y: 100,\n    vx: 0,\n    vy: 0,\n    gravity: 800,\n    color: "#00F2FE"\n}`,
  },
  {
    name: "Agent + Capability",
    code: `agent Rixie {\n    x: 200,\n    y: 150,\n    can: read Hero.x, control Hero.score, act\n}`,
  },
  {
    name: "Reactive Rule (when)",
    code: `when Hero near Enemy {\n    Hero.hp = Hero.hp - 10\n    Rixie.say("Watch out!")\n}`,
  },
  {
    name: "Timer (every 1s)",
    code: `every 1.second {\n    Score.val = Score.val + 1\n}`,
  },
  {
    name: "Intent Invariant",
    code: `intent KeepInScreen {\n    ensure Hero.x >= 0 and Hero.x <= 800\n    otherwise {\n        Hero.x = 0\n    }\n}`,
  },
];

// Loom Syntax Highlighter Tokenizer
interface TokenSpan {
  text: string;
  type: "keyword" | "entity" | "field" | "number" | "string" | "comment" | "builtin" | "operator" | "plain";
}

function tokenizeLoomLine(line: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    // 1. Comments
    if (remaining.startsWith("//")) {
      spans.push({ text: remaining, type: "comment" });
      break;
    }

    // 2. Strings
    const stringMatch = remaining.match(/^("[^"]*"|'[^']*')/);
    if (stringMatch) {
      spans.push({ text: stringMatch[0], type: "string" });
      remaining = remaining.slice(stringMatch[0].length);
      continue;
    }

    // 3. Keywords
    const keywordMatch = remaining.match(/^(world|entity|agent|persistent|when|every|after|intent|ensure|otherwise|can|read|control|act|log|not|and|or)\b/i);
    if (keywordMatch) {
      spans.push({ text: keywordMatch[0], type: "keyword" });
      remaining = remaining.slice(keywordMatch[0].length);
      continue;
    }

    // 4. Builtins & Key Input
    const builtinMatch = remaining.match(/^(true|false|Input|keyRight|keyLeft|keyUp|keyDown|space|click|near|touches)\b/);
    if (builtinMatch) {
      spans.push({ text: builtinMatch[0], type: "builtin" });
      remaining = remaining.slice(builtinMatch[0].length);
      continue;
    }

    // 5. Capitalized Entity Names
    const entityMatch = remaining.match(/^([A-Z]\w*)\b/);
    if (entityMatch) {
      spans.push({ text: entityMatch[0], type: "entity" });
      remaining = remaining.slice(entityMatch[0].length);
      continue;
    }

    // 6. Dot Field Access (.field)
    const fieldMatch = remaining.match(/^(\.[a-zA-Z_]\w*)/);
    if (fieldMatch) {
      spans.push({ text: fieldMatch[0], type: "field" });
      remaining = remaining.slice(fieldMatch[0].length);
      continue;
    }

    // 7. Numbers & Time values (100, -200, 1.second, 500ms)
    const numberMatch = remaining.match(/^(-?\d+(?:\.\d+)?(?:s|sec|second|seconds|ms)?)\b/);
    if (numberMatch) {
      spans.push({ text: numberMatch[0], type: "number" });
      remaining = remaining.slice(numberMatch[0].length);
      continue;
    }

    // 8. Operators & Delimiters
    const opMatch = remaining.match(/^([{}()\[\]=+\-*/<>!,:])/);
    if (opMatch) {
      spans.push({ text: opMatch[0], type: "operator" });
      remaining = remaining.slice(opMatch[0].length);
      continue;
    }

    // 9. Plain identifier or whitespace
    const plainMatch = remaining.match(/^([a-z_]\w*|\s+)/i);
    if (plainMatch) {
      spans.push({ text: plainMatch[0], type: "plain" });
      remaining = remaining.slice(plainMatch[0].length);
      continue;
    }

    // Fallback single char
    spans.push({ text: remaining[0], type: "plain" });
    remaining = remaining.slice(1);
  }

  return spans;
}

export const CodeEditorPanel: React.FC<CodeEditorPanelProps> = ({
  code,
  onChangeCode,
  onCompile,
  onStartResize,
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastCompiledCode, setLastCompiledCode] = useState<string>(code);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement | null>(null);

  // Debounced continuous auto-compile when typing pauses for 500ms
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        parse(code);
        setErrorMsg(null);
        onCompile(code, true);
        setLastCompiledCode(code);
      } catch (err: any) {
        // Silent while typing incomplete expressions
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [code]);

  const handleApply = (targetCode = code) => {
    try {
      parse(targetCode);
      const ok = onCompile(targetCode, false);
      if (ok) {
        setErrorMsg(null);
        setLastCompiledCode(targetCode);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleInsertSnippet = (snippetCode: string) => {
    const updated = code + "\n\n" + snippetCode;
    onChangeCode(updated);
    handleApply(updated);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleApply();
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      const newCode = code.substring(0, start) + "    " + code.substring(end);
      onChangeCode(newCode);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 4;
        }
      }, 0);
    }
  };

  const lineCount = Math.max(1, code.split("\n").length);
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  const handleScroll = () => {
    if (textareaRef.current) {
      const top = textareaRef.current.scrollTop;
      const left = textareaRef.current.scrollLeft;

      if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = top;
      if (highlightRef.current) {
        highlightRef.current.scrollTop = top;
        highlightRef.current.scrollLeft = left;
      }
    }
  };

  const lines = code.split("\n");
  const isDirty = code !== lastCompiledCode;

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-slate-300 font-mono text-xs select-none min-h-0 overflow-hidden">
      {/* Editor Sub-Header */}
      <div className="h-8 px-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 shrink-0">
        <div className="flex items-center gap-2">
          <Code2 className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-semibold text-xs text-slate-200">
            Loom Declarative Code Studio
          </span>
          <span className="text-[10px] text-slate-500 font-sans">(.loom)</span>
        </div>

        {/* Snippets & Status */}
        <div className="flex items-center gap-2">
          <select
            onChange={(e) => {
              if (e.target.value) {
                handleInsertSnippet(e.target.value);
                e.target.value = "";
              }
            }}
            className="bg-slate-800 text-slate-300 border border-slate-700 text-[11px] rounded px-2 py-0.5 focus:outline-none cursor-pointer"
          >
            <option value="">+ Insert Snippet...</option>
            {SNIPPETS.map((s, idx) => (
              <option key={idx} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Compilation status */}
          <div className="flex items-center gap-1.5">
            {errorMsg ? (
              <div className="flex items-center gap-1 text-rose-400 text-[11px] font-sans font-medium">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-xs">{errorMsg}</span>
              </div>
            ) : isDirty ? (
              <div className="flex items-center gap-1 text-amber-400 text-[11px] font-sans font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Unapplied Edits (Ctrl+Enter)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-emerald-400 text-[11px] font-sans font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Compiled OK</span>
              </div>
            )}
          </div>

          <button
            onClick={() => handleApply()}
            className="px-2.5 py-0.5 bg-cyan-600 hover:bg-cyan-500 text-white font-sans font-semibold rounded text-[11px] transition shadow-sm flex items-center gap-1"
            title="Compile & Apply Loom Script (Ctrl+Enter)"
          >
            <span>Apply</span>
          </button>

          {onStartResize && (
            <div
              onMouseDown={onStartResize}
              className="p-1 text-slate-500 hover:text-cyan-400 cursor-row-resize rounded hover:bg-slate-800 transition"
              title="Drag to resize editor height"
            >
              <GripHorizontal className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
      </div>

      {/* Editor Body: Line Numbers + Textarea Overlay */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative bg-slate-950">
        {/* Line Numbers Gutter */}
        <div
          ref={lineNumbersRef}
          className="w-10 bg-slate-900/90 border-r border-slate-800/80 py-3 text-right pr-2 text-slate-600 font-mono text-xs select-none overflow-hidden shrink-0 leading-relaxed z-10"
        >
          {lineNumbers.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </div>

        {/* Syntax Highlighted Underlay */}
        <div
          ref={highlightRef}
          className="absolute inset-0 left-10 p-3 font-mono text-xs leading-relaxed overflow-hidden pointer-events-none whitespace-pre z-0"
        >
          {lines.map((line, lineIdx) => {
            const spans = tokenizeLoomLine(line);
            return (
              <div key={lineIdx} className="leading-relaxed">
                {spans.length === 0 ? (
                  <br />
                ) : (
                  spans.map((span, sIdx) => {
                    let styleClass = "text-slate-300";
                    switch (span.type) {
                      case "keyword":
                        styleClass = "text-pink-400 font-bold";
                        break;
                      case "entity":
                        styleClass = "text-cyan-300 font-semibold";
                        break;
                      case "field":
                        styleClass = "text-sky-300";
                        break;
                      case "builtin":
                        styleClass = "text-amber-300 font-semibold";
                        break;
                      case "number":
                        styleClass = "text-emerald-400 font-semibold";
                        break;
                      case "string":
                        styleClass = "text-orange-300";
                        break;
                      case "comment":
                        styleClass = "text-slate-500 italic";
                        break;
                      case "operator":
                        styleClass = "text-slate-400";
                        break;
                      default:
                        styleClass = "text-slate-200";
                    }
                    return (
                      <span key={sIdx} className={styleClass}>
                        {span.text}
                      </span>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>

        {/* Transparent Interactive Textarea Overlay */}
        <textarea
          ref={textareaRef}
          value={code}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          onChange={(e) => {
            setErrorMsg(null);
            onChangeCode(e.target.value);
          }}
          spellCheck={false}
          className="flex-1 h-full w-full bg-transparent text-transparent caret-cyan-400 p-3 font-mono text-xs focus:outline-none resize-none leading-relaxed selection:bg-cyan-500/30 border-none overflow-auto z-10"
        />
      </div>
    </div>
  );
};
