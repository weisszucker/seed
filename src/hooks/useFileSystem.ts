import { useState, useCallback, useEffect } from "react";
import { buildFileTree, readFile, writeFile, fileExists, FileNode } from "../utils/fileTree.js";

export interface FileState {
  path: string;
  content: string;
  originalContent: string;
  isModified: boolean;
  isNew: boolean;
}

export function useFileSystem(initialDir: string) {
  const [currentDir, setCurrentDir] = useState(initialDir);
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [currentFile, setCurrentFile] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load file tree
  const loadFileTree = useCallback(async () => {
    try {
      const tree = await buildFileTree(currentDir);
      setFileTree(tree);
      setError(null);
    } catch (err) {
      setError(`Failed to load directory: ${err}`);
    }
  }, [currentDir]);

  // Initial load
  useEffect(() => {
    loadFileTree();
  }, [loadFileTree]);

  // Open a file
  const openFile = useCallback(async (filePath: string) => {
    try {
      // Check if current file needs saving
      if (currentFile?.isModified) {
        return { needsSave: true, path: filePath };
      }

      const content = await readFile(filePath);
      setCurrentFile({
        path: filePath,
        content,
        originalContent: content,
        isModified: false,
        isNew: false,
      });
      setError(null);
      return { needsSave: false };
    } catch (err) {
      setError(`Failed to open file: ${err}`);
      return { needsSave: false, error: err };
    }
  }, [currentFile]);

  // Create a new file
  const newFile = useCallback(() => {
    if (currentFile?.isModified) {
      return { needsSave: true, action: "new" };
    }

    setCurrentFile({
      path: "",
      content: "",
      originalContent: "",
      isModified: false,
      isNew: true,
    });
    return { needsSave: false };
  }, [currentFile]);

  // Update file content
  const updateContent = useCallback((newContent: string) => {
    setCurrentFile((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        content: newContent,
        isModified: newContent !== prev.originalContent,
      };
    });
  }, []);

  // Save current file
  const saveFile = useCallback(async (filePath?: string, contentOverride?: string) => {
    if (!currentFile) return { success: false, error: "No file open" };

    const pathToSave = filePath || currentFile.path;
    if (!pathToSave) {
      return { success: false, error: "No file path specified" };
    }

    // Use contentOverride if provided, otherwise use currentFile.content
    const contentToSave = contentOverride !== undefined ? contentOverride : currentFile.content;

    try {
      await writeFile(pathToSave, contentToSave);
      setCurrentFile((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          path: pathToSave,
          content: contentToSave,
          originalContent: contentToSave,
          isModified: false,
          isNew: false,
        };
      });
      // Refresh file tree
      await loadFileTree();
      setError(null);
      return { success: true };
    } catch (err) {
      setError(`Failed to save file: ${err}`);
      return { success: false, error: err };
    }
  }, [currentFile, loadFileTree]);

  // Check if file exists
  const checkFileExists = useCallback(async (filePath: string) => {
    return fileExists(filePath);
  }, []);

  // Change directory
  const changeDirectory = useCallback(async (newDir: string) => {
    setCurrentDir(newDir);
  }, []);

  return {
    currentDir,
    fileTree,
    currentFile,
    error,
    openFile,
    newFile,
    updateContent,
    saveFile,
    checkFileExists,
    changeDirectory,
    refreshFileTree: loadFileTree,
  };
}