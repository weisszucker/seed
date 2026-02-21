type UnsavedChangesModalProps = {
  selectedOption: "save" | "dont_save"
  onChooseSave: () => void
  onChooseDontSave: () => void
}

export function UnsavedChangesModal({ selectedOption, onChooseSave, onChooseDontSave }: UnsavedChangesModalProps) {
  return (
    <box position="absolute" left={0} top={0} width="100%" height="100%" justifyContent="center" alignItems="center" zIndex={100}>
      <box
        width={56}
        border
        borderColor="#cd853f"
        paddingLeft={1}
        paddingRight={1}
        paddingBottom={0}
        paddingTop={0}
        backgroundColor="#1f1f1f"
        flexDirection="column"
      >
        <box flexDirection="row" alignItems="center">
          <text fg="#ffd580">Unsaved changes</text>
          <box flexGrow={1} />
          <box paddingLeft={0} paddingRight={0} onMouseDown={onChooseDontSave}>
            <text fg="#aaaaaa">esc</text>
          </box>
        </box>
        <box flexDirection="row" gap={1} justifyContent="flex-end" marginTop={2}>
          <box
            width={12}
            backgroundColor={selectedOption === "save" ? "#2f2a1a" : "#1f1f1f"}
            onMouseDown={onChooseSave}
            padding={0}
            alignItems="center"
            justifyContent="center"
          >
            <text fg={selectedOption === "save" ? "#ffd580" : "#8fbc8f"}>Save</text>
          </box>
          <box
            width={12}
            backgroundColor={selectedOption === "dont_save" ? "#2f2a1a" : "#1f1f1f"}
            onMouseDown={onChooseDontSave}
            padding={0}
            alignItems="center"
            justifyContent="center"
          >
            <text fg={selectedOption === "dont_save" ? "#ffd580" : "#cd5c5c"}>Don't Save</text>
          </box>
        </box>
      </box>
    </box>
  )
}
