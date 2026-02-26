type UnsavedChangesModalProps = {
  selectedOption: "save" | "dont_save"
  onChooseSave: () => void
  onChooseDontSave: () => void
  onCancel: () => void
}

export function UnsavedChangesModal({ selectedOption, onChooseSave, onChooseDontSave, onCancel }: UnsavedChangesModalProps) {
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
          <text fg="#e2bf88">Unsaved changes</text>
          <box flexGrow={1} />
          <box paddingLeft={0} paddingRight={0} onMouseDown={onCancel}>
            <text fg="#9ca2ab">esc</text>
          </box>
        </box>
        <box flexDirection="row" gap={1} justifyContent="flex-end" marginTop={2}>
          <box
            width={12}
            backgroundColor={selectedOption === "save" ? "#353024" : "#252932"}
            onMouseDown={onChooseSave}
            padding={0}
            alignItems="center"
            justifyContent="center"
          >
            <text fg={selectedOption === "save" ? "#e2bf88" : "#9dbb9d"}>Save</text>
          </box>
          <box
            width={12}
            backgroundColor={selectedOption === "dont_save" ? "#353024" : "#252932"}
            onMouseDown={onChooseDontSave}
            padding={0}
            alignItems="center"
            justifyContent="center"
          >
            <text fg={selectedOption === "dont_save" ? "#e2bf88" : "#cc8383"}>Don't Save</text>
          </box>
        </box>
      </box>
    </box>
  )
}
