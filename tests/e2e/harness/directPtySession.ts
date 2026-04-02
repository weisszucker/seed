import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import type { E2eHookEvent } from "../../../src/e2e/hooks"
import { collectWorkspaceTree, formatDiagnosticsSection, formatTranscriptTail } from "./diagnostics"
import { dumpVisibleText, TerminalBuffer } from "./terminalBuffer"
import type { DirectPtySessionOptions, ScreenState, TerminalSession } from "./types"
import { pollUntil } from "./waits"

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 40
const DEFAULT_TERM = "xterm-256color"
const DEFAULT_ENTRYPOINT = resolve(import.meta.dir, "../../../src/main.ts")
const PTY_HELPER = resolve(import.meta.dir, "./pty_helper.py")

type HelperMessage =
  | { type: "started"; pid: number }
  | { type: "output"; data: string }
  | { type: "exit"; code: number | null }
  | { type: "error"; message: string }

export class DirectPtySession implements TerminalSession {
  private child: ChildProcessWithoutNullStreams | null = null

  private readonly cols: number

  private readonly rows: number

  private readonly term: "vt100" | "xterm-256color"

  private readonly buffer: TerminalBuffer

  private transcript = ""

  private hookEvents: E2eHookEvent[] = []

  private parsedHookLines = 0

  private exitCode: number | null = null

  private exitPromise: Promise<number | null> | null = null

  private helperStdoutBuffer = ""

  private helperStarted = false

  private managedPid: number | null = null

  constructor(private readonly options: DirectPtySessionOptions) {
    this.cols = options.cols ?? DEFAULT_COLS
    this.rows = options.rows ?? DEFAULT_ROWS
    this.term = options.term ?? DEFAULT_TERM
    this.buffer = new TerminalBuffer(this.cols, this.rows)
  }

  async start(): Promise<void> {
    if (this.child) {
      throw new Error("DirectPtySession has already been started")
    }

    const child = spawn("python3", [
      PTY_HELPER,
      "--cwd",
      this.options.cwd,
      "--cols",
      String(this.cols),
      "--rows",
      String(this.rows),
      "--entrypoint",
      DEFAULT_ENTRYPOINT,
    ], {
      env: {
        ...process.env,
        ...(this.options.env ?? {}),
        TERM: this.term,
        SEED_E2E: "1",
        SEED_E2E_EVENT_LOG: this.options.eventLogPath,
        ...(this.options.configPath ? { SEED_CONFIG_PATH: this.options.configPath } : {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
    })

    this.child = child
    this.exitPromise = new Promise<number | null>((resolveExit, rejectExit) => {
      child.on("error", rejectExit)
      child.on("close", (code) => {
        this.exitCode = code
        resolveExit(code)
      })
    })

    child.stdout.on("data", (chunk) => {
      this.handleHelperStdout(chunk.toString())
    })

    child.stderr.on("data", (chunk) => {
      this.transcript += `[pty-helper-stderr] ${chunk.toString()}`
    })

    await pollUntil(() => this.helperStarted, 5000)
  }

  async stop(): Promise<void> {
    if (!this.child || !this.exitPromise) {
      return
    }

    if (this.exitCode === null) {
      await new Promise<void>((resolveStop, rejectStop) => {
        const payload = JSON.stringify({ type: "stop" })

        this.child?.stdin.write(`${payload}\n`, (error) => {
          if (error) {
            rejectStop(error)
            return
          }
          resolveStop()
        })
      })

      try {
        await pollUntil(() => this.exitCode !== null, 1000)
      } catch {
        this.child.kill("SIGKILL")
        await this.exitPromise
      }
    } else {
      await this.exitPromise
    }

    await this.refreshHookEvents()
    this.child = null
    this.exitPromise = null
  }

  async write(data: string): Promise<void> {
    if (!this.child) {
      throw new Error("DirectPtySession has not been started")
    }

    await new Promise<void>((resolveWrite, rejectWrite) => {
      const payload = JSON.stringify({
        type: "write",
        data: Buffer.from(data, "utf8").toString("base64"),
      })

      this.child?.stdin.write(`${payload}\n`, (error) => {
        if (error) {
          rejectWrite(error)
          return
        }
        resolveWrite()
      })
    })
  }

  async resize(cols: number, rows: number): Promise<void> {
    if (!this.child) {
      throw new Error("DirectPtySession has not been started")
    }

    await new Promise<void>((resolveResize, rejectResize) => {
      const payload = JSON.stringify({
        type: "resize",
        cols,
        rows,
      })

      this.child?.stdin.write(`${payload}\n`, (error) => {
        if (error) {
          rejectResize(error)
          return
        }
        resolveResize()
      })
    })

    this.buffer.resize(cols, rows)
  }

  async waitForOutput(predicate: (screen: ScreenState) => boolean, timeoutMs = 5000): Promise<void> {
    await pollUntil(() => predicate(this.getScreen()), timeoutMs)
  }

  async waitForHook(
    predicate: (event: E2eHookEvent) => boolean,
    timeoutMs = 5000,
  ): Promise<E2eHookEvent> {
    let match: E2eHookEvent | null = null

    await pollUntil(async () => {
      await this.refreshHookEvents()
      match = this.hookEvents.find(predicate) ?? null
      return match !== null
    }, timeoutMs)

    if (!match) {
      throw new Error("Timed out waiting for hook event")
    }

    return match
  }

  getLatestHookSeq(): number {
    return this.hookEvents.at(-1)?.seq ?? 0
  }

  getRecentHookEvents(limit = 50): E2eHookEvent[] {
    return this.hookEvents.slice(-limit)
  }

  getScreen(): ScreenState {
    return this.buffer.getScreen()
  }

  getTranscript(): string {
    return this.transcript
  }

  async collectFailureDiagnostics(): Promise<string> {
    await this.refreshHookEvents()

    const screen = this.getScreen()
    const workspaceTree = await collectWorkspaceTree(this.options.cwd)

    return [
      formatDiagnosticsSection("Visible Screen", dumpVisibleText(screen)),
      formatDiagnosticsSection("Transcript Tail", formatTranscriptTail(this.transcript)),
      formatDiagnosticsSection("Recent Hook Events", JSON.stringify(this.getRecentHookEvents(50), null, 2)),
      formatDiagnosticsSection("Workspace Tree", workspaceTree),
    ].join("\n\n")
  }

  getManagedPid(): number | null {
    return this.managedPid
  }

  async refreshHookEvents(): Promise<void> {
    try {
      const content = await readFile(this.options.eventLogPath, "utf8")
      const lines = content.split("\n")
      const completeLineCount = content.endsWith("\n") ? lines.length - 1 : Math.max(0, lines.length - 1)

      while (this.parsedHookLines < completeLineCount) {
        const rawLine = lines[this.parsedHookLines]?.trim()
        this.parsedHookLines += 1

        if (!rawLine) {
          continue
        }

        this.hookEvents.push(JSON.parse(rawLine) as E2eHookEvent)
      }
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : ""
      if (code === "ENOENT") {
        return
      }
      throw error
    }
  }

  dumpVisibleText(): string {
    return dumpVisibleText(this.getScreen())
  }

  private handleHelperStdout(chunk: string): void {
    this.helperStdoutBuffer += chunk

    while (true) {
      const newlineIndex = this.helperStdoutBuffer.indexOf("\n")
      if (newlineIndex === -1) {
        return
      }

      const rawLine = this.helperStdoutBuffer.slice(0, newlineIndex).trim()
      this.helperStdoutBuffer = this.helperStdoutBuffer.slice(newlineIndex + 1)

      if (!rawLine) {
        continue
      }

      const message = JSON.parse(rawLine) as HelperMessage
      if (message.type === "started") {
        this.helperStarted = true
        this.managedPid = message.pid
        continue
      }

      if (message.type === "output") {
        const text = Buffer.from(message.data, "base64").toString("utf8")
        this.transcript += text
        this.buffer.feed(text)
        continue
      }

      if (message.type === "exit") {
        this.exitCode = message.code
        continue
      }

      throw new Error(`PTY helper error: ${message.message}`)
    }
  }
}
