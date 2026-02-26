import { uiColors, uiLayout } from "../../theme"

type UnsavedChangesModalProps = {
  selectedOption: "save" | "dont_save"
  onChooseSave: () => void
  onChooseDontSave: () => void
  onCancel: () => void
}

export function UnsavedChangesModal({ selectedOption, onChooseSave, onChooseDontSave, onCancel }: UnsavedChangesModalProps) {
  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
      zIndex={uiLayout.modalZIndex}
    >
      <box
        width={uiLayout.modalWidth}
        border
        borderColor={uiColors.modalBorder}
        paddingLeft={uiLayout.panelOuterMarginX}
        paddingRight={uiLayout.panelOuterMarginX}
        paddingBottom={0}
        paddingTop={0}
        backgroundColor={uiColors.modalBackground}
        flexDirection="column"
      >
        <box flexDirection="row" alignItems="center">
          <text fg={uiColors.accent}>Unsaved changes</text>
          <box flexGrow={1} />
          <box paddingLeft={0} paddingRight={0} onMouseDown={onCancel}>
            <text fg={uiColors.textMuted}>esc</text>
          </box>
        </box>
        <box flexDirection="row" gap={uiLayout.rowGap} justifyContent="flex-end" marginTop={uiLayout.modalHeaderBodyGap}>
          <box
            width={uiLayout.modalActionWidth}
            backgroundColor={selectedOption === "save" ? uiColors.modalAccentBackground : uiColors.modalBackground}
            onMouseDown={onChooseSave}
            padding={0}
            alignItems="center"
            justifyContent="center"
          >
            <text fg={selectedOption === "save" ? uiColors.accent : uiColors.sidebarTitle}>Save</text>
          </box>
          <box
            width={uiLayout.modalActionWidth}
            backgroundColor={selectedOption === "dont_save" ? uiColors.modalAccentBackground : uiColors.modalBackground}
            onMouseDown={onChooseDontSave}
            padding={0}
            alignItems="center"
            justifyContent="center"
          >
            <text fg={selectedOption === "dont_save" ? uiColors.accent : uiColors.danger}>Don't Save</text>
          </box>
        </box>
      </box>
    </box>
  )
}
