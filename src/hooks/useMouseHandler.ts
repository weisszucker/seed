import { useState, useCallback, useRef, useEffect } from "react";

interface MousePosition {
  x: number;
  y: number;
}

interface Selection {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export function useMouseHandler(
  text: string,
  onTextChange: (newText: string) => void,
  textareaRef: React.RefObject<any>
) {
  const [isDragging, setIsDragging] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number }>({ line: 0, col: 0 });
  const dragStartRef = useRef<MousePosition | null>(null);

  // Handle mouse down - start selection
  const handleMouseDown = useCallback(
    (event: { x: number; y: number }) => {
      setIsDragging(true);
      dragStartRef.current = { x: event.x, y: event.y };
      
      // Calculate cursor position from mouse coordinates
      // This is a simplified version - actual implementation would need
      // to account for line numbers, borders, etc.
      const col = Math.max(0, event.x - 4); // Account for line numbers + border
      const line = Math.max(0, event.y - 1); // Account for top border
      
      setCursorPos({ line, col });
      setSelection({
        startLine: line,
        startCol: col,
        endLine: line,
        endCol: col,
      });
    },
    []
  );

  // Handle mouse move - update selection while dragging
  const handleMouseMove = useCallback(
    (event: { x: number; y: number }) => {
      if (!isDragging || !dragStartRef.current) return;

      const col = Math.max(0, event.x - 4);
      const line = Math.max(0, event.y - 1);

      setSelection((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          endLine: line,
          endCol: col,
        };
      });
    },
    [isDragging]
  );

  // Handle mouse up - end selection
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  // Copy selected text to clipboard
  const copySelection = useCallback(() => {
    if (!selection || !textareaRef.current) return false;

    // Access the textarea's underlying renderable to get selected text
    // This is OpenTUI-specific implementation
    const textarea = textareaRef.current;
    if (textarea && textarea.getSelection) {
      const selectedText = textarea.getSelection();
      if (selectedText) {
        // Use OSC 52 for clipboard
        const osc52 = `\x1b]52;c;${Buffer.from(selectedText).toString("base64")}\x07`;
        process.stdout.write(osc52);
        return true;
      }
    }
    return false;
  }, [selection, textareaRef]);

  return {
    isDragging,
    selection,
    cursorPos,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    copySelection,
  };
}