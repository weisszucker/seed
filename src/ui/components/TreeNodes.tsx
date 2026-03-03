import type { AppEvent, FileNode } from "../../core/types"
import { uiColors } from "../../theme"

type TreeProps = {
  nodes: FileNode[]
  expandedDirs: Record<string, boolean>
  cursorPath: string | null
  selectedPath: string | null
  focused: boolean
  depth: number
  disabled: boolean
  dispatch: (event: AppEvent) => void
}

export function TreeNodes({ nodes, expandedDirs, cursorPath, selectedPath, focused, depth, disabled, dispatch }: TreeProps) {
  return (
    <>
      {nodes.map((node) => {
        const isExpanded = expandedDirs[node.path] ?? false
        const isCursor = cursorPath === node.path
        const isOpenFile = !node.isDirectory && selectedPath === node.path
        const showCursor = focused && isCursor
        return (
          <box key={node.path} flexDirection="column">
            <box
              backgroundColor={showCursor ? uiColors.treeCursorRow : undefined}
              onMouseDown={() => {
                if (disabled) {
                  return
                }
                dispatch({ type: "SIDEBAR_SET_CURSOR", path: node.path })
                if (node.isDirectory) {
                  dispatch({ type: "TOGGLE_DIRECTORY", path: node.path })
                  return
                }
                dispatch({ type: "REQUEST_OPEN_FILE", path: node.path })
              }}
            >
              <text fg={disabled ? uiColors.treeDisabled : showCursor ? uiColors.accent : isOpenFile ? uiColors.treeSelectedFile : uiColors.treeDefault}>
                {" ".repeat(depth * 2)}
                {node.isDirectory ? (isExpanded ? "[-] " : "[+] ") : "    "}
                {node.name}
              </text>
            </box>
            {node.isDirectory && isExpanded ? (
              <TreeNodes
                nodes={node.children}
                expandedDirs={expandedDirs}
                cursorPath={cursorPath}
                selectedPath={selectedPath}
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
