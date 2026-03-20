import type { AppEvent, FileNode } from "../../core/types"
import { uiColors } from "../../theme"

type TreeProps = {
  nodes: FileNode[]
  expandedDirs: Record<string, boolean>
  selectedPath: string | null
  cursorPath: string | null
  focused: boolean
  depth: number
  disabled: boolean
  dispatch: (event: AppEvent) => void
}

export function TreeNodes({ nodes, expandedDirs, selectedPath, cursorPath, focused, depth, disabled, dispatch }: TreeProps) {
  return (
    <>
      {nodes.map((node) => {
        const isExpanded = expandedDirs[node.path] ?? false
        const activePath = cursorPath ?? selectedPath
        const isSelected = activePath === node.path
        return (
          <box key={node.path} flexDirection="column">
            <box
              backgroundColor={focused && isSelected ? uiColors.treeSelectedBackground : undefined}
              onMouseDown={() => {
                if (disabled) {
                  return
                }
                dispatch({ type: "FOCUS_SIDEBAR" })
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
                cursorPath={cursorPath}
                focused={focused}
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
