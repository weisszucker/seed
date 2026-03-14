import { spawn } from "node:child_process"

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

function appendGitConfigEntries(
  env: Record<string, string | undefined> | undefined,
  entries: Array<{ key: string; value: string }>,
): Record<string, string | undefined> {
  const nextEnv = { ...(env ?? {}) }
  const rawCount = nextEnv.GIT_CONFIG_COUNT ?? process.env.GIT_CONFIG_COUNT ?? "0"
  const parsedCount = Number.parseInt(rawCount, 10)
  const baseCount = Number.isFinite(parsedCount) && parsedCount >= 0 ? parsedCount : 0

  nextEnv.GIT_CONFIG_COUNT = String(baseCount + entries.length)
  entries.forEach((entry, index) => {
    const offset = baseCount + index
    nextEnv[`GIT_CONFIG_KEY_${offset}`] = entry.key
    nextEnv[`GIT_CONFIG_VALUE_${offset}`] = entry.value
  })

  return nextEnv
}

export function createGithubAuthenticatedRunner(runner: CommandRunner, token: string): CommandRunner {
  const authorization = Buffer.from(`x-access-token:${token}`, "utf8").toString("base64")

  return {
    async run(command: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
      if (command !== "git") {
        return await runner.run(command, args, options)
      }

      const env = appendGitConfigEntries(options.env, [
        {
          key: "http.https://github.com/.extraheader",
          value: `AUTHORIZATION: basic ${authorization}`,
        },
      ])
      env.GIT_TERMINAL_PROMPT = "0"

      return await runner.run(command, args, {
        ...options,
        env,
      })
    },
  }
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
