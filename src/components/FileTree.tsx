import type { ReactElement } from "react";
import { FileNode } from "../utils/fileTree.js";
import { useTheme } from "../theme-context.js";

interface FileTreeProps {
  tree: FileNode | null;
  currentFilePath: string | null;
  onFileSelect: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  focused: boolean;
}

export function FileTree({
  tree,
  currentFilePath,
  onFileSelect,
  expandedDirs,
  onToggleDir,
  focused,
}: FileTreeProps) {
  const { theme } = useTheme();
  if (!tree) {
    return (
      <box flexDirection="column" padding={1}>
        <text fg={theme.colors.textMuted}>Loading...</text>
      </box>
    );
  }

  const renderNode = (node: FileNode, depth: number = 0): React.ReactNode => {
    const isSelected = node.path === currentFilePath;
    const indent = "  ".repeat(depth);
    const isExpanded = expandedDirs.has(node.path);

    if (node.type === "directory") {
      return (
        <box key={node.path} flexDirection="column">
          <box
            flexDirection="row"
            backgroundColor={isSelected && focused ? theme.colors.surface : undefined}
            onMouseDown={() => onToggleDir(node.path)}
          >
            <text>
              {indent}
              <span fg={theme.colors.warning}>{isExpanded ? "▼" : "▶"}</span>
              <span> </span>
              <span> {node.name}</span>
            </text>
          </box>
          {isExpanded && node.children && (
            <box flexDirection="column">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </box>
          )}
        </box>
      );
    }

    // File
    const isMarkdown = node.name.endsWith(".md") || node.name.endsWith(".markdown");
    
    return (
      <box
        key={node.path}
        flexDirection="row"
        backgroundColor={isSelected && focused ? theme.colors.surface : undefined}
        onMouseDown={() => onFileSelect(node.path)}
      >
        <text>
          {indent}
          <span>  </span>
          <span> {node.name}</span>
        </text>
      </box>
    );
  };

  return (
    <scrollbox flexDirection="column" height="100%">
      <box flexDirection="column" padding={1}>
        <text>
          <strong fg={theme.colors.warning}>{tree.name}</strong>
        </text>
        <box height={1} />
        {tree.children?.map((child) => renderNode(child, 0))}
      </box>
    </scrollbox>
  );
}
