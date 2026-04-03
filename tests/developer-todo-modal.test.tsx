import { describe, expect, test } from "bun:test"

import { uiColors } from "../src/theme"
import { DeveloperTodoModal } from "../src/ui/components/DeveloperTodoModal"

type ElementLike = {
  type?: unknown
  props?: {
    children?: unknown
    fg?: string
  }
}

function findTextElement(node: unknown, content: string): ElementLike | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findTextElement(child, content)
      if (match) {
        return match
      }
    }
    return null
  }

  if (!node || typeof node !== "object") {
    return null
  }

  const element = node as ElementLike
  if (element.type === "text" && element.props?.children === content) {
    return element
  }

  const children = element.props?.children
  if (Array.isArray(children)) {
    for (const child of children) {
      const match = findTextElement(child, content)
      if (match) {
        return match
      }
    }
    return null
  }

  return findTextElement(children, content)
}

describe("DeveloperTodoModal", () => {
  test("only highlights the selected entry when the list is focused", () => {
    const inputFocusedTree = DeveloperTodoModal({
      items: [
        { text: "Ship feature", done: false },
        { text: "Fix bug", done: true },
      ],
      draftInput: "",
      selectedIndex: 1,
      focusedSection: "input",
      loading: false,
      inputRef: { current: null },
      onDraftChange: () => {},
      onSubmit: () => {},
      onCancel: () => {},
    })

    const listFocusedTree = DeveloperTodoModal({
      items: [
        { text: "Ship feature", done: false },
        { text: "Fix bug", done: true },
      ],
      draftInput: "",
      selectedIndex: 1,
      focusedSection: "list",
      loading: false,
      inputRef: { current: null },
      onDraftChange: () => {},
      onSubmit: () => {},
      onCancel: () => {},
    })

    expect(findTextElement(inputFocusedTree, "Fix bug")?.props?.fg).toBe(uiColors.textPrimary)
    expect(findTextElement(listFocusedTree, "Fix bug")?.props?.fg).toBe(uiColors.accent)
  })
})
