import type { TextareaRenderable } from "@opentui/core"

import type { EditorPageDirection } from "./keybindings"

export function pageEditorTextarea(textarea: TextareaRenderable, direction: EditorPageDirection): void {
  const pageSize = Math.max(1, textarea.height - 1)

  for (let index = 0; index < pageSize; index += 1) {
    if (direction === "up") {
      textarea.moveCursorUp()
    } else {
      textarea.moveCursorDown()
    }
  }
}
