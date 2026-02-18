import { useState, useCallback, useMemo, useRef } from "react";
import { useRenderer, useKeyboard } from "@opentui/react";
import { useFileSystem } from "../hooks/useFileSystem.js";
import { FileTree } from "./FileTree.js";
import { Editor, EditorRef } from "./Editor.js";
import { StatusBar } from "./StatusBar.js";
import { FileDialog } from "./FileDialog.js";
import { SavePrompt } from "./SavePrompt.js";
import { QuitPrompt } from "./QuitPrompt.js";
import { SaveAsDialog } from "./SaveAsDialog.js";
import { FileNode } from "../utils/fileTree.js";

interface AppProps {
  initialDir: string;
}

export function App({ initialDir }: AppProps) {
  const renderer = useRenderer();
  const editorRef = useRef<EditorRef>(null);
  
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
  const [showQuitPrompt, setShowQuitPrompt] = useState(false);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: "open" | "new" | "quit";
    path?: string;
  } | null>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  // Get current content from editor
  const getCurrentContent = useCallback(() => {
    if (editorRef.current) {
      return editorRef.current.getContent();
    }
    return currentFile?.content || "";
  }, [currentFile?.content]);

  // Save with current editor content
  const handleSaveFile = useCallback(async () => {
    // If no path, show SaveAs dialog
    if (!currentFile?.path) {
      setShowSaveAsDialog(true);
      return { success: false, error: "No path" };
    }
    
    const content = getCurrentContent();
    return saveFile(undefined, content);
  }, [currentFile?.path, getCurrentContent, saveFile]);

  // Handle save as
  const handleSaveAs = useCallback(async (path: string) => {
    setShowSaveAsDialog(false);
    const content = getCurrentContent();
    const result = await saveFile(path, content);
    
    if (result.success) {
      // After saving, clear pending action if any
      if (pendingAction) {
        if (pendingAction.type === "open" && pendingAction.path) {
          await openFile(pendingAction.path);
          setCurrentFocus("editor");
        } else if (pendingAction.type === "new") {
          newFile();
        } else if (pendingAction.type === "quit") {
          renderer.destroy();
        }
        setPendingAction(null);
      }
    }
  }, [getCurrentContent, saveFile, pendingAction, openFile, newFile, renderer]);

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

  const handleQuitConfirm = useCallback(() => {
    setShowQuitPrompt(false);
    if (currentFile?.isModified) {
      setPendingAction({ type: "quit" });
      setShowSavePrompt(true);
    } else {
      renderer.destroy();
    }
  }, [currentFile?.isModified, renderer]);

  const handleQuitCancel = useCallback(() => {
    setShowQuitPrompt(false);
  }, []);

  // Keyboard shortcuts
  useKeyboard(
    useCallback(
      (key) => {
        // Don't handle shortcuts if dialog is open (except QuitPrompt Y/N)
        if (showFileDialog || showSavePrompt || showSaveAsDialog) return;

        if (showQuitPrompt) {
          if (key.name === "y") handleQuitConfirm();
          else if (key.name === "n" || key.name === "escape") handleQuitCancel();
          return;
        }

        // Ctrl+O: Open file dialog
        if (key.ctrl && key.name === "o") {
          setShowFileDialog(true);
          return;
        }

        // Ctrl+S: Save file (or Save As if new file)
        if (key.ctrl && key.name === "s") {
          if (key.shift) {
            // Ctrl+Shift+S = Save As
            setShowSaveAsDialog(true);
          } else {
            handleSaveFile();
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

        // Ctrl+C: Ignore (do not quit; use Ctrl+Q instead)
        if (key.ctrl && key.name === "c") {
          return;
        }

        // Ctrl+Q: Quit (show confirmation first)
        if (key.ctrl && key.name === "q") {
          setShowQuitPrompt(true);
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
      [showFileDialog, showSavePrompt, showQuitPrompt, showSaveAsDialog, currentFile, handleSaveFile, newFile, renderer, refreshFileTree, handleQuitConfirm, handleQuitCancel]
    )
  );

  // Handle save prompt actions
  const handleSavePromptSave = useCallback(async () => {
    // If no path, show SaveAs dialog instead
    if (!currentFile?.path) {
      setShowSavePrompt(false);
      setShowSaveAsDialog(true);
      return;
    }
    
    const result = await handleSaveFile();
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
  }, [currentFile?.path, handleSaveFile, pendingAction, openFile, newFile, renderer]);

  const handleSavePromptDiscard = useCallback(() => {
    setShowSavePrompt(false);
    
    // Execute pending action without saving
    if (pendingAction?.type === "open" && pendingAction.path) {
      openFile(pendingAction.path).then(() => {
        setCurrentFocus("editor");
      });
    } else if (pendingAction?.type === "new") {
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
    <box flexDirection="column" width="100%" height="100%" backgroundColor="#0d0d14">
      {/* Error message */}
      {error && (
        <box backgroundColor="#cc6666" padding={1}>
          <text fg="#ffffff">{error}</text>
        </box>
      )}

      {/* Main content area */}
      <box flexDirection="row" flexGrow={1} height="100%" backgroundColor="#0d0d14" padding={1} gap={1}>
        {/* Editor */}
        <box width="70%" height="100%" flexDirection="column" backgroundColor="#1a1a2e" paddingX={1}>
          <Editor
            ref={editorRef}
            content={currentFile?.content || ""}
            onChange={updateContent}
            filePath={currentFile?.path || ""}
            isModified={currentFile?.isModified || false}
            focused={currentFocus === "editor"}
            onFocus={() => setCurrentFocus("editor")}
          />
        </box>

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

      <QuitPrompt
        isOpen={showQuitPrompt}
        onConfirm={handleQuitConfirm}
        onCancel={handleQuitCancel}
      />

      <SaveAsDialog
        isOpen={showSaveAsDialog}
        currentDir={currentDir}
        onClose={() => setShowSaveAsDialog(false)}
        onSave={handleSaveAs}
        defaultName="untitled.md"
      />
    </box>
  );
}