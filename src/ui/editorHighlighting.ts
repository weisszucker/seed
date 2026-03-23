import {
  pathToFiletype,
  SyntaxStyle,
  TreeSitterClient,
  type Highlight,
  type SimpleHighlight,
  type ThemeTokenStyle,
} from "@opentui/core"

import { syntaxColors } from "../theme"

export type SyntaxHighlightClient = Pick<TreeSitterClient, "highlightOnce">

type HighlightMeta = SimpleHighlight[3]
type TextRange = { start: number; end: number }
type LineHighlight = {
  lineIdx: number
  highlight: Highlight
}

type HighlightableTextarea = {
  plainText: string
  clearAllHighlights: () => void
  addHighlight: (lineIdx: number, highlight: Highlight) => void
}

type HighlightRequest = {
  text: string
  path: string | null
  syntaxStyle: SyntaxStyle
  treeSitterClient: SyntaxHighlightClient
}

export type AppliedHighlightState = {
  textarea: HighlightableTextarea | null
  signature: string
}

type InternalTreeSitterClient = {
  handleWorkerMessage: (event: { data?: { type?: string } }) => void
  worker?: {
    onmessage: ((event: { data?: { type?: string } }) => void) | null
  }
}

const NON_STYLE_GROUPS = new Set(["spell", "nospell"])

const THEME_DEFINITIONS: ThemeTokenStyle[] = [
  { scope: ["heading"], style: { foreground: syntaxColors.heading, bold: true } },
  { scope: ["strong"], style: { foreground: syntaxColors.bold, bold: true } },
  { scope: ["italic"], style: { foreground: syntaxColors.italic, italic: true } },
  { scope: ["strikethrough"], style: { foreground: syntaxColors.italic, dim: true } },
  { scope: ["link"], style: { foreground: syntaxColors.link } },
  { scope: ["linkLabel"], style: { foreground: syntaxColors.link, underline: true } },
  { scope: ["linkUrl"], style: { foreground: syntaxColors.linkUrl, underline: true } },
  { scope: ["list"], style: { foreground: syntaxColors.list } },
  { scope: ["quote"], style: { foreground: syntaxColors.quote, italic: true } },
  { scope: ["raw"], style: { foreground: syntaxColors.inlineCode } },
  { scope: ["rawBlock"], style: { foreground: syntaxColors.codeBlock } },
  { scope: ["label"], style: { foreground: syntaxColors.label } },
  { scope: ["keyword"], style: { foreground: syntaxColors.keyword, bold: true } },
  { scope: ["type"], style: { foreground: syntaxColors.type } },
  { scope: ["string"], style: { foreground: syntaxColors.string } },
  { scope: ["number"], style: { foreground: syntaxColors.number } },
  { scope: ["operator"], style: { foreground: syntaxColors.operator } },
  { scope: ["punctuation"], style: { foreground: syntaxColors.punctuation, dim: true } },
  { scope: ["constant"], style: { foreground: syntaxColors.constant } },
  { scope: ["variable"], style: { foreground: syntaxColors.variable } },
]

const EXACT_SCOPE_TO_STYLE: Record<string, string> = {
  "markup.strong": "strong",
  "markup.italic": "italic",
  "markup.strikethrough": "strikethrough",
  "markup.link": "link",
  "markup.link.bracket.close": "link",
  "markup.link.label": "linkLabel",
  "markup.link.url": "linkUrl",
  "markup.quote": "quote",
  "markup.raw": "raw",
  "markup.raw.block": "rawBlock",
  label: "label",
}

const PREFIX_SCOPE_TO_STYLE: Array<[prefix: string, styleName: string]> = [
  ["markup.heading", "heading"],
  ["markup.list", "list"],
  ["keyword", "keyword"],
  ["type", "type"],
  ["string", "string"],
  ["number", "number"],
  ["operator", "operator"],
  ["punctuation", "punctuation"],
  ["constant", "constant"],
  ["variable", "variable"],
]

export function createEditorHighlightClient(dataPath: string): TreeSitterClient {
  const client = new TreeSitterClient({ dataPath })
  const internalClient = client as unknown as InternalTreeSitterClient
  const originalHandleWorkerMessage = internalClient.handleWorkerMessage.bind(client)

  internalClient.handleWorkerMessage = (event: { data?: { type?: string } }) => {
    if (event.data?.type === "WORKER_LOG") {
      return
    }

    originalHandleWorkerMessage(event)
  }

  if (internalClient.worker) {
    internalClient.worker.onmessage = internalClient.handleWorkerMessage.bind(client)
  }

  return client
}

export function createEditorSyntaxStyle(): SyntaxStyle {
  return SyntaxStyle.fromTheme(THEME_DEFINITIONS)
}

export function resolveEditorFiletype(path: string | null): string | null {
  if (!path) {
    return "markdown"
  }

  return pathToFiletype(path) ?? null
}

export function mapTreeSitterGroupToStyleName(group: string): string | null {
  const exactMatch = EXACT_SCOPE_TO_STYLE[group]
  if (exactMatch) {
    return exactMatch
  }

  for (const [prefix, styleName] of PREFIX_SCOPE_TO_STYLE) {
    if (group === prefix || group.startsWith(`${prefix}.`)) {
      return styleName
    }
  }

  return null
}

export function mapTreeSitterHighlights(
  highlights: SimpleHighlight[],
  syntaxStyle: SyntaxStyle,
  text = "",
): Highlight[] {
  const concealRanges = collectConcealRanges(highlights)
  const mappedHighlights: Highlight[] = []

  for (const [start, end, group, meta] of highlights) {
    if (shouldIgnoreHighlight(group, meta) || isConcealHighlight(group, meta)) {
      continue
    }

    if (start >= end) {
      continue
    }

    const styleName = mapTreeSitterGroupToStyleName(group)
    if (!styleName) {
      continue
    }

    const styleId = syntaxStyle.getStyleId(styleName)
    if (styleId === null) {
      continue
    }

    const visibleRanges = subtractRanges({ start, end }, concealRanges)
    for (const visibleRange of visibleRanges) {
      const normalizedRange = normalizeVisibleRange(text, group, visibleRange)
      if (!normalizedRange) {
        continue
      }

      mappedHighlights.push({
        start: normalizedRange.start,
        end: normalizedRange.end,
        styleId,
      })
    }
  }

  return mappedHighlights
}

export async function getEditorHighlights({
  text,
  path,
  syntaxStyle,
  treeSitterClient,
}: HighlightRequest): Promise<Highlight[]> {
  if (text.length === 0) {
    return []
  }

  const filetype = resolveEditorFiletype(path)
  if (!filetype) {
    return []
  }

  const result = await treeSitterClient.highlightOnce(text, filetype)
  if (!result.highlights || result.error) {
    return []
  }

  return mapTreeSitterHighlights(result.highlights, syntaxStyle, text)
}

export function applyEditorHighlights(textarea: HighlightableTextarea, highlights: Highlight[]): void {
  const lineStarts = buildLineStarts(textarea.plainText)
  textarea.clearAllHighlights()

  for (const highlight of highlights) {
    const lineHighlights = expandHighlightByLine(textarea.plainText, lineStarts, highlight)
    for (const lineHighlight of lineHighlights) {
      textarea.addHighlight(lineHighlight.lineIdx, lineHighlight.highlight)
    }
  }
}

export function syncEditorHighlights(
  textarea: HighlightableTextarea,
  highlights: Highlight[],
  currentState: AppliedHighlightState,
): AppliedHighlightState {
  const nextSignature = createHighlightSignature(highlights)
  if (currentState.textarea === textarea && currentState.signature === nextSignature) {
    return currentState
  }

  applyEditorHighlights(textarea, highlights)

  return {
    textarea,
    signature: nextSignature,
  }
}

function shouldIgnoreHighlight(group: string, meta: HighlightMeta): boolean {
  if (NON_STYLE_GROUPS.has(group)) {
    return true
  }

  if (!meta) {
    return false
  }

  return false
}

function isConcealHighlight(group: string, meta: HighlightMeta): boolean {
  if (group === "conceal" || group.startsWith("conceal.")) {
    return true
  }

  if (!meta) {
    return false
  }

  return meta.conceal !== undefined || meta.concealLines !== undefined
}

function collectConcealRanges(highlights: SimpleHighlight[]): TextRange[] {
  const concealRanges = highlights
    .filter(([start, end, group, meta]) => start < end && isConcealHighlight(group, meta))
    .map(([start, end]) => ({ start, end }))
    .sort((left, right) => {
      if (left.start !== right.start) {
        return left.start - right.start
      }

      return left.end - right.end
    })

  if (concealRanges.length === 0) {
    return concealRanges
  }

  const mergedRanges: TextRange[] = [concealRanges[0]]
  for (let index = 1; index < concealRanges.length; index += 1) {
    const nextRange = concealRanges[index]
    const currentRange = mergedRanges[mergedRanges.length - 1]

    if (nextRange.start <= currentRange.end) {
      currentRange.end = Math.max(currentRange.end, nextRange.end)
      continue
    }

    mergedRanges.push({ ...nextRange })
  }

  return mergedRanges
}

function subtractRanges(range: TextRange, excludedRanges: TextRange[]): TextRange[] {
  const visibleRanges: TextRange[] = []
  let cursor = range.start

  for (const excludedRange of excludedRanges) {
    if (excludedRange.end <= cursor) {
      continue
    }

    if (excludedRange.start >= range.end) {
      break
    }

    if (cursor < excludedRange.start) {
      visibleRanges.push({
        start: cursor,
        end: Math.min(excludedRange.start, range.end),
      })
    }

    cursor = Math.max(cursor, excludedRange.end)
    if (cursor >= range.end) {
      break
    }
  }

  if (cursor < range.end) {
    visibleRanges.push({ start: cursor, end: range.end })
  }

  return visibleRanges
}

function normalizeVisibleRange(text: string, group: string, range: TextRange): TextRange | null {
  let { start, end } = range
  const trimMode = getTrimMode(group)

  if (trimMode === "leading" || trimMode === "both") {
    while (start < end && isTrimmedWhitespace(text[start])) {
      start += 1
    }
  }

  if (trimMode === "trailing" || trimMode === "both") {
    while (start < end && isTrimmedWhitespace(text[end - 1])) {
      end -= 1
    }
  }

  if (start >= end) {
    return null
  }

  return { start, end }
}

function getTrimMode(group: string): "none" | "leading" | "trailing" | "both" {
  if (group === "markup.list" || group.startsWith("markup.list.")) {
    return "trailing"
  }

  if (group === "markup.heading" || group.startsWith("markup.heading.")) {
    return "both"
  }

  return "none"
}

function isTrimmedWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r"
}

function createHighlightSignature(highlights: Highlight[]): string {
  return highlights.map(({ start, end, styleId }) => `${start}:${end}:${styleId}`).join("|")
}

function expandHighlightByLine(text: string, lineStarts: number[], highlight: Highlight): LineHighlight[] {
  if (highlight.start >= highlight.end) {
    return []
  }

  const startPosition = toLinePosition(lineStarts, highlight.start)
  const endPosition = toLinePosition(lineStarts, highlight.end)
  if (!startPosition || !endPosition) {
    return []
  }

  if (startPosition.row === endPosition.row) {
    return [
      {
        lineIdx: startPosition.row,
        highlight: {
          ...highlight,
          start: startPosition.col,
          end: endPosition.col,
        },
      },
    ]
  }

  const lineHighlights: LineHighlight[] = []
  const lastLineIdx = endPosition.col === 0 ? endPosition.row - 1 : endPosition.row

  for (let lineIdx = startPosition.row; lineIdx <= lastLineIdx; lineIdx += 1) {
    const startCol = lineIdx === startPosition.row ? startPosition.col : 0
    const endCol = lineIdx === endPosition.row ? endPosition.col : getLineLength(text, lineStarts, lineIdx)

    if (startCol >= endCol) {
      continue
    }

    lineHighlights.push({
      lineIdx,
      highlight: {
        ...highlight,
        start: startCol,
        end: endCol,
      },
    })
  }

  return lineHighlights
}

function buildLineStarts(text: string): number[] {
  const lineStarts = [0]

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      lineStarts.push(index + 1)
    }
  }

  return lineStarts
}

function toLinePosition(lineStarts: number[], offset: number): { row: number; col: number } | null {
  if (offset < 0) {
    return null
  }

  let low = 0
  let high = lineStarts.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const lineStart = lineStarts[mid]
    const nextLineStart = mid + 1 < lineStarts.length ? lineStarts[mid + 1] : Number.POSITIVE_INFINITY

    if (offset < lineStart) {
      high = mid - 1
      continue
    }

    if (offset >= nextLineStart) {
      low = mid + 1
      continue
    }

    return {
      row: mid,
      col: offset - lineStart,
    }
  }

  const lastRow = lineStarts.length - 1
  const lastLineStart = lineStarts[lastRow]
  if (offset >= lastLineStart) {
    return {
      row: lastRow,
      col: offset - lastLineStart,
    }
  }

  return null
}

function getLineLength(text: string, lineStarts: number[], lineIdx: number): number {
  const lineStart = lineStarts[lineIdx]
  const nextLineStart = lineIdx + 1 < lineStarts.length ? lineStarts[lineIdx + 1] : text.length
  const lineEnd = nextLineStart > lineStart && text[nextLineStart - 1] === "\n" ? nextLineStart - 1 : nextLineStart

  return Math.max(0, lineEnd - lineStart)
}
