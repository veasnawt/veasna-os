import React, { useState } from "react";
import { Terminal, Filter, Trash2 } from "lucide-react";
import type { EventLogEntry } from "../loom/interpreter";

interface EventLogPanelProps {
  logs: EventLogEntry[];
  onClearLogs: () => void;
}

export const EventLogPanel: React.FC<EventLogPanelProps> = ({ logs, onClearLogs }) => {
  const [filterKind, setFilterKind] = useState<string>("all");

  const filteredLogs = logs.filter((l) => (filterKind === "all" ? true : l.kind === filterKind));

  const getKindBadge = (kind: EventLogEntry["kind"]) => {
    switch (kind) {
      case "event_fired":
        return "bg-amber-950 text-amber-300 border-amber-800";
      case "state_changed":
        return "bg-cyan-950 text-cyan-300 border-cyan-800";
      case "intent_violated":
        return "bg-purple-950 text-purple-300 border-purple-800";
      case "action":
        return "bg-indigo-950 text-indigo-300 border-indigo-800";
      case "collision":
        return "bg-rose-950 text-rose-300 border-rose-800";
      case "permission_denied":
        return "bg-red-950 text-red-300 border-red-800";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border-t border-slate-800 text-slate-300 font-mono text-xs select-none">
      {/* Header */}
      <div className="h-9 px-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-xs uppercase tracking-wider text-slate-200">
            Occurrence Log ({filteredLogs.length})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value)}
              className="bg-slate-800 text-slate-300 border border-slate-700 text-[11px] rounded px-2 py-0.5 focus:outline-none cursor-pointer"
            >
              <option value="all">All Occurrences</option>
              <option value="event_fired">event_fired</option>
              <option value="state_changed">state_changed</option>
              <option value="intent_violated">intent_violated</option>
              <option value="action">action</option>
              <option value="collision">collision</option>
              <option value="permission_denied">permission_denied</option>
            </select>
          </div>

          <button
            onClick={onClearLogs}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Clear Log Stream"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Log Output Stream */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 font-mono text-[11px]">
        {filteredLogs.length === 0 ? (
          <div className="text-slate-600 italic px-2 py-3 text-center">
            No logged occurrences yet. Run simulation to stream event log.
          </div>
        ) : (
          filteredLogs.slice(-100).map((l, idx) => (
            <div
              key={idx}
              className="bg-slate-900/60 p-1.5 rounded border border-slate-800/80 flex items-start gap-2 leading-tight hover:bg-slate-900 transition"
            >
              <span className="text-slate-500 shrink-0 font-medium">t={Math.round(l.t)}ms</span>
              <span
                className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold shrink-0 border ${getKindBadge(
                  l.kind
                )}`}
              >
                {l.kind}
              </span>
              <span className="text-slate-300 truncate">
                {typeof l.detail === "object" ? JSON.stringify(l.detail) : String(l.detail)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
