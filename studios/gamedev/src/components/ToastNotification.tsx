import React from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  message?: string;
}

interface ToastNotificationProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  const getStyle = (type: ToastMessage["type"]) => {
    switch (type) {
      case "success":
        return {
          bg: "bg-emerald-950/90 border-emerald-500/50 text-emerald-200",
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
        };
      case "error":
        return {
          bg: "bg-rose-950/90 border-rose-500/50 text-rose-200",
          icon: <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />,
        };
      case "warning":
        return {
          bg: "bg-amber-950/90 border-amber-500/50 text-amber-200",
          icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
        };
      case "info":
      default:
        return {
          bg: "bg-cyan-950/90 border-cyan-500/50 text-cyan-200",
          icon: <Info className="w-4 h-4 text-cyan-400 shrink-0" />,
        };
    }
  };

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50 pointer-events-none max-w-md w-full px-4 select-none">
      {toasts.map((toast) => {
        const style = getStyle(toast.type);
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl border backdrop-blur-md shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${style.bg}`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {style.icon}
              <div className="min-w-0">
                <p className="text-xs font-bold leading-none">{toast.title}</p>
                {toast.message && (
                  <p className="text-[11px] opacity-80 mt-1 truncate">{toast.message}</p>
                )}
              </div>
            </div>

            <button
              onClick={() => onDismiss(toast.id)}
              className="p-1 rounded-lg opacity-60 hover:opacity-100 hover:bg-slate-800/40 transition shrink-0 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
