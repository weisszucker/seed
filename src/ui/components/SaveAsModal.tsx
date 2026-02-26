type SaveAsModalProps = {
  pathInput: string
  onPathChange: (path: string) => void
  onSubmit: () => void
  onCancel: () => void
}

export function SaveAsModal({ pathInput, onPathChange, onSubmit, onCancel }: SaveAsModalProps) {
  return (
    <box position="absolute" left={0} top={0} width="100%" height="100%" justifyContent="center" alignItems="center" zIndex={100}>
      <box
        width={56}
        border
        borderColor="#bb8f66"
        paddingLeft={1}
        paddingRight={1}
        paddingBottom={0}
        paddingTop={0}
        backgroundColor="#252932"
        flexDirection="column"
      >
        <box flexDirection="row" alignItems="center">
          <text fg="#e2bf88">Save As</text>
          <box flexGrow={1} />
          <box paddingLeft={0} paddingRight={0} onMouseDown={onCancel}>
            <text fg="#9ca2ab">esc</text>
          </box>
        </box>

        <input
          width="100%"
          value={pathInput}
          onChange={onPathChange}
          onSubmit={onSubmit}
          focused
          placeholder="Enter file path"
          backgroundColor="#353024"
          textColor="#d7dbe0"
          marginTop={2}
        />
      </box>
    </box>
  )
}
