import type { E2eHookEvent } from "../../../src/e2e/hooks"

export type ScreenCursor = {
  x: number
  y: number
}

export type ScreenMouseModes = {
  x10: boolean
  drag: boolean
  motion: boolean
  sgr: boolean
}

export type ScreenState = {
  cols: number
  rows: number
  cursor: ScreenCursor
  altScreen: boolean
  mouseModes: ScreenMouseModes
  lines: string[]
}

export type TerminalSession = {
  start(): Promise<void>
  stop(): Promise<void>
  write(data: string): Promise<void>
  resize(cols: number, rows: number): Promise<void>
  waitForOutput(predicate: (screen: ScreenState) => boolean, timeoutMs?: number): Promise<void>
  waitForHook(predicate: (event: E2eHookEvent) => boolean, timeoutMs?: number): Promise<E2eHookEvent>
  getLatestHookSeq(): number
  getRecentHookEvents(limit?: number): E2eHookEvent[]
  getScreen(): ScreenState
  getTranscript(): string
  collectFailureDiagnostics(): Promise<string>
}

export type DirectPtySessionOptions = {
  cwd: string
  eventLogPath: string
  configPath?: string
  term?: "vt100" | "xterm-256color"
  cols?: number
  rows?: number
  env?: Record<string, string | undefined>
}

export type TmuxSessionOptions = {
  cwd: string
  eventLogPath: string
  configPath?: string
  socketPath?: string
  sessionName?: string
  outerTerm?: "xterm-256color"
  cols?: number
  rows?: number
  env?: Record<string, string | undefined>
}
