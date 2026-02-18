// @ts-nocheck - OpenTUI textarea types are not fully compatible
import { useRef, useEffect, useState } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";

interface EditorProps {
  content: string;
  onChange: (newContent: string) => void;
  filePath: string;
  isModified: boolean;
  focused: boolean;
  onFocus: () => void;
}

export function Editor({
  content,
  onChange,
  filePath,
  isModified,
  focused,
  onFocus,
}: EditorProps) {
  const textareaRef = useRef<any>(null);
  const renderer = useRenderer();
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);

  // Focus textarea when focused prop changes
  useEffect(() => {
    if (focused && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [focused]);

  // Handle keyboard shortcuts within editor
  useKeyboard((key) => {
    if (!focused) return;

    // Let textarea handle most keys, but capture some shortcuts
    if (key.ctrl && key.name === "c") {
      // Copy - let textarea handle this natively
      return;
    }

    if (key.ctrl && key.name === "v") {
      // Paste - handled by textarea
      return;
    }

    // Track cursor position for status bar
    if (textareaRef.current) {
      const pos = textareaRef.current.getCursorPosition?.();
      if (pos) {
        setCursorLine(pos.line + 1);
        setCursorCol(pos.column + 1);
      }
    }
  });

  // Get file name from path
  const fileName = filePath ? filePath.split("/").pop() : "Untitled";
  const displayName = isModified ? `${fileName} [*]` : fileName;

  // Determine language based on file extension
  const getLanguage = (path: string): string => {
    if (!path) return "markdown";
    const ext = path.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "md":
      case "markdown":
        return "markdown";
      case "ts":
      case "tsx":
        return "typescript";
      case "js":
      case "jsx":
        return "javascript";
      case "json":
        return "json";
      case "py":
        return "python";
      case "rs":
        return "rust";
      case "go":
        return "go";
      case "html":
        return "html";
      case "css":
        return "css";
      default:
        return "markdown";
    }
  };

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      height="100%"
      onMouseDown={onFocus}
    >
      {/* Header */}
      <box flexDirection="row" padding={1} backgroundColor="#1a1a2e">
        <text>
          <span fg="#81a2be">📄</span>
          <span> {displayName}</span>
        </text>
      </box>

      {/* Editor */}
      <box flexGrow={1} flexDirection="column">
        <textarea
          // @ts-ignore
          ref={textareaRef}
          onChange={onChange}
          language={getLanguage(filePath)}
          showLineNumbers
          wrapText={false}
          tabSize={2}
          focused={focused}
          backgroundColor="#1a1a2e"
          textColor="#c5c8c6"
          cursorColor="#81a2be"
          focusedBackgroundColor="#1a1a2e"
          placeholder="Start typing..."
        />
      </box>
    </box>
  );
}