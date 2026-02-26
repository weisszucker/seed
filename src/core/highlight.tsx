import type { ReactNode } from "react"
import { syntaxColors } from "../theme"

type Segment = {
  text: string
  color: string
}

function parseInline(line: string): Segment[] {
  const regex = /(`[^`]+`|\[[^\]]+\]\([^\)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g
  const segments: Segment[] = []
  let index = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(line)) !== null) {
    if (match.index > index) {
      segments.push({ text: line.slice(index, match.index), color: syntaxColors.plain })
    }

    const token = match[0]
    if (token.startsWith("`")) {
      segments.push({ text: token, color: syntaxColors.inlineCode })
    } else if (token.startsWith("[")) {
      segments.push({ text: token, color: syntaxColors.link })
    } else if (token.startsWith("**")) {
      segments.push({ text: token, color: syntaxColors.bold })
    } else {
      segments.push({ text: token, color: syntaxColors.italic })
    }

    index = regex.lastIndex
  }

  if (index < line.length) {
    segments.push({ text: line.slice(index), color: syntaxColors.plain })
  }

  if (segments.length === 0) {
    return [{ text: "", color: syntaxColors.plain }]
  }

  return segments
}

export function getSimpleLineSegments(line: string, inCodeBlock: boolean): Segment[] {
  if (line.trimStart().startsWith("```")) {
    return [{ text: line, color: syntaxColors.codeFence }]
  }

  if (inCodeBlock) {
    return [{ text: line, color: syntaxColors.codeBlock }]
  }

  if (/^#{1,6}\s/.test(line)) {
    return [{ text: line, color: syntaxColors.heading }]
  }

  if (/^>\s/.test(line)) {
    return [{ text: line, color: syntaxColors.quote }]
  }

  if (/^(\s*[-*+]\s|\s*\d+\.\s)/.test(line)) {
    return [{ text: line, color: syntaxColors.list }]
  }

  return parseInline(line)
}

export function renderHighlightedLine(line: string, lineIndex: number, inCodeBlock: boolean): ReactNode {
  const parts = getSimpleLineSegments(line, inCodeBlock)
  return (
    <text key={`line-${lineIndex}`}>
      {parts.map((part, partIndex) => (
        <span key={`line-${lineIndex}-part-${partIndex}`} fg={part.color}>
          {part.text}
        </span>
      ))}
    </text>
  )
}
