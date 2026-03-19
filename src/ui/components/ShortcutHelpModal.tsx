import type { KeybindingMap } from "../../core/types"
import { formatLeaderKeybinding } from "../keybindings"
import { uiColors, uiLayout } from "../../theme"

type ShortcutHelpModalProps = {
  keybindings: KeybindingMap
  onClose: () => void
}

const shortcutRows: Array<{ label: string; command: keyof KeybindingMap }> = [
  { label: "Quit", command: "quit" },
  { label: "Save", command: "save" },
  { label: "Save As", command: "saveAs" },
  { label: "New File", command: "newFile" },
  { label: "Toggle Sidebar", command: "toggleSidebar" },
  { label: "Show Shortcut Help", command: "showShortcutHelp" },
]

export function ShortcutHelpModal({ keybindings, onClose }: ShortcutHelpModalProps) {
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
          <text fg={uiColors.accent}>Shortcut keys</text>
          <box flexGrow={1} />
          <box paddingLeft={0} paddingRight={0} onMouseDown={onClose}>
            <text fg={uiColors.textMuted}>esc</text>
          </box>
        </box>

        <box flexDirection="column" marginTop={uiLayout.modalHeaderBodyGap}>
          {shortcutRows.map((row) => (
            <box key={row.command} flexDirection="row">
              <box width="65%">
                <text fg={uiColors.textPrimary}>{row.label}</text>
              </box>
              <box width="35%" justifyContent="flex-end">
                <text fg={uiColors.sidebarTitle}>{formatLeaderKeybinding(keybindings[row.command])}</text>
              </box>
            </box>
          ))}
        </box>
      </box>
    </box>
  )
}
