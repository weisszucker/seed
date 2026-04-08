import { describe, expect, test } from "bun:test"
import { act } from "react"
import { createElement } from "react"
import { testRender } from "@opentui/react/test-utils"
import type { TextareaRenderable } from "@opentui/core"

import { createEditorSyntaxStyle } from "../src/ui/editorHighlighting"
import { uiLayout } from "../src/theme"
import { EditorPane } from "../src/ui/components/EditorPane"
import { getEditorScrollbarMetrics } from "../src/ui/components/editorScrollbar"

describe("editor scrollbar", () => {
  test("hides the scrollbar when the editor content does not overflow", () => {
    expect(
      getEditorScrollbarMetrics({
        scrollY: 0,
        scrollHeight: 12,
        viewportHeight: 12,
      }),
    ).toBeNull()
  })

  test("computes a proportional thumb for overflowing content", () => {
    expect(
      getEditorScrollbarMetrics({
        scrollY: 5,
        scrollHeight: 30,
        viewportHeight: 10,
      }),
    ).toEqual({
      thumbTop: 2,
      thumbHeight: 4,
    })
  })

  test("clamps the thumb at the bottom of the track", () => {
    expect(
      getEditorScrollbarMetrics({
        scrollY: 999,
        scrollHeight: 30,
        viewportHeight: 10,
      }),
    ).toEqual({
      thumbTop: 6,
      thumbHeight: 4,
    })
  })

  test("renders a scrollbar thumb after the editor scrolls through overflowing content", async () => {
    const textareaRef: { current: TextareaRenderable | null } = { current: null }
    const syntaxStyle = createEditorSyntaxStyle()
    const treeSitterClient = {
      async highlightOnce() {
        return { highlights: [] }
      },
    }
    const text = Array.from({ length: 60 }, (_, index) => `line ${String(index + 1).padStart(2, "0")}`).join("\n")

    const setup = await testRender(
      createElement(
        "box",
        { width: 80, height: 20 },
        createElement(EditorPane, {
          sidebarVisible: false,
          title: "note.md",
          documentPath: "/tmp/note.md",
          text,
          textareaRef,
          treeSitterClient,
          syntaxStyle,
          focused: true,
          canRequestFocus: true,
          onRequestFocus: () => {},
          onTextChanged: () => {},
        }),
      ),
      { width: 80, height: 20 },
    )

    try {
      await setup.renderOnce()
      expect(setup.captureCharFrame()).not.toContain("█")

      await act(async () => {
        for (let index = 0; index < 8; index += 1) {
          await setup.mockMouse.scroll(10, 8, "down")
        }
      })

      await setup.renderOnce()

      expect(textareaRef.current?.scrollY).toBeGreaterThan(0)
      expect(setup.captureCharFrame()).toContain("█")

      await Bun.sleep(uiLayout.editorScrollbarHideDelayMs + 100)
      await setup.renderOnce()

      expect(setup.captureCharFrame()).not.toContain("█")
    } finally {
      syntaxStyle.destroy()
      await act(async () => {
        setup.renderer.destroy()
      })
    }
  })
})
