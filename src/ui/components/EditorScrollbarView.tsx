import { createElement } from "react"

import "./EditorScrollbarRenderable"

type EditorScrollbarViewProps = {
  targetRef: { current: unknown }
}

export function EditorScrollbarView({ targetRef }: EditorScrollbarViewProps) {
  return createElement("editor-scrollbar" as never, {
    targetRef,
    width: 1,
    height: "100%",
    flexShrink: 0,
  })
}
