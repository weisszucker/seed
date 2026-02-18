import { useState, useEffect } from "react";

interface SaveAsDialogProps {
  isOpen: boolean;
  currentDir: string;
  onClose: () => void;
  onSave: (path: string) => void;
  defaultName?: string;
}

export function SaveAsDialog({ isOpen, currentDir, onClose, onSave, defaultName }: SaveAsDialogProps) {
  const [typedPath, setTypedPath] = useState("");

  useEffect(() => {
    if (isOpen) {
      setTypedPath(defaultName || "");
    }
  }, [isOpen, defaultName]);

  if (!isOpen) return null;

  const fullPath = typedPath.startsWith("/") ? typedPath : `${currentDir}/${typedPath}`;

  return (
    <box
      position="absolute"
      top="35%"
      left="25%"
      width="50%"
      height="30%"
      border
      backgroundColor="#1a1a2e"
      flexDirection="column"
    >
      {/* Header */}
      <box flexDirection="row" backgroundColor="#2a2a3e" padding={1}>
        <text>
          <strong fg="#f0c674">Save File As</strong>
        </text>
      </box>

      {/* Content */}
      <box flexGrow={1} flexDirection="column" padding={1} gap={1}>
        <text fg="#c5c8c6">Enter file name:</text>
        <input
          value={typedPath}
          onChange={setTypedPath}
          placeholder="filename.md"
          focused
          width="100%"
        />
        {typedPath && (
          <text fg="#666">
            Path: {fullPath}
          </text>
        )}
      </box>

      {/* Buttons */}
      <box flexDirection="row" padding={1} gap={2} justifyContent="flex-end">
        <box
          border
          padding={1}
          onMouseDown={() => {
            if (typedPath.trim()) {
              onSave(fullPath);
            }
          }}
        >
          <text fg="#b5bd68">💾 Save</text>
        </box>
        <box border padding={1} onMouseDown={onClose}>
          <text fg="#cc6666">Cancel</text>
        </box>
      </box>
    </box>
  );
}