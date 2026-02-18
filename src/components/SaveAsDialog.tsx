import { useState, useEffect } from "react";
import { useTheme } from "../theme-context.js";

interface SaveAsDialogProps {
  isOpen: boolean;
  currentDir: string;
  onClose: () => void;
  onSave: (path: string) => void;
  defaultName?: string;
}

export function SaveAsDialog({ isOpen, currentDir, onClose, onSave, defaultName }: SaveAsDialogProps) {
  const { theme } = useTheme();
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
      backgroundColor={theme.colors.panelBackground}
      flexDirection="column"
    >
      {/* Header */}
      <box flexDirection="row" backgroundColor={theme.colors.surface} padding={1}>
        <text>
          <strong fg={theme.colors.warning}>Save File As</strong>
        </text>
      </box>

      {/* Content */}
      <box flexGrow={1} flexDirection="column" padding={1} gap={1}>
        <text fg={theme.colors.textPrimary}>Enter file name:</text>
        <input
          value={typedPath}
          onChange={setTypedPath}
          placeholder="filename.md"
          focused
          width="100%"
        />
        {typedPath && (
          <text fg={theme.colors.textMuted}>
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
          <text fg={theme.colors.success}>Save</text>
        </box>
        <box border padding={1} onMouseDown={onClose}>
          <text fg={theme.colors.danger}>Cancel</text>
        </box>
      </box>
    </box>
  );
}
