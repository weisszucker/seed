import { useState, useCallback, useMemo, useRef, useEffect } from "react";
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
import { useTheme } from "../theme-context.js";
import { keyMatchesBinding, type SeedSettings } from "../settings.js";

interface AppProps {
  initialDir: string;
  settings: SeedSettings;
  settingsWarning?: string | null;
}

export function App({ initialDir, settings, settingsWarning }: AppProps) {
  const renderer = useRenderer();
  const editorRef = useRef<EditorRef>(null);
  const { theme, reloadTheme } = useTheme();
  
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
  const [showFileTree, setShowFileTree] = useState(true);
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
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsWarning) return;
    setNotice(settingsWarning);
    const timer = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(timer);
  }, [settingsWarning]);

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
          if (keyMatchesBinding(key, settings.keybindings.quitConfirmYes)) {
            handleQuitConfirm();
          } else if (
            keyMatchesBinding(key, settings.keybindings.quitConfirmNo) ||
            keyMatchesBinding(key, settings.keybindings.cancel)
          ) {
            handleQuitCancel();
          }
          return;
        }

        // Open file dialog
        if (keyMatchesBinding(key, settings.keybindings.openFile)) {
          setShowFileDialog(true);
          return;
        }

        // Save file
        if (keyMatchesBinding(key, settings.keybindings.saveFile)) {
          handleSaveFile();
          return;
        }

        // Save As
        if (keyMatchesBinding(key, settings.keybindings.saveAs)) {
          setShowSaveAsDialog(true);
          return;
        }

        // New file
        if (keyMatchesBinding(key, settings.keybindings.newFile)) {
          const result = newFile();
          if (result.needsSave) {
            setPendingAction({ type: "new" });
            setShowSavePrompt(true);
          }
          return;
        }

        // Ctrl+C: Ignore (do not quit)
        if (key.ctrl && key.name === "c") {
          return;
        }

        // Quit (show confirmation first)
        if (keyMatchesBinding(key, settings.keybindings.quit)) {
          setShowQuitPrompt(true);
          return;
        }

        // Reload theme tokens
        if (keyMatchesBinding(key, settings.keybindings.reloadTheme)) {
          try {
            reloadTheme();
            setNotice("Theme reloaded");
            setTimeout(() => setNotice(null), 1200);
          } catch {
            setNotice("Theme reload failed");
            setTimeout(() => setNotice(null), 1200);
          }
          return;
        }

        // Refresh file tree
        if (keyMatchesBinding(key, settings.keybindings.refreshTree)) {
          refreshFileTree();
          return;
        }

        // Toggle focus (only when file tree is visible)
        if (keyMatchesBinding(key, settings.keybindings.toggleFocus)) {
          if (showFileTree) {
            setCurrentFocus((prev) => (prev === "sidebar" ? "editor" : "sidebar"));
          }
          return;
        }

        // Toggle file tree panel
        if (keyMatchesBinding(key, settings.keybindings.toggleFileTree)) {
          setShowFileTree((prev) => {
            if (prev) setCurrentFocus("editor");
            return !prev;
          });
          return;
        }

        // Cancel / escape behavior
        if (keyMatchesBinding(key, settings.keybindings.cancel)) {
          setCurrentFocus("editor");
          return;
        }
      },
      [
        showFileDialog,
        showSavePrompt,
        showQuitPrompt,
        showSaveAsDialog,
        showFileTree,
        currentFile,
        handleSaveFile,
        newFile,
        renderer,
        refreshFileTree,
        handleQuitConfirm,
        handleQuitCancel,
        reloadTheme,
        settings,
      ]
    )
  );

  // When file tree is hidden, keep focus on editor
  useEffect(() => {
    if (!showFileTree && currentFocus === "sidebar") {
      setCurrentFocus("editor");
    }
  }, [showFileTree, currentFocus]);

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
    <box flexDirection="column" width="100%" height="100%" backgroundColor={theme.colors.appBackground}>
      {/* Error message */}
      {error && (
        <box backgroundColor={theme.colors.danger} padding={1}>
          <text fg={theme.colors.white}>{error}</text>
        </box>
      )}

      {/* Main content area */}
      <box
        flexDirection="row"
        flexGrow={1}
        height="100%"
        backgroundColor={theme.colors.appBackground}
        padding={theme.spacing.sm}
        gap={showFileTree ? theme.spacing.sm : 0}
        justifyContent={showFileTree ? undefined : "center"}
      >
        {/* Editor */}
        <box
          width="70%"
          height="100%"
          flexDirection="column"
          backgroundColor={theme.colors.panelBackground}
          paddingX={theme.spacing.sm}
        >
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

        {/* Sidebar (optional) */}
        {showFileTree && (
          <box width="30%" height="100%" border backgroundColor={theme.colors.panelBackground}>
            <FileTree
              tree={fileTree}
              currentFilePath={currentFile?.path || null}
              onFileSelect={handleFileSelect}
              expandedDirs={expandedDirs}
              onToggleDir={handleToggleDir}
              focused={currentFocus === "sidebar"}
            />
          </box>
        )}
      </box>

      {/* Status bar */}
      <StatusBar
        filePath={currentFile?.path || null}
        isModified={currentFile?.isModified || false}
        cursorLine={cursorPos.line}
        cursorCol={cursorPos.col}
        currentFocus={currentFocus}
        notice={notice}
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
