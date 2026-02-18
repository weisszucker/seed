import { useState, useCallback, useMemo } from "react";
import { useRenderer, useKeyboard } from "@opentui/react";
import { useFileSystem } from "../hooks/useFileSystem.js";
import { FileTree } from "./FileTree.js";
import { Editor } from "./Editor.js";
import { StatusBar } from "./StatusBar.js";
import { FileDialog } from "./FileDialog.js";
import { SavePrompt } from "./SavePrompt.js";
import { FileNode } from "../utils/fileTree.js";

interface AppProps {
  initialDir: string;
}

export function App({ initialDir }: AppProps) {
  const renderer = useRenderer();
  const {
    currentDir,
    fileTree,
    currentFile,
    error,
    openFile,
    newFile,
    updateContent,
    saveFile,
    changeDirectory,
    refreshFileTree,
  } = useFileSystem(initialDir);

  // UI State
  const [currentFocus, setCurrentFocus] = useState<"sidebar" | "editor">("editor");
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([initialDir]));
  const [showFileDialog, setShowFileDialog] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: "open" | "new" | "quit";
    path?: string;
  } | null>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  // Flatten file tree for dialog
  const flatFileList = useMemo(() => {
    const flatten = (node: FileNode | null): { path: string; name: string; type: "file" | "directory" }[] => {
      if (!node) return [];
      const result: { path: string; name: string; type: "file" | "directory" }[] = [];
      
      const traverse = (n: FileNode, prefix: string = "") => {
        const displayName = prefix ? `${prefix}/${n.name}` : n.name;
        result.push({ path: n.path, name: displayName, type: n.type });
        
        if (n.children) {
          for (const child of n.children) {
            traverse(child, displayName);
          }
        }
      };
      
      traverse(node);
      return result;
    };
    
    return flatten(fileTree);
  }, [fileTree]);

  // Toggle directory expansion
  const handleToggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Handle file selection from tree
  const handleFileSelect = useCallback(async (path: string) => {
    const result = await openFile(path);
    if (result.needsSave) {
      setPendingAction({ type: "open", path });
      setShowSavePrompt(true);
    } else if (!result.error) {
      setCurrentFocus("editor");
    }
  }, [openFile]);

  // Keyboard shortcuts
  useKeyboard(
    useCallback(
      (key) => {
        // Don't handle shortcuts if dialog is open
        if (showFileDialog || showSavePrompt) return;

        // Ctrl+O: Open file dialog
        if (key.ctrl && key.name === "o") {
          setShowFileDialog(true);
          return;
        }

        // Ctrl+S: Save file
        if (key.ctrl && key.name === "s") {
          if (key.shift) {
            // Save As - not implemented yet, just save
            saveFile();
          } else {
            saveFile();
          }
          return;
        }

        // Ctrl+N: New file
        if (key.ctrl && key.name === "n") {
          const result = newFile();
          if (result.needsSave) {
            setPendingAction({ type: "new" });
            setShowSavePrompt(true);
          }
          return;
        }

        // Ctrl+Q: Quit
        if (key.ctrl && key.name === "q") {
          if (currentFile?.isModified) {
            setPendingAction({ type: "quit" });
            setShowSavePrompt(true);
          } else {
            renderer.destroy();
          }
          return;
        }

        // Ctrl+R: Refresh file tree
        if (key.ctrl && key.name === "r") {
          refreshFileTree();
          return;
        }

        // Tab: Toggle focus
        if (key.name === "tab" && !key.ctrl) {
          setCurrentFocus((prev) => (prev === "sidebar" ? "editor" : "sidebar"));
          return;
        }

        // Escape: Switch focus to editor
        if (key.name === "escape") {
          setCurrentFocus("editor");
          return;
        }
      },
      [showFileDialog, showSavePrompt, currentFile, saveFile, newFile, renderer, refreshFileTree]
    )
  );

  // Handle save prompt actions
  const handleSavePromptSave = useCallback(async () => {
    const result = await saveFile();
    if (result.success) {
      setShowSavePrompt(false);
      
      // Execute pending action
      if (pendingAction?.type === "open" && pendingAction.path) {
        await openFile(pendingAction.path);
        setCurrentFocus("editor");
      } else if (pendingAction?.type === "new") {
        newFile();
      } else if (pendingAction?.type === "quit") {
        renderer.destroy();
      }
      
      setPendingAction(null);
    }
  }, [pendingAction, saveFile, openFile, newFile, renderer]);

  const handleSavePromptDiscard = useCallback(() => {
    setShowSavePrompt(false);
    
    // Execute pending action without saving
    if (pendingAction?.type === "open" && pendingAction.path) {
      // Force open without save check by temporarily clearing modified state
      // This is handled in the useFileSystem hook
      openFile(pendingAction.path).then(() => {
        setCurrentFocus("editor");
      });
    } else if (pendingAction?.type === "new") {
      // Just close the prompt and let user try newFile again
      // The newFile function will handle it
      newFile();
    } else if (pendingAction?.type === "quit") {
      renderer.destroy();
    }
    
    setPendingAction(null);
  }, [pendingAction, openFile, newFile, renderer]);

  const handleSavePromptCancel = useCallback(() => {
    setShowSavePrompt(false);
    setPendingAction(null);
  }, []);

  // Handle file dialog open
  const handleFileDialogOpen = useCallback(async (path: string) => {
    setShowFileDialog(false);
    
    // Check if we need to save current file first
    if (currentFile?.isModified) {
      setPendingAction({ type: "open", path });
      setShowSavePrompt(true);
    } else {
      const result = await openFile(path);
      if (!result.error) {
        setCurrentFocus("editor");
      }
    }
  }, [currentFile, openFile]);

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor="#1a1a2e">
      {/* Error message */}
      {error && (
        <box backgroundColor="#cc6666" padding={1}>
          <text fg="#ffffff">{error}</text>
        </box>
      )}

      {/* Main content area */}
      <box flexDirection="row" flexGrow={1} height="100%">
        {/* Sidebar */}
        <box width="30%" height="100%" border backgroundColor="#1a1a2e">
          <FileTree
            tree={fileTree}
            currentFilePath={currentFile?.path || null}
            onFileSelect={handleFileSelect}
            expandedDirs={expandedDirs}
            onToggleDir={handleToggleDir}
            focused={currentFocus === "sidebar"}
          />
        </box>

        {/* Editor */}
        <box flexGrow={1} height="100%" flexDirection="column">
          <Editor
            content={currentFile?.content || ""}
            onChange={updateContent}
            filePath={currentFile?.path || ""}
            isModified={currentFile?.isModified || false}
            focused={currentFocus === "editor"}
            onFocus={() => setCurrentFocus("editor")}
          />
        </box>
      </box>

      {/* Status bar */}
      <StatusBar
        filePath={currentFile?.path || null}
        isModified={currentFile?.isModified || false}
        cursorLine={cursorPos.line}
        cursorCol={cursorPos.col}
        currentFocus={currentFocus}
      />

      {/* Modals */}
      <FileDialog
        isOpen={showFileDialog}
        currentDir={currentDir}
        onClose={() => setShowFileDialog(false)}
        onOpen={handleFileDialogOpen}
        fileTree={flatFileList}
      />

      <SavePrompt
        isOpen={showSavePrompt}
        fileName={currentFile?.path?.split("/").pop() || "Untitled"}
        onSave={handleSavePromptSave}
        onDiscard={handleSavePromptDiscard}
        onCancel={handleSavePromptCancel}
      />
    </box>
  );
}