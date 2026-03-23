import { useEffect, useRef } from "react"
import type { SyntaxStyle, TextareaRenderable } from "@opentui/core"

import { uiColors, uiLayout } from "../../theme"
import { EDITOR_TEXTAREA_KEYBINDINGS } from "../keybindings"
import {
  getEditorHighlights,
  syncEditorHighlights,
  type AppliedHighlightState,
  type SyntaxHighlightClient,
} from "../editorHighlighting"

type EditorPaneProps = {
  sidebarVisible: boolean
  title: string
  documentPath: string | null
  text: string
  textareaRef: { current: TextareaRenderable | null }
  treeSitterClient: SyntaxHighlightClient
  syntaxStyle: SyntaxStyle
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
  treeSitterClient,
  syntaxStyle,
  focused,
  canRequestFocus,
  onRequestFocus,
  onTextChanged,
}: EditorPaneProps) {
  const highlightRequestVersionRef = useRef(0)
  const appliedHighlightStateRef = useRef<AppliedHighlightState>({
    textarea: null,
    signature: "",
  })

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    const requestVersion = highlightRequestVersionRef.current + 1
    highlightRequestVersionRef.current = requestVersion

    let active = true

    void (async () => {
      let highlights

      try {
        highlights = await getEditorHighlights({
          text,
          path: documentPath,
          syntaxStyle,
          treeSitterClient,
        })
      } catch {
        return
      }

      if (!active || highlightRequestVersionRef.current !== requestVersion || textareaRef.current !== textarea) {
        return
      }

      appliedHighlightStateRef.current = syncEditorHighlights(
        textarea,
        highlights,
        appliedHighlightStateRef.current,
      )
    })()

    return () => {
      active = false
    }
  }, [documentPath, syntaxStyle, text, textareaRef, treeSitterClient])

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
          syntaxStyle={syntaxStyle}
          backgroundColor={uiColors.panelBackground}
          focusedBackgroundColor={uiColors.panelBackground}
          textColor={uiColors.textPrimary}
        />
      </box>
    </box>
  )
}
