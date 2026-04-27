const ARROW_SEQUENCES: Record<"up" | "down" | "left" | "right", string> = {
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
}

function encodeCtrlKey(key: string): string {
  if (!/^[a-z]$/i.test(key)) {
    throw new Error(`Unsupported control key: ${key}`)
  }

  const normalized = key.toUpperCase().charCodeAt(0)
  return String.fromCharCode(normalized - 64)
}

export function press(key: string): string {
  const normalized = key.trim().toLowerCase()

  if (normalized === "enter" || normalized === "return") {
    return "\r"
  }

  if (normalized === "escape" || normalized === "esc") {
    return "\x1b"
  }

  if (normalized === "tab") {
    return "\t"
  }

  if (normalized === "space") {
    return " "
  }

  if (normalized === "backspace") {
    return "\x7f"
  }

  if (normalized === "pageup" || normalized === "page up") {
    return "\x1b[5~"
  }

  if (normalized === "pagedown" || normalized === "page down") {
    return "\x1b[6~"
  }

  if (normalized in ARROW_SEQUENCES) {
    return ARROW_SEQUENCES[normalized as keyof typeof ARROW_SEQUENCES]
  }

  if (normalized.startsWith("ctrl+") && normalized.length === 6) {
    return encodeCtrlKey(normalized[5] ?? "")
  }

  if (normalized.length === 1) {
    return normalized
  }

  throw new Error(`Unsupported key: ${key}`)
}

export function typeText(text: string): string {
  return text
}
