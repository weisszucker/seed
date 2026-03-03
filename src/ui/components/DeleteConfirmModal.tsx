import { uiColors, uiLayout } from "../../theme"

type DeleteConfirmModalProps = {
  targetName: string
  targetType: "file" | "folder"
  selectedOption: "cancel" | "delete"
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteConfirmModal({
  targetName,
  targetType,
  selectedOption,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
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
          <text fg={uiColors.danger}>Delete {targetType}</text>
          <box flexGrow={1} />
          <box paddingLeft={0} paddingRight={0} onMouseDown={onCancel}>
            <text fg={uiColors.textMuted}>esc</text>
          </box>
        </box>
        <box marginTop={uiLayout.modalHeaderBodyGap}>
          <text fg={uiColors.textSubtle}>{targetName}</text>
        </box>
        <box flexDirection="row" gap={uiLayout.rowGap} justifyContent="flex-end" marginTop={uiLayout.modalHeaderBodyGap}>
          <box
            width={uiLayout.modalActionWidth}
            backgroundColor={selectedOption === "cancel" ? uiColors.modalAccentBackground : uiColors.modalBackground}
            onMouseDown={onCancel}
            padding={0}
            alignItems="center"
            justifyContent="center"
          >
            <text fg={selectedOption === "cancel" ? uiColors.accent : uiColors.sidebarTitle}>Cancel</text>
          </box>
          <box
            width={uiLayout.modalActionWidth}
            backgroundColor={selectedOption === "delete" ? uiColors.modalAccentBackground : uiColors.modalBackground}
            onMouseDown={onConfirm}
            padding={0}
            alignItems="center"
            justifyContent="center"
          >
            <text fg={selectedOption === "delete" ? uiColors.accent : uiColors.danger}>Delete</text>
          </box>
        </box>
      </box>
    </box>
  )
}
