import { isAbsolute, relative } from "node:path"

import { uiColors, uiLayout } from "../../theme"

type StatusBarProps = {
  cwd: string
  path: string | null
  isDirty: boolean
  statusMessage: string
  leaderHint: string | null
}

function formatPath(path: string | null): string {
  return path ?? "[untitled]"
}

export function StatusBar({ cwd, path, isDirty, statusMessage, leaderHint }: StatusBarProps) {
  const relativePath = path && isAbsolute(path) ? relative(cwd, path) : path
  const displayedPath =
    relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath) ? relativePath : path

  return (
    <box height={1} paddingLeft={uiLayout.panelPaddingX} paddingRight={uiLayout.panelPaddingX} justifyContent="flex-start">
      <text fg={uiColors.textSubtle}>
        {formatPath(displayedPath)} | {isDirty ? "dirty" : "clean"} | {leaderHint ?? statusMessage}
      </text>
    </box>
  )
}
