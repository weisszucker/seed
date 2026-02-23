import { basename } from "node:path"

import type { AppEvent, FileNode } from "../../core/types"
import { TreeNodes } from "./TreeNodes"

type SidebarPaneProps = {
  visible: boolean
  cwd: string
  fileTree: FileNode[]
  expandedDirs: Record<string, boolean>
  selectedPath: string | null
  locked: boolean
  dispatch: (event: AppEvent) => void
}

export function SidebarPane({ visible, cwd, fileTree, expandedDirs, selectedPath, locked, dispatch }: SidebarPaneProps) {
  if (!visible) {
    return null
  }

  const rootTitle = basename(cwd) || cwd || "."
  return (
    <box width="34%" flexDirection="column" padding={1} backgroundColor="#111111">
      <text fg="#8fbc8f">{rootTitle}</text>
      <scrollbox flexGrow={1} marginTop={1}>
        <TreeNodes
          nodes={fileTree}
          expandedDirs={expandedDirs}
          selectedPath={selectedPath}
          depth={0}
          disabled={locked}
          dispatch={dispatch}
        />
      </scrollbox>
    </box>
  )
}
