import { useEffect, useCallback } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";

export interface KeyboardShortcuts {
  onOpenFile: () => void;
  onSaveFile: () => void;
  onSaveAs: () => void;
  onNewFile: () => void;
  onQuit: () => void;
  onToggleFocus: () => void;
  onRefreshTree: () => void;
}

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcuts,
  isInputFocused: boolean
) {
  const renderer = useRenderer();

  useKeyboard(
    useCallback(
      (key) => {
        // Don't handle shortcuts if input is focused (unless it's Ctrl+key)
        if (isInputFocused && !key.ctrl) {
          return;
        }

        // Ctrl+O: Open file
        if (key.ctrl && key.name === "o") {
          shortcuts.onOpenFile();
          return;
        }

        // Ctrl+S: Save file
        if (key.ctrl && key.name === "s") {
          if (key.shift) {
            shortcuts.onSaveAs();
          } else {
            shortcuts.onSaveFile();
          }
          return;
        }

        // Ctrl+N: New file
        if (key.ctrl && key.name === "n") {
          shortcuts.onNewFile();
          return;
        }

        // Ctrl+Q: Quit
        if (key.ctrl && key.name === "q") {
          shortcuts.onQuit();
          return;
        }

        // Ctrl+R: Refresh file tree
        if (key.ctrl && key.name === "r") {
          shortcuts.onRefreshTree();
          return;
        }

        // Tab: Toggle focus between sidebar and editor
        if (key.name === "tab" && !key.ctrl) {
          shortcuts.onToggleFocus();
          return;
        }

        // Escape: Can be used for various purposes
        if (key.name === "escape") {
          // Could be used to close modals, switch to normal mode, etc.
        }
      },
      [shortcuts, isInputFocused]
    )
  );

  return { renderer };
}