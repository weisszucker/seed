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
    <box width={sidebarVisible ? "66%" : "100%"} flexDirection="column" gap={1} paddingX={2} paddingY={1} marginLeft={1} marginRight={1} backgroundColor="#1b1f26">
      <box height={1} flexShrink={0}>
        <text fg="#acc8de">{title}</text>
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
          backgroundColor="#1b1f26"
          focusedBackgroundColor="#1b1f26"
          textColor="#d7dbe0"
        />
      </box>
    </box>
  )
}
