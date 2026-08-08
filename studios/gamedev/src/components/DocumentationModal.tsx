import React from "react";
import { BookOpen, X, Code, Zap, Shield, Clock, Flame } from "lucide-react";

interface DocumentationModalProps {
  onClose: () => void;
}

export const DocumentationModal: React.FC<DocumentationModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="h-12 px-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-400" />
            <span className="font-bold text-sm text-slate-100">
              Loom Programming Language Reference
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6 text-xs text-slate-300 font-sans leading-relaxed">
          {/* Intro */}
          <div className="bg-purple-950/30 p-4 rounded-xl border border-purple-900/50 space-y-1">
            <div className="text-sm font-bold text-purple-300 flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-400" />
              <span>What is Loom?</span>
            </div>
            <p className="text-purple-200/80">
              Loom is a language designed for programming dynamic 2D worlds, entities, relations, reactive rules, and temporal state. Rather than imperatively running loops, Loom programs specify what exists, how things relate, and how entities react to state transitions.
            </p>
          </div>

          {/* Grammar & Constructs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="font-bold text-cyan-300 font-mono text-sm flex items-center gap-2">
                <Code className="w-4 h-4 text-cyan-400" />
                <span>1. Entities & State</span>
              </div>
              <pre className="bg-slate-900 p-2.5 rounded-lg text-slate-200 font-mono text-[11px]">
{`entity Player {
    x: 100,
    y: 200,
    hp: 100,
    color: "#00F2FE"
}`}
              </pre>
              <p className="text-slate-400 text-[11px]">
                Entities are stable identities holding state fields.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="font-bold text-pink-300 font-mono text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-pink-400" />
                <span>2. Agents & Capabilities</span>
              </div>
              <pre className="bg-slate-900 p-2.5 rounded-lg text-slate-200 font-mono text-[11px]">
{`agent Rixie {
    can: read Player.x, control Light.on, act
}`}
              </pre>
              <p className="text-slate-400 text-[11px]">
                Agents execute with scoped capabilities evaluated at action call sites.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="font-bold text-amber-300 font-mono text-sm flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" />
                <span>3. Reactive Rules (when)</span>
              </div>
              <pre className="bg-slate-900 p-2.5 rounded-lg text-slate-200 font-mono text-[11px]">
{`when Player near Enemy {
    Player.hp = Player.hp - 10
    Rixie.say("Watch out!")
}`}
              </pre>
              <p className="text-slate-400 text-[11px]">
                Edge-triggered when blocks run instantly when expressions flip false → true.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="font-bold text-indigo-300 font-mono text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span>4. Timers & Intents</span>
              </div>
              <pre className="bg-slate-900 p-2.5 rounded-lg text-slate-200 font-mono text-[11px]">
{`every 1.second {
    Score.val = Score.val + 1
}

intent KeepInBounds {
    ensure Player.x >= 0
    otherwise { Player.x = 0 }
}`}
              </pre>
              <p className="text-slate-400 text-[11px]">
                Intents declare invariants and deterministic repair blocks.
              </p>
            </div>
          </div>
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
