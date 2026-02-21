import type { TextareaRenderable } from "@opentui/core"

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
    <box width={sidebarVisible ? "66%" : "78%"} flexDirection="column" gap={1} paddingX={2} paddingY={1} marginLeft={1} marginRight={1} backgroundColor="#111111">
      <box height={1} flexShrink={0}>
        <text fg="#9cdcfe">{title}</text>
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
          backgroundColor="#111111"
          focusedBackgroundColor="#111111"
          textColor="#f0f0f0"
        />
      </box>
    </box>
  )
}
