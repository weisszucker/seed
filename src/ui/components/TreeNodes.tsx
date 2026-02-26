import type { AppEvent, FileNode } from "../../core/types"
import { uiColors } from "../../theme"

type TreeProps = {
  nodes: FileNode[]
  expandedDirs: Record<string, boolean>
  selectedPath: string | null
  depth: number
  disabled: boolean
  dispatch: (event: AppEvent) => void
}

export function TreeNodes({ nodes, expandedDirs, selectedPath, depth, disabled, dispatch }: TreeProps) {
  return (
    <>
      {nodes.map((node) => {
        const isExpanded = expandedDirs[node.path] ?? false
        const isSelected = !node.isDirectory && selectedPath === node.path
        return (
          <box key={node.path} flexDirection="column">
            <box
              onMouseDown={() => {
                if (disabled) {
                  return
                }
                if (node.isDirectory) {
                  dispatch({ type: "TOGGLE_DIRECTORY", path: node.path })
                  return
                }
                dispatch({ type: "REQUEST_OPEN_FILE", path: node.path })
              }}
            >
              <text fg={disabled ? uiColors.treeDisabled : isSelected ? uiColors.accent : uiColors.treeDefault}>
                {" ".repeat(depth * 2)}
                {node.isDirectory ? (isExpanded ? "[-] " : "[+] ") : "    "}
                {node.name}
              </text>
            </box>
            {node.isDirectory && isExpanded ? (
              <TreeNodes
                nodes={node.children}
                expandedDirs={expandedDirs}
                selectedPath={selectedPath}
                depth={depth + 1}
                disabled={disabled}
                dispatch={dispatch}
              />
            ) : null}
          </box>
        )
      })}
    </>
  )
}
