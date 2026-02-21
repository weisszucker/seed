import type { ReactNode } from "react"

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
      segments.push({ text: line.slice(index, match.index), color: "#d4d4d4" })
    }

    const token = match[0]
    if (token.startsWith("`")) {
      segments.push({ text: token, color: "#d7ba7d" })
    } else if (token.startsWith("[")) {
      segments.push({ text: token, color: "#4fc1ff" })
    } else if (token.startsWith("**")) {
      segments.push({ text: token, color: "#ffd580" })
    } else {
      segments.push({ text: token, color: "#c586c0" })
    }

    index = regex.lastIndex
  }

  if (index < line.length) {
    segments.push({ text: line.slice(index), color: "#d4d4d4" })
  }

  if (segments.length === 0) {
    return [{ text: "", color: "#d4d4d4" }]
  }

  return segments
}

export function getSimpleLineSegments(line: string, inCodeBlock: boolean): Segment[] {
  if (line.trimStart().startsWith("```")) {
    return [{ text: line, color: "#569cd6" }]
  }

  if (inCodeBlock) {
    return [{ text: line, color: "#9cdcfe" }]
  }

  if (/^#{1,6}\s/.test(line)) {
    return [{ text: line, color: "#4ec9b0" }]
  }

  if (/^>\s/.test(line)) {
    return [{ text: line, color: "#6a9955" }]
  }

  if (/^(\s*[-*+]\s|\s*\d+\.\s)/.test(line)) {
    return [{ text: line, color: "#b5cea8" }]
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
