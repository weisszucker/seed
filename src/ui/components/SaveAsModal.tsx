type SaveAsModalProps = {
  pathInput: string
  onPathChange: (path: string) => void
  onSubmit: () => void
}

export function SaveAsModal({ pathInput, onPathChange, onSubmit }: SaveAsModalProps) {
  return (
    <box position="absolute" left={0} top={0} width="100%" height="100%" justifyContent="center" alignItems="center" zIndex={100}>
      <box width={56} border borderColor="#cd853f" padding={1} backgroundColor="#1f1f1f" flexDirection="column">
        <box flexDirection="row" alignItems="center">
          <text fg="#ffd580">Save As</text>
          <box flexGrow={1} />
          <box border borderColor="#666666" paddingLeft={1} paddingRight={1}>
            <text fg="#aaaaaa">ESC</text>
          </box>
        </box>
        <input
          width="100%"
          value={pathInput}
          onChange={onPathChange}
          onSubmit={onSubmit}
          focused
          placeholder="Enter file path"
          backgroundColor="#111111"
          textColor="#f0f0f0"
        />
      </box>
    </box>
  )
}
