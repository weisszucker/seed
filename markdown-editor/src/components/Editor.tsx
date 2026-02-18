// @ts-nocheck - OpenTUI textarea types are not fully compatible
import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";

interface EditorProps {
  content: string;
  onChange: (newContent: string) => void;
  filePath: string;
  isModified: boolean;
  focused: boolean;
  onFocus: () => void;
}

export interface EditorRef {
  getContent: () => string;
}

export const Editor = forwardRef<EditorRef, EditorProps>(function Editor(
  {
    content,
    onChange,
    filePath,
    isModified,
    focused,
    onFocus,
  },
  ref
) {
  const textareaRef = useRef<any>(null);
  const renderer = useRenderer();
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);

  // Expose getContent method to parent
  useImperativeHandle(ref, () => ({
    getContent: () => {
      const textarea = textareaRef.current;
      if (textarea && textarea.editBuffer) {
        return textarea.editBuffer.getText();
      }
      return content;
    },
  }), [content]);

  // Set initial content when textarea mounts or file changes
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea && textarea.editBuffer && content) {
      textarea.editBuffer.setText(content);
    }
  }, [filePath, content]);

  // Focus textarea when focused prop changes
  useEffect(() => {
    if (focused && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [focused]);

  // Handle content changes from textarea
  const handleChange = useCallback((newContent: string) => {
    onChange(newContent);
    
    // Update cursor position
    const textarea = textareaRef.current;
    if (textarea && textarea.editBuffer) {
      const pos = textarea.editBuffer.getCursorPosition?.();
      if (pos) {
        setCursorLine(pos.row + 1);
        setCursorCol(pos.col + 1);
      }
    }
  }, [onChange]);

  // Handle keyboard shortcuts within editor
  useKeyboard((key) => {
    if (!focused) return;

    // Track cursor position for status bar
    const textarea = textareaRef.current;
    if (textarea && textarea.editBuffer) {
      const pos = textarea.editBuffer.getCursorPosition?.();
      if (pos) {
        setCursorLine(pos.row + 1);
        setCursorCol(pos.col + 1);
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
      width="100%"
      height="100%"
      backgroundColor="#1a1a2e"
      onMouseDown={onFocus}
    >
      {/* Header */}
      <box flexDirection="row" padding={1} backgroundColor="#1a1a2e">
        <text>
          <span fg="#81a2be">{displayName}</span>
        </text>
      </box>

      {/* Editor */}
      <box flexGrow={1} flexDirection="column" padding={1} minHeight={0} backgroundColor="#1a1a2e">
        <textarea
          key={filePath || "untitled"}
          ref={textareaRef}
          initialValue={content}
          onChange={handleChange}
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
});