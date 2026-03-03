import { spawn } from "node:child_process"
import { logDiagnostic, logDiagnosticError } from "../diagnostics/logging"

export type CommandOptions = {
  cwd?: string
  stdin?: string
  allowFailure?: boolean
  env?: Record<string, string | undefined>
}

export type CommandResult = {
  stdout: string
  stderr: string
  exitCode: number
}

export interface CommandRunner {
  run(command: string, args: string[], options?: CommandOptions): Promise<CommandResult>
}

function formatCommand(command: string, args: string[]): string {
  const quoted = args.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg))
  return [command, ...quoted].join(" ")
}

export class CommandExecutionError extends Error {
  readonly command: string
  readonly args: string[]
  readonly cwd: string | undefined
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number

  constructor(command: string, args: string[], cwd: string | undefined, result: CommandResult) {
    const combined = result.stderr.trim() || result.stdout.trim() || "Unknown command failure"
    super(`Command failed (${result.exitCode}): ${formatCommand(command, args)}\n${combined}`)
    this.command = command
    this.args = args
    this.cwd = cwd
    this.stdout = result.stdout
    this.stderr = result.stderr
    this.exitCode = result.exitCode
  }
}

export class NodeCommandRunner implements CommandRunner {
  async run(command: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
    const cwd = options.cwd
    const env = options.env ? { ...process.env, ...options.env } : process.env

    return await new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env,
      })

      let stdout = ""
      let stderr = ""

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString()
      })
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString()
      })
      child.on("error", (error) => {
        logDiagnosticError("cloud.command_spawn_failed", error, {
          command,
          command_line: formatCommand(command, args),
          cwd,
        })
        reject(error)
      })

      if (typeof options.stdin === "string") {
        child.stdin.write(options.stdin)
      }
      child.stdin.end()

      child.on("close", (code) => {
        const exitCode = code ?? 1
        const result = { stdout, stderr, exitCode }
        if (exitCode !== 0 && !options.allowFailure) {
          logDiagnostic("error", "cloud.command_failed", {
            command,
            command_line: formatCommand(command, args),
            cwd,
            exit_code: exitCode,
            stderr,
            stdout,
          })
          reject(new CommandExecutionError(command, args, cwd, result))
          return
        }
        resolve(result)
      })
    })
  }
}

export async function commandExists(runner: CommandRunner, binary: string): Promise<boolean> {
  try {
    await runner.run(binary, ["--version"], { allowFailure: true })
    return true
  } catch {
    return false
  }
}
