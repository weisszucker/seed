import { uiColors, uiLayout } from "../../theme"

type SaveAsModalProps = {
  pathInput: string
  onPathChange: (path: string) => void
  onSubmit: () => void
  onCancel: () => void
}

export function SaveAsModal({ pathInput, onPathChange, onSubmit, onCancel }: SaveAsModalProps) {
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
          <text fg={uiColors.accent}>Save As</text>
          <box flexGrow={1} />
          <box paddingLeft={0} paddingRight={0} onMouseDown={onCancel}>
            <text fg={uiColors.textMuted}>esc</text>
          </box>
        </box>

        <input
          width="100%"
          value={pathInput}
          onChange={onPathChange}
          onSubmit={onSubmit}
          focused
          placeholder="Enter file path"
          backgroundColor={uiColors.modalAccentBackground}
          textColor={uiColors.textPrimary}
          marginTop={uiLayout.modalHeaderBodyGap}
        />
      </box>
    </box>
  )
}
