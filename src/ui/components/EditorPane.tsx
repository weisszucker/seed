import type { TextareaRenderable } from "@opentui/core"
import { uiColors, uiLayout } from "../../theme"

type EditorPaneProps = {
  sidebarVisible: boolean
  title: string
  documentPath: string | null
  text: string
  textareaRef: { current: TextareaRenderable | null }
  locked: boolean
  onTextChanged: (text: string) => void
}

export function EditorPane({ sidebarVisible, title, documentPath, text, textareaRef, locked, onTextChanged }: EditorPaneProps) {
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
    >
      <box height={1} flexShrink={0}>
        <text fg={uiColors.editorTitle}>{title}</text>
      </box>
      <box flexGrow={1} minHeight={1}>
        <textarea
          key={documentPath ?? "__untitled__"}
          ref={textareaRef}
          initialValue={text}
          onContentChange={() => {
            const nextText = textareaRef.current?.plainText ?? ""
            onTextChanged(nextText)
          }}
          placeholder="Start typing markdown..."
          flexGrow={1}
          focused={!locked}
          backgroundColor={uiColors.panelBackground}
          focusedBackgroundColor={uiColors.panelBackground}
          textColor={uiColors.textPrimary}
        />
      </box>
    </box>
  )
}
