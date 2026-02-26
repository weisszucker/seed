import { basename } from "node:path"

import type { AppEvent, FileNode } from "../../core/types"
import { uiColors, uiLayout } from "../../theme"
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
    <box width={uiLayout.sidebarWidthPercent} flexDirection="column" padding={uiLayout.panelPaddingY} backgroundColor={uiColors.panelBackground}>
      <text fg={uiColors.sidebarTitle}>{rootTitle}</text>
      <scrollbox flexGrow={1} marginTop={uiLayout.rowGap}>
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
