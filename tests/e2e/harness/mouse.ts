import { findUniqueTextCell } from "./terminalBuffer"
import type { ScreenState } from "./types"

const ESC = "\x1b"
const LEFT_BUTTON = 0
const DRAG_FLAG = 32

function encodeSgrMouse(button: number, x: number, y: number, suffix: "M" | "m"): string {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 1 || y < 1) {
    throw new Error(`Mouse coordinates must be positive integers, received (${x}, ${y})`)
  }

  return `${ESC}[<${button};${x};${y}${suffix}`
}

export function mouseDownLeft(x: number, y: number): string {
  return encodeSgrMouse(LEFT_BUTTON, x, y, "M")
}

export function mouseDragLeft(x: number, y: number): string {
  return encodeSgrMouse(LEFT_BUTTON + DRAG_FLAG, x, y, "M")
}

export function mouseUpLeft(x: number, y: number): string {
  return encodeSgrMouse(LEFT_BUTTON, x, y, "m")
}

export function clickCell(x: number, y: number): string {
  return `${mouseDownLeft(x, y)}${mouseUpLeft(x, y)}`
}

export function clickText(screen: ScreenState, text: string): string {
  const cell = findUniqueTextCell(screen, text)
  return clickCell(cell.x, cell.y)
}
