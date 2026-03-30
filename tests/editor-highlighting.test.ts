import { afterEach, describe, expect, test } from "bun:test"
import type { Highlight, SimpleHighlight } from "@opentui/core"

import {
  applyEditorHighlights,
  createEditorHighlightClient,
  createEditorSyntaxStyle,
  getEditorHighlights,
  mapTreeSitterGroupToStyleName,
  mapTreeSitterHighlights,
  resolveEditorFiletype,
  syncEditorHighlights,
  type SyntaxHighlightClient,
} from "../src/ui/editorHighlighting"

class FakeHighlightClient implements SyntaxHighlightClient {
  calls: Array<{ content: string; filetype: string }> = []

  constructor(
    private readonly result: {
      highlights?: SimpleHighlight[]
      warning?: string
      error?: string
    },
  ) {}

  async highlightOnce(content: string, filetype: string) {
    this.calls.push({ content, filetype })
    return this.result
  }
}

class FakeTextarea {
  clearCalls = 0
  appliedHighlights: Array<{ lineIdx: number; highlight: Highlight }> = []
  plainText: string

  constructor(text = "") {
    this.plainText = text
  }

  clearAllHighlights(): void {
    this.clearCalls += 1
    this.appliedHighlights = []
  }

  addHighlight(lineIdx: number, highlight: Highlight): void {
    this.appliedHighlights.push({ lineIdx, highlight })
  }

  destroy(): void {}
}

let syntaxStyle = createEditorSyntaxStyle()

afterEach(() => {
  syntaxStyle.destroy()
  syntaxStyle = createEditorSyntaxStyle()
})

describe("editor highlighting", () => {
  test("resolves file types for markdown, code, and plain text", () => {
    expect(resolveEditorFiletype(null)).toBe("markdown")
    expect(resolveEditorFiletype("/tmp/note.md")).toBe("markdown")
    expect(resolveEditorFiletype("/tmp/app.ts")).toBe("typescript")
    expect(resolveEditorFiletype("/tmp/plain.txt")).toBeNull()
  })

  test("maps tree-sitter groups into style names", () => {
    expect(mapTreeSitterGroupToStyleName("markup.heading.2")).toBe("heading")
    expect(mapTreeSitterGroupToStyleName("markup.raw.block")).toBe("rawBlock")
    expect(mapTreeSitterGroupToStyleName("keyword.directive")).toBe("keyword")
    expect(mapTreeSitterGroupToStyleName("type.builtin")).toBe("type")
    expect(mapTreeSitterGroupToStyleName("unknown.scope")).toBeNull()
  })

  test("uses different styles for inline code and bold markdown", () => {
    expect(syntaxStyle.getStyle("raw")).toMatchObject({
      fg: expect.anything(),
      bg: expect.anything(),
    })
    expect(syntaxStyle.getStyle("strong")).toMatchObject({
      fg: expect.anything(),
      bold: true,
    })
    expect(syntaxStyle.getStyle("strong")?.bg).toBeUndefined()
  })

  test("filters conceal and spell ranges while preserving visible markdown highlights", () => {
    const strongStyleId = syntaxStyle.getStyleId("strong")!
    const linkUrlStyleId = syntaxStyle.getStyleId("linkUrl")!

    const highlights = mapTreeSitterHighlights(
      [
        [0, 8, "markup.strong"],
        [0, 1, "conceal", { conceal: "" }],
        [1, 2, "conceal", { conceal: "" }],
        [6, 7, "conceal", { conceal: "" }],
        [7, 8, "conceal", { conceal: "" }],
        [2, 6, "spell"],
        [8, 18, "markup.link.url"],
        [18, 20, "markup.link", { conceal: "" }],
      ],
      syntaxStyle,
      "**bold**https://a",
    )

    expect(highlights).toEqual([
      { start: 2, end: 6, styleId: strongStyleId },
      { start: 8, end: 18, styleId: linkUrlStyleId },
    ])
  })

  test("trims markdown heading and list marker whitespace", () => {
    const headingStyleId = syntaxStyle.getStyleId("heading")!
    const listStyleId = syntaxStyle.getStyleId("list")!

    const highlights = mapTreeSitterHighlights(
      [
        [0, 8, "markup.heading.1"],
        [0, 1, "conceal", { conceal: "" }],
        [9, 11, "markup.list"],
      ],
      syntaxStyle,
      "# Title\n\n- list",
    )

    expect(highlights).toEqual([
      { start: 2, end: 7, styleId: headingStyleId },
      { start: 9, end: 10, styleId: listStyleId },
    ])
  })

  test("skips highlighting unsupported file types", async () => {
    const client = new FakeHighlightClient({
      highlights: [[0, 4, "markup.strong"]],
    })

    const highlights = await getEditorHighlights({
      text: "plain text",
      path: "/tmp/plain.txt",
      syntaxStyle,
      treeSitterClient: client,
    })

    expect(highlights).toEqual([])
    expect(client.calls).toEqual([])
  })

  test("requests highlighting for supported file types and maps the response", async () => {
    const client = new FakeHighlightClient({
      highlights: [
        [0, 7, "markup.heading.1"],
        [7, 9, "conceal", { conceal: "" }],
        [10, 16, "markup.raw"],
      ],
    })

    const highlights = await getEditorHighlights({
      text: "# Title\n`code`",
      path: "/tmp/note.md",
      syntaxStyle,
      treeSitterClient: client,
    })

    expect(client.calls).toEqual([
      {
        content: "# Title\n`code`",
        filetype: "markdown",
      },
    ])
    expect(highlights).toEqual([
      { start: 0, end: 7, styleId: syntaxStyle.getStyleId("heading")! },
      { start: 10, end: 16, styleId: syntaxStyle.getStyleId("raw")! },
    ])
  })

  test("applies highlight ranges to the textarea after clearing prior ranges", () => {
    const textarea = new FakeTextarea("hello world")
    const highlights: Highlight[] = [
      { start: 0, end: 5, styleId: 1 },
      { start: 6, end: 10, styleId: 2 },
    ]

    try {
      applyEditorHighlights(textarea, highlights)

      expect(textarea.clearCalls).toBe(1)
      expect(textarea.appliedHighlights).toEqual([
        { lineIdx: 0, highlight: { start: 0, end: 5, styleId: 1 } },
        { lineIdx: 0, highlight: { start: 6, end: 10, styleId: 2 } },
      ])
    } finally {
      textarea.destroy()
    }
  })

  test("skips redundant highlight reapplication for the same textarea", () => {
    const textarea = new FakeTextarea("hello")
    const highlights: Highlight[] = [{ start: 0, end: 5, styleId: 1 }]

    try {
      const firstState = syncEditorHighlights(textarea, highlights, {
        textarea: null,
        signature: "",
      })

      const secondState = syncEditorHighlights(textarea, highlights, firstState)

      expect(textarea.clearCalls).toBe(1)
      expect(textarea.appliedHighlights).toEqual([
        { lineIdx: 0, highlight: { start: 0, end: 5, styleId: 1 } },
      ])
      expect(secondState).toBe(firstState)
    } finally {
      textarea.destroy()
    }
  })

  test("applies multiline highlights by line columns instead of drifting char ranges", () => {
    const textarea = new FakeTextarea("**aa**\n**bb**\n**cc**\n\n")

    try {
      applyEditorHighlights(textarea, [
        { start: 2, end: 4, styleId: 1 },
        { start: 9, end: 11, styleId: 1 },
        { start: 16, end: 18, styleId: 1 },
      ])

      expect(textarea.appliedHighlights).toEqual([
        { lineIdx: 0, highlight: { start: 2, end: 4, styleId: 1 } },
        { lineIdx: 1, highlight: { start: 2, end: 4, styleId: 1 } },
        { lineIdx: 2, highlight: { start: 2, end: 4, styleId: 1 } },
      ])
    } finally {
      textarea.destroy()
    }
  })

  test("maps highlights by source line offsets even when earlier lines contain wide characters", async () => {
    const text = await Bun.file("highlight_test.md").text()
    const textarea = new FakeTextarea(text)

    try {
      applyEditorHighlights(textarea, [
        { start: 628, end: 633, styleId: 2 },
        { start: 787, end: 797, styleId: 2 },
      ])

      expect(textarea.appliedHighlights).toEqual([
        { lineIdx: 24, highlight: { start: 6, end: 11, styleId: 2 } },
        { lineIdx: 29, highlight: { start: 6, end: 16, styleId: 2 } },
      ])
    } finally {
      textarea.destroy()
    }
  })

  test("supports real markdown highlighting with correct bold ranges in the current fixture", async () => {
    const client = createEditorHighlightClient(process.cwd())

    try {
      const highlights = await getEditorHighlights({
        text: await Bun.file("highlight_test.md").text(),
        path: "/tmp/highlight_test.md",
        syntaxStyle,
        treeSitterClient: client,
      })

      expect(highlights).toContainEqual({
        start: 628,
        end: 633,
        styleId: syntaxStyle.getStyleId("strong")!,
      })
      expect(highlights).toContainEqual({
        start: 787,
        end: 797,
        styleId: syntaxStyle.getStyleId("strong")!,
      })
    } finally {
      await client.destroy()
    }
  })
})
