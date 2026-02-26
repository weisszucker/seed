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
      segments.push({ text: line.slice(index, match.index), color: "#c9ced5" })
    }

    const token = match[0]
    if (token.startsWith("`")) {
      segments.push({ text: token, color: "#cfb381" })
    } else if (token.startsWith("[")) {
      segments.push({ text: token, color: "#84b8d9" })
    } else if (token.startsWith("**")) {
      segments.push({ text: token, color: "#e2bf88" })
    } else {
      segments.push({ text: token, color: "#b99bbf" })
    }

    index = regex.lastIndex
  }

  if (index < line.length) {
    segments.push({ text: line.slice(index), color: "#c9ced5" })
  }

  if (segments.length === 0) {
    return [{ text: "", color: "#c9ced5" }]
  }

  return segments
}

export function getSimpleLineSegments(line: string, inCodeBlock: boolean): Segment[] {
  if (line.trimStart().startsWith("```")) {
    return [{ text: line, color: "#7aa8cc" }]
  }

  if (inCodeBlock) {
    return [{ text: line, color: "#abc6db" }]
  }

  if (/^#{1,6}\s/.test(line)) {
    return [{ text: line, color: "#88c0aa" }]
  }

  if (/^>\s/.test(line)) {
    return [{ text: line, color: "#95b086" }]
  }

  if (/^(\s*[-*+]\s|\s*\d+\.\s)/.test(line)) {
    return [{ text: line, color: "#b3c5a6" }]
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
