type StatusBarProps = {
  path: string | null
  isDirty: boolean
}

function formatPath(path: string | null): string {
  return path ?? "[untitled]"
}

export function StatusBar({ path, isDirty }: StatusBarProps) {
  return (
    <box height={1} paddingLeft={1} paddingRight={1} justifyContent="center" marginTop={1}>
      <text fg="#d4d4d4">
        {formatPath(path)} | {isDirty ? "dirty" : "clean"}
      </text>
    </box>
  )
}
