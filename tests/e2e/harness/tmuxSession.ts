import { randomUUID } from "node:crypto"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"

import type { E2eHookEvent } from "../../../src/e2e/hooks"
import { dumpVisibleText, TerminalBuffer } from "./terminalBuffer"
import type { ScreenState, TerminalSession, TmuxSessionOptions } from "./types"
import { pollUntil } from "./waits"

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 40
const DEFAULT_OUTER_TERM = "xterm-256color"
const DEFAULT_ENTRYPOINT = resolve(import.meta.dir, "../../../src/main.ts")
const PTY_HELPER = resolve(import.meta.dir, "./pty_helper.py")
const TMUX_DEFAULT_TERMINAL = "tmux-256color"

type HelperMessage =
  | { type: "started" }
  | { type: "output"; data: string }
  | { type: "exit"; code: number | null }
  | { type: "error"; message: string }

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  })

  let stdout = ""
  let stderr = ""

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString()
  })

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString()
  })

  const code = await new Promise<number>((resolveCode, rejectCode) => {
    child.on("error", rejectCode)
    child.on("close", (exitCode) => {
      resolveCode(exitCode ?? 0)
    })
  })

  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${(stderr || stdout).trim()}`)
  }

  return stdout
}

export class TmuxSession implements TerminalSession {
  private child: ChildProcessWithoutNullStreams | null = null

  private readonly cols: number

  private readonly rows: number

  private readonly outerTerm: "xterm-256color"

  private readonly buffer: TerminalBuffer

  private readonly socketPath: string

  private readonly configPath: string

  private readonly sessionName: string

  private transcript = ""

  private paneCapture = ""

  private hookEvents: E2eHookEvent[] = []

  private parsedHookLines = 0

  private exitCode: number | null = null

  private exitPromise: Promise<number | null> | null = null

  private helperStdoutBuffer = ""

  private helperStarted = false

  constructor(private readonly options: TmuxSessionOptions) {
    this.cols = options.cols ?? DEFAULT_COLS
    this.rows = options.rows ?? DEFAULT_ROWS
    this.outerTerm = options.outerTerm ?? DEFAULT_OUTER_TERM
    this.buffer = new TerminalBuffer(this.cols, this.rows)
    this.sessionName = options.sessionName ?? `seed-e2e-${randomUUID()}`
    this.socketPath = options.socketPath ?? join(dirname(options.eventLogPath), `${this.sessionName}.sock`)
    this.configPath = join(dirname(this.socketPath), `${this.sessionName}.tmux.conf`)
  }

  async start(): Promise<void> {
    if (this.child) {
      throw new Error("TmuxSession has already been started")
    }

    await this.prepareServer()

    const child = spawn("python3", [
      PTY_HELPER,
      "--cwd",
      this.options.cwd,
      "--cols",
      String(this.cols),
      "--rows",
      String(this.rows),
      "--argv-json",
      JSON.stringify([
        "tmux",
        "-f",
        this.configPath,
        "-S",
        this.socketPath,
        "attach-session",
        "-t",
        this.sessionName,
      ]),
    ], {
      env: {
        ...process.env,
        ...(this.options.env ?? {}),
        TERM: this.outerTerm,
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
      this.transcript += `[tmux-pty-helper-stderr] ${chunk.toString()}`
    })

    await pollUntil(() => this.helperStarted, 5000)
    this.transcript += `[tmux-info] socket=${this.socketPath} session=${this.sessionName} outerTerm=${this.outerTerm} defaultTerminal=${TMUX_DEFAULT_TERMINAL}\n`
  }

  async stop(): Promise<void> {
    if (!this.child || !this.exitPromise) {
      return
    }

    try {
      this.paneCapture = await this.capturePaneOutput()
      if (this.paneCapture) {
        this.transcript += `[tmux-pane-capture]\n${this.paneCapture}\n`
      }
    } catch (error) {
      this.transcript += `[tmux-pane-capture-error] ${error instanceof Error ? error.message : String(error)}\n`
    }

    try {
      await this.killServer()
    } catch (error) {
      this.transcript += `[tmux-kill-server-error] ${error instanceof Error ? error.message : String(error)}\n`
    }

    try {
      await Promise.race([
        this.exitPromise,
        (async () => {
          await Bun.sleep(1000)
          throw new Error("Timed out waiting for tmux PTY session to exit")
        })(),
      ])
    } catch {
      this.child.kill("SIGKILL")
      await this.exitPromise
    }

    await this.refreshHookEvents()
    await rm(this.socketPath, { force: true })
    await rm(this.configPath, { force: true })
    this.child = null
    this.exitPromise = null
  }

  async write(data: string): Promise<void> {
    if (!this.child) {
      throw new Error("TmuxSession has not been started")
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
      throw new Error("TmuxSession has not been started")
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

  private async prepareServer(): Promise<void> {
    await mkdir(dirname(this.socketPath), { recursive: true })
    await rm(this.socketPath, { force: true })
    await rm(this.configPath, { force: true })
    await writeFile(
      this.configPath,
      [
        `set -g default-terminal "${TMUX_DEFAULT_TERMINAL}"`,
        `set -g mouse on`,
        `set -g status off`,
        `set -g set-clipboard off`,
        `set -g remain-on-exit on`,
      ].join("\n"),
    )

    await this.runTmux([
      "new-session",
      "-d",
      "-s",
      this.sessionName,
      "-c",
      this.options.cwd,
      this.buildPaneCommand(),
    ])
  }

  private buildPaneCommand(): string {
    const envEntries = [
      `SEED_E2E=1`,
      `SEED_E2E_EVENT_LOG=${shellEscape(this.options.eventLogPath)}`,
    ]

    if (this.options.configPath) {
      envEntries.push(`SEED_CONFIG_PATH=${shellEscape(this.options.configPath)}`)
    }

    for (const [key, value] of Object.entries(this.options.env ?? {})) {
      if (value === undefined) {
        continue
      }

      envEntries.push(`${key}=${shellEscape(value)}`)
    }

    return `env ${envEntries.join(" ")} bun run ${shellEscape(DEFAULT_ENTRYPOINT)}`
  }

  private async runTmux(args: string[]): Promise<string> {
    return runCommand(
      "tmux",
      ["-f", this.configPath, "-S", this.socketPath, ...args],
      this.options.cwd,
      process.env,
    )
  }

  private async capturePaneOutput(): Promise<string> {
    try {
      return (await this.runTmux(["capture-pane", "-p", "-J", "-t", `${this.sessionName}:0.0`])).trimEnd()
    } catch {
      return ""
    }
  }

  private async killServer(): Promise<void> {
    try {
      await this.runTmux(["kill-server"])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes("no server running")) {
        return
      }
      throw error
    }
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
        continue
      }

      if (message.type === "output") {
        const text = Buffer.from(message.data, "base64").toString("utf8")
        this.transcript += text
        this.buffer.feed(text)
        continue
      }

      if (message.type === "error") {
        throw new Error(`tmux PTY helper failed: ${message.message}`)
      }
    }
  }
}
