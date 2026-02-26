import { uiColors, uiLayout } from "../../theme"

type StatusBarProps = {
  path: string | null
  isDirty: boolean
}

function formatPath(path: string | null): string {
  return path ?? "[untitled]"
}

export function StatusBar({ path, isDirty }: StatusBarProps) {
  return (
    <box height={1} paddingLeft={uiLayout.panelPaddingX} paddingRight={uiLayout.panelPaddingX} justifyContent="flex-start">
      <text fg={uiColors.textSubtle}>
        {formatPath(path)} | {isDirty ? "dirty" : "clean"}
      </text>
    </box>
  )
}
