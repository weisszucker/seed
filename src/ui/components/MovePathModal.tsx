import type { InputRenderable } from "@opentui/core"

import { uiColors, uiLayout } from "../../theme"

type MovePathModalProps = {
  sourcePathInput: string
  destinationPathInput: string
  focusedField: "source" | "destination"
  sourceInputRef: { current: InputRenderable | null }
  destinationInputRef: { current: InputRenderable | null }
  onSourcePathChange: (path: string) => void
  onDestinationPathChange: (path: string) => void
  onFocusChange: (field: "source" | "destination") => void
  onSubmit: () => void
  onCancel: () => void
}

export function MovePathModal({
  sourcePathInput,
  destinationPathInput,
  focusedField,
  sourceInputRef,
  destinationInputRef,
  onSourcePathChange,
  onDestinationPathChange,
  onFocusChange,
  onSubmit,
  onCancel,
}: MovePathModalProps) {
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
          <text fg={uiColors.accent}>Move</text>
          <box flexGrow={1} />
          <box paddingLeft={0} paddingRight={0} onMouseDown={onCancel}>
            <text fg={uiColors.textMuted}>esc</text>
          </box>
        </box>

        <box flexDirection="column" marginTop={uiLayout.modalHeaderBodyGap} gap={uiLayout.rowGap}>
          <input
            ref={sourceInputRef}
            width="100%"
            value={sourcePathInput}
            onChange={onSourcePathChange}
            onSubmit={() => onFocusChange("destination")}
            focused={focusedField === "source"}
            placeholder="Source path from root"
            backgroundColor={focusedField === "source" ? uiColors.modalAccentBackground : uiColors.modalBackground}
            textColor={uiColors.textPrimary}
          />
          <input
            ref={destinationInputRef}
            width="100%"
            value={destinationPathInput}
            onChange={onDestinationPathChange}
            onSubmit={onSubmit}
            focused={focusedField === "destination"}
            placeholder="Destination path from root"
            backgroundColor={focusedField === "destination" ? uiColors.modalAccentBackground : uiColors.modalBackground}
            textColor={uiColors.textPrimary}
          />
        </box>
      </box>
    </box>
  )
}
