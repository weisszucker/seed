type UnsavedChangesModalProps = {
  selectedOption: "save" | "dont_save"
  onChooseSave: () => void
  onChooseDontSave: () => void
}

export function UnsavedChangesModal({ selectedOption, onChooseSave, onChooseDontSave }: UnsavedChangesModalProps) {
  return (
    <box position="absolute" left={0} top={0} width="100%" height="100%" justifyContent="center" alignItems="center" zIndex={100}>
      <box width={56} border borderColor="#cd853f" padding={1} backgroundColor="#1f1f1f" flexDirection="column">
        <box flexDirection="row" alignItems="center">
          <text fg="#ffd580">Unsaved changes</text>
          <box flexGrow={1} />
          <box border borderColor="#666666" paddingLeft={1} paddingRight={1}>
            <text fg="#aaaaaa">ESC</text>
          </box>
        </box>
        <box flexDirection="row" gap={1}>
          <box
            width={24}
            border
            borderColor={selectedOption === "save" ? "#ffd580" : "#8fbc8f"}
            backgroundColor={selectedOption === "save" ? "#2f2a1a" : "#1f1f1f"}
            onMouseDown={onChooseSave}
            padding={1}
            alignItems="center"
            justifyContent="center"
          >
            <text fg={selectedOption === "save" ? "#ffd580" : "#8fbc8f"}>{selectedOption === "save" ? "▶ Save" : "Save"}</text>
          </box>
          <box
            width={24}
            border
            borderColor={selectedOption === "dont_save" ? "#ffd580" : "#cd5c5c"}
            backgroundColor={selectedOption === "dont_save" ? "#2f2a1a" : "#1f1f1f"}
            onMouseDown={onChooseDontSave}
            padding={1}
            alignItems="center"
            justifyContent="center"
          >
            <text fg={selectedOption === "dont_save" ? "#ffd580" : "#cd5c5c"}>
              {selectedOption === "dont_save" ? "▶ Don't Save" : "Don't Save"}
            </text>
          </box>
        </box>
      </box>
    </box>
  )
}
