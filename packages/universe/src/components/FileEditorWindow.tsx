import React, { useEffect, useState } from "react";
import { Document } from "@veasnawt/vicons";
import { DesktopItemData, fileContentKey } from "../utils/desktopItems";
import FloatingWindow from "./FloatingWindow";

interface FileEditorWindowProps {
  item: DesktopItemData;
  cascadeIndex: number;
  taskbarReserve: number;
  onClose: () => void;
  onFocus: () => void;
  onMinimize: () => void;
}

export default function FileEditorWindow({ item, cascadeIndex, taskbarReserve, onClose, onFocus, onMinimize }: FileEditorWindowProps) {
  const [content, setContent] = useState("");

  useEffect(() => {
    setContent(localStorage.getItem(fileContentKey(item.id)) ?? "");
  }, [item.id]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setContent(value);
    localStorage.setItem(fileContentKey(item.id), value);
  }

  return (
    <FloatingWindow
      title={item.name}
      icon={Document}
      color="#94a3b8"
      cascadeIndex={cascadeIndex}
      defaultWidth={440}
      defaultHeight={360}
      taskbarReserve={taskbarReserve}
      onClose={onClose}
      onFocus={onFocus}
      onMinimize={onMinimize}
    >
      <div className="h-full w-full p-4">
        <textarea
          value={content}
          onChange={handleChange}
          placeholder="Start typing…"
          className="h-full w-full resize-none bg-transparent text-xs leading-relaxed text-[var(--os-text)] outline-none placeholder:text-[var(--os-text-muted)]"
        />
      </div>
    </FloatingWindow>
  );
}
