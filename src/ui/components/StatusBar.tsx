type StatusBarProps = {
  path: string | null
  isDirty: boolean
}

function formatPath(path: string | null): string {
  return path ?? "[untitled]"
}

export function StatusBar({ path, isDirty }: StatusBarProps) {
  return (
    <box height={1} paddingLeft={2} paddingRight={2} justifyContent="flex-start">
      <text fg="#d4d4d4">
        {formatPath(path)} | {isDirty ? "dirty" : "clean"}
      </text>
    </box>
  )
}
