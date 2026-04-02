import type { ScreenMouseModes, ScreenState } from "./types"

const ESC = "\x1b"
const BEL = "\x07"

function createBlankLine(cols: number): string[] {
  return Array.from({ length: cols }, () => " ")
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function dumpVisibleText(screen: ScreenState): string {
  return screen.lines.map((line) => line.replace(/\s+$/u, "")).join("\n")
}

export function findText(screen: ScreenState, text: string): boolean {
  return dumpVisibleText(screen).includes(text)
}

export function findLine(screen: ScreenState, pattern: RegExp): string | null {
  for (const line of screen.lines) {
    const trimmed = line.replace(/\s+$/u, "")
    if (pattern.test(trimmed)) {
      return trimmed
    }
  }

  return null
}

export function findTextCells(screen: ScreenState, text: string): Array<{ x: number; y: number }> {
  if (!text) {
    throw new Error("Text lookup requires a non-empty string")
  }

  const matches: Array<{ x: number; y: number }> = []

  for (let rowIndex = 0; rowIndex < screen.lines.length; rowIndex += 1) {
    const line = screen.lines[rowIndex] ?? ""
    let searchOffset = 0

    while (searchOffset <= line.length) {
      const matchIndex = line.indexOf(text, searchOffset)
      if (matchIndex === -1) {
        break
      }

      matches.push({
        x: matchIndex + 1,
        y: rowIndex + 1,
      })

      searchOffset = matchIndex + 1
    }
  }

  return matches
}

export function findUniqueTextCell(screen: ScreenState, text: string): { x: number; y: number } {
  const matches = findTextCells(screen, text)

  if (matches.length === 0) {
    throw new Error(`Text "${text}" is not visible on the current screen`)
  }

  if (matches.length > 1) {
    throw new Error(`Text "${text}" is ambiguous on the current screen`)
  }

  return matches[0]!
}

export class TerminalBuffer {
  private cells: string[][]

  private cursorX = 0

  private cursorY = 0

  private savedCursorX = 0

  private savedCursorY = 0

  private altScreen = false

  private readonly mouseModes: ScreenMouseModes = {
    x10: false,
    drag: false,
    motion: false,
    sgr: false,
  }

  constructor(
    private cols: number,
    private rows: number,
  ) {
    this.cells = Array.from({ length: rows }, () => createBlankLine(cols))
  }

  feed(chunk: string): void {
    let index = 0

    while (index < chunk.length) {
      const char = chunk[index]

      if (char === ESC) {
        index = this.consumeEscape(chunk, index)
        continue
      }

      if (char === "\r") {
        this.cursorX = 0
        index += 1
        continue
      }

      if (char === "\n") {
        this.cursorX = 0
        this.cursorY += 1
        this.ensureCursorVisible()
        index += 1
        continue
      }

      if (char === "\b") {
        this.cursorX = Math.max(0, this.cursorX - 1)
        index += 1
        continue
      }

      if (char === "\t") {
        const spaces = 8 - (this.cursorX % 8)
        for (let offset = 0; offset < spaces; offset += 1) {
          this.writeChar(" ")
        }
        index += 1
        continue
      }

      if ((char?.charCodeAt(0) ?? 0) < 0x20) {
        index += 1
        continue
      }

      this.writeChar(char ?? "")
      index += 1
    }
  }

  getScreen(): ScreenState {
    return {
      cols: this.cols,
      rows: this.rows,
      cursor: {
        x: this.cursorX + 1,
        y: this.cursorY + 1,
      },
      altScreen: this.altScreen,
      mouseModes: { ...this.mouseModes },
      lines: this.cells.map((line) => line.join("")),
    }
  }

  resize(cols: number, rows: number): void {
    const nextCells = Array.from({ length: rows }, () => createBlankLine(cols))
    const copyRows = Math.min(this.rows, rows)
    const copyCols = Math.min(this.cols, cols)

    for (let row = 0; row < copyRows; row += 1) {
      for (let col = 0; col < copyCols; col += 1) {
        nextCells[row]![col] = this.cells[row]![col] ?? " "
      }
    }

    this.cols = cols
    this.rows = rows
    this.cells = nextCells
    this.cursorX = clamp(this.cursorX, 0, Math.max(0, cols - 1))
    this.cursorY = clamp(this.cursorY, 0, Math.max(0, rows - 1))
    this.savedCursorX = clamp(this.savedCursorX, 0, Math.max(0, cols - 1))
    this.savedCursorY = clamp(this.savedCursorY, 0, Math.max(0, rows - 1))
  }

  private consumeEscape(chunk: string, index: number): number {
    const next = chunk[index + 1]

    if (next === "[") {
      return this.consumeCsi(chunk, index + 2)
    }

    if (next === "]") {
      return this.consumeOsc(chunk, index + 2)
    }

    if (next === "P") {
      return this.consumeDcs(chunk, index + 2)
    }

    if (next === "7") {
      this.savedCursorX = this.cursorX
      this.savedCursorY = this.cursorY
      return index + 2
    }

    if (next === "8") {
      this.cursorX = this.savedCursorX
      this.cursorY = this.savedCursorY
      return index + 2
    }

    return index + 2
  }

  private consumeCsi(chunk: string, index: number): number {
    let params = ""
    let currentIndex = index

    while (currentIndex < chunk.length) {
      const char = chunk[currentIndex] ?? ""
      const code = char.charCodeAt(0)

      if (code >= 0x40 && code <= 0x7e) {
        this.handleCsi(params, char)
        return currentIndex + 1
      }

      params += char
      currentIndex += 1
    }

    return currentIndex
  }

  private consumeOsc(chunk: string, index: number): number {
    let currentIndex = index

    while (currentIndex < chunk.length) {
      const char = chunk[currentIndex]
      const next = chunk[currentIndex + 1]

      if (char === BEL) {
        return currentIndex + 1
      }

      if (char === ESC && next === "\\") {
        return currentIndex + 2
      }

      currentIndex += 1
    }

    return currentIndex
  }

  private consumeDcs(chunk: string, index: number): number {
    let currentIndex = index

    while (currentIndex < chunk.length) {
      const char = chunk[currentIndex]
      const next = chunk[currentIndex + 1]

      if (char === ESC && next === "\\") {
        return currentIndex + 2
      }

      currentIndex += 1
    }

    return currentIndex
  }

  private handleCsi(params: string, finalChar: string): void {
    const normalizedParams = params.trim()

    if (finalChar === "m" || finalChar === "q" || finalChar === "p" || finalChar === "n" || finalChar === "t") {
      return
    }

    if (finalChar === "s") {
      this.savedCursorX = this.cursorX
      this.savedCursorY = this.cursorY
      return
    }

    if (finalChar === "u") {
      this.cursorX = this.savedCursorX
      this.cursorY = this.savedCursorY
      return
    }

    if (finalChar === "H" || finalChar === "f") {
      const [rowParam = "1", colParam = "1"] = normalizedParams.split(";")
      this.cursorY = clamp(Number.parseInt(rowParam || "1", 10) - 1 || 0, 0, this.rows - 1)
      this.cursorX = clamp(Number.parseInt(colParam || "1", 10) - 1 || 0, 0, this.cols - 1)
      return
    }

    if (finalChar === "A" || finalChar === "B" || finalChar === "C" || finalChar === "D") {
      const distance = Number.parseInt(normalizedParams || "1", 10) || 1
      if (finalChar === "A") {
        this.cursorY = clamp(this.cursorY - distance, 0, this.rows - 1)
      } else if (finalChar === "B") {
        this.cursorY = clamp(this.cursorY + distance, 0, this.rows - 1)
      } else if (finalChar === "C") {
        this.cursorX = clamp(this.cursorX + distance, 0, this.cols - 1)
      } else {
        this.cursorX = clamp(this.cursorX - distance, 0, this.cols - 1)
      }
      return
    }

    if (finalChar === "G") {
      const column = Number.parseInt(normalizedParams || "1", 10) || 1
      this.cursorX = clamp(column - 1, 0, this.cols - 1)
      return
    }

    if (finalChar === "d") {
      const row = Number.parseInt(normalizedParams || "1", 10) || 1
      this.cursorY = clamp(row - 1, 0, this.rows - 1)
      return
    }

    if (finalChar === "J") {
      const mode = Number.parseInt(normalizedParams || "0", 10) || 0
      if (mode === 2) {
        this.clearScreen()
      } else {
        this.clearToScreenEnd()
      }
      return
    }

    if (finalChar === "K") {
      const mode = Number.parseInt(normalizedParams || "0", 10) || 0
      if (mode === 2) {
        this.clearLine(this.cursorY)
      } else {
        this.clearToLineEnd(this.cursorY, this.cursorX)
      }
      return
    }

    if (finalChar === "h" || finalChar === "l") {
      const enabled = finalChar === "h"
      this.handlePrivateModes(normalizedParams, enabled)
    }
  }

  private handlePrivateModes(params: string, enabled: boolean): void {
    if (!params.startsWith("?")) {
      return
    }

    const modes = params.slice(1).split(";").map((value) => Number.parseInt(value, 10))

    for (const mode of modes) {
      if (mode === 1049) {
        this.altScreen = enabled
        this.clearScreen()
        continue
      }

      if (mode === 1000) {
        this.mouseModes.x10 = enabled
        continue
      }

      if (mode === 1002) {
        this.mouseModes.drag = enabled
        continue
      }

      if (mode === 1003) {
        this.mouseModes.motion = enabled
        continue
      }

      if (mode === 1006) {
        this.mouseModes.sgr = enabled
      }
    }
  }

  private writeChar(char: string): void {
    if (this.cursorY >= this.rows) {
      this.ensureCursorVisible()
    }

    if (this.cursorX >= this.cols) {
      this.cursorX = 0
      this.cursorY += 1
      this.ensureCursorVisible()
    }

    this.cells[this.cursorY]![this.cursorX] = char
    this.cursorX += 1
  }

  private ensureCursorVisible(): void {
    while (this.cursorY >= this.rows) {
      this.cells.shift()
      this.cells.push(createBlankLine(this.cols))
      this.cursorY -= 1
      this.savedCursorY = Math.max(0, this.savedCursorY - 1)
    }
  }

  private clearScreen(): void {
    for (let row = 0; row < this.rows; row += 1) {
      this.clearLine(row)
    }
    this.cursorX = 0
    this.cursorY = 0
  }

  private clearLine(row: number): void {
    this.cells[row] = createBlankLine(this.cols)
  }

  private clearToLineEnd(row: number, fromCol: number): void {
    const line = this.cells[row]
    if (!line) {
      return
    }

    for (let col = fromCol; col < this.cols; col += 1) {
      line[col] = " "
    }
  }

  private clearToScreenEnd(): void {
    this.clearToLineEnd(this.cursorY, this.cursorX)
    for (let row = this.cursorY + 1; row < this.rows; row += 1) {
      this.clearLine(row)
    }
  }
}
