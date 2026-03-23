import type { TextareaRenderable } from "@opentui/core"
import { uiColors, uiLayout } from "../../theme"
import { EDITOR_TEXTAREA_KEYBINDINGS } from "../keybindings"

type EditorPaneProps = {
  sidebarVisible: boolean
  title: string
  documentPath: string | null
  text: string
  textareaRef: { current: TextareaRenderable | null }
  focused: boolean
  canRequestFocus: boolean
  onRequestFocus: () => void
  onTextChanged: (text: string) => void
}

export function EditorPane({
  sidebarVisible,
  title,
  documentPath,
  text,
  textareaRef,
  focused,
  canRequestFocus,
  onRequestFocus,
  onTextChanged,
}: EditorPaneProps) {
  return (
    <box
      width={sidebarVisible ? uiLayout.editorWidthPercent : "100%"}
      flexDirection="column"
      gap={uiLayout.rowGap}
      paddingX={uiLayout.panelPaddingX}
      paddingY={uiLayout.panelPaddingY}
      marginLeft={uiLayout.panelOuterMarginX}
      marginRight={uiLayout.panelOuterMarginX}
      backgroundColor={uiColors.panelBackground}
      onMouseDown={() => {
        if (!canRequestFocus) {
          return
        }
        onRequestFocus()
      }}
    >
      <box height={1} flexShrink={0}>
        <text fg={uiColors.editorTitle}>{title}</text>
      </box>
      <box flexGrow={1} minHeight={1}>
        <textarea
          key={documentPath ?? "__untitled__"}
          ref={textareaRef}
          initialValue={text}
          keyBindings={EDITOR_TEXTAREA_KEYBINDINGS}
          onContentChange={() => {
            const nextText = textareaRef.current?.plainText ?? ""
            onTextChanged(nextText)
          }}
          placeholder="Start typing markdown..."
          flexGrow={1}
          focused={focused}
          backgroundColor={uiColors.panelBackground}
          focusedBackgroundColor={uiColors.panelBackground}
          textColor={uiColors.textPrimary}
        />
      </box>
    </box>
  )
}
