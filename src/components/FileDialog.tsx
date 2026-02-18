import { useState, useEffect } from "react";
import { useTheme } from "../theme-context.js";

interface FileDialogProps {
  isOpen: boolean;
  currentDir: string;
  onClose: () => void;
  onOpen: (path: string) => void;
  fileTree: { path: string; name: string; type: "file" | "directory" }[];
}

export function FileDialog({ isOpen, currentDir, onClose, onOpen, fileTree }: FileDialogProps) {
  const { theme } = useTheme();
  const [mode, setMode] = useState<"type" | "browse">("type");
  const [typedPath, setTypedPath] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setTypedPath("");
      setSelectedIndex(0);
      setMode("type");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredFiles = fileTree.filter((f) => f.type === "file");

  return (
    <box
      position="absolute"
      top="30%"
      left="20%"
      width="60%"
      height="40%"
      border
      backgroundColor={theme.colors.panelBackground}
      flexDirection="column"
    >
      {/* Header */}
      <box flexDirection="row" backgroundColor={theme.colors.surface} padding={1}>
        <text>
          <strong fg={theme.colors.warning}>Open File</strong>
        </text>
      </box>

      {/* Mode Tabs */}
      <box flexDirection="row" padding={1} gap={2}>
        <box
          border={mode === "type"}
          padding={1}
          onMouseDown={() => setMode("type")}
        >
          <text fg={mode === "type" ? theme.colors.info : theme.colors.textMuted}>Type Path</text>
        </box>
        <box
          border={mode === "browse"}
          padding={1}
          onMouseDown={() => setMode("browse")}
        >
          <text fg={mode === "browse" ? theme.colors.info : theme.colors.textMuted}>Browse</text>
        </box>
      </box>

      {/* Content */}
      <box flexGrow={1} flexDirection="column" padding={1}>
        {mode === "type" ? (
          <box flexDirection="column" gap={1}>
            <text fg={theme.colors.textPrimary}>Enter file path:</text>
            <input
              value={typedPath}
              onChange={setTypedPath}
              placeholder={`${currentDir}/filename.md`}
              focused
              width="100%"
            />
          </box>
        ) : (
          <scrollbox flexDirection="column" height="100%">
            {filteredFiles.length === 0 ? (
              <text fg={theme.colors.textMuted}>No files found</text>
            ) : (
              filteredFiles.map((file, index) => (
                <box
                  key={file.path}
                  flexDirection="row"
                  backgroundColor={index === selectedIndex ? theme.colors.surface : undefined}
                  onMouseDown={() => {
                    setSelectedIndex(index);
                    onOpen(file.path);
                  }}
                >
                  <text>
                    {index === selectedIndex ? "> " : "  "}
                    {file.name}
                  </text>
                </box>
              ))
            )}
          </scrollbox>
        )}
      </box>

      {/* Buttons */}
      <box flexDirection="row" padding={1} gap={2} justifyContent="flex-end">
        <box
          border
          padding={1}
          onMouseDown={() => {
            if (mode === "type" && typedPath) {
              onOpen(typedPath);
            } else if (mode === "browse" && filteredFiles[selectedIndex]) {
              onOpen(filteredFiles[selectedIndex].path);
            }
          }}
        >
          <text fg={theme.colors.success}>Open</text>
        </box>
        <box border padding={1} onMouseDown={onClose}>
          <text fg={theme.colors.danger}>Cancel</text>
        </box>
      </box>
    </box>
  );
}
