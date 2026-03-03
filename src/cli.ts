import { startSeedApp } from "./app/start"
import { runCloudMode } from "./cloud/mode"
import { logDiagnostic, logDiagnosticError } from "./diagnostics/logging"

export type ParsedCommand =
  | { type: "local" }
  | { type: "help" }
  | { type: "cloud"; owner: string; repo: string }

export class CliUsageError extends Error {}

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const REPO_RE = /^[A-Za-z0-9._-]+$/

export function parseRepoSlug(slug: string): { owner: string; repo: string } | null {
  const trimmed = slug.trim()
  const parts = trimmed.split("/")
  if (parts.length !== 2) {
    return null
  }

  const [owner, repo] = parts
  if (!owner || !repo || !OWNER_RE.test(owner) || !REPO_RE.test(repo)) {
    return null
  }

  return { owner, repo }
}

export function usageText(): string {
  return [
    "Usage:",
    "  seed",
    "  seed cloud <owner>/<repo>",
    "  seed --help",
  ].join("\n")
}

export function parseCliArgs(args: string[]): ParsedCommand {
  if (args.length === 0) {
    return { type: "local" }
  }

  const [first, second, ...rest] = args
  if (first === "--help" || first === "-h" || first === "help") {
    return { type: "help" }
  }

  if (first === "cloud") {
    if (!second || rest.length > 0) {
      throw new CliUsageError(`Expected exactly one repo slug.\n\n${usageText()}`)
    }
    const parsed = parseRepoSlug(second)
    if (!parsed) {
      throw new CliUsageError(`Invalid repo slug: "${second}". Expected <owner>/<repo>.\n\n${usageText()}`)
    }
    return { type: "cloud", ...parsed }
  }

  throw new CliUsageError(`Unknown command: "${first}".\n\n${usageText()}`)
}

type CliRunOptions = {
  startLocal?: () => Promise<void>
  startCloud?: (owner: string, repo: string) => Promise<void>
  writeStdout?: (message: string) => void
  writeStderr?: (message: string) => void
}

export async function runCli(args: string[], options: CliRunOptions = {}): Promise<void> {
  const startLocal = options.startLocal ?? (() => startSeedApp())
  const startCloud = options.startCloud ?? ((owner: string, repo: string) => runCloudMode(owner, repo))
  const writeStdout = options.writeStdout ?? ((message: string) => process.stdout.write(message))
  const writeStderr = options.writeStderr ?? ((message: string) => process.stderr.write(message))
  let commandContext: Record<string, unknown> = {
    argv: args.join(" "),
    mode: "unknown",
  }

  try {
    const command = parseCliArgs(args)
    if (command.type === "help") {
      commandContext = { ...commandContext, mode: "help" }
      writeStdout(`${usageText()}\n`)
      return
    }
    if (command.type === "local") {
      commandContext = { ...commandContext, mode: "local" }
      await startLocal()
      return
    }
    commandContext = {
      ...commandContext,
      mode: "cloud",
      owner: command.owner,
      repo: command.repo,
    }
    await startCloud(command.owner, command.repo)
  } catch (error) {
    if (error instanceof CliUsageError) {
      logDiagnostic("warn", "cli.usage_error", { message: error.message })
      writeStderr(`${error.message}\n`)
      process.exitCode = 1
      return
    }
    logDiagnosticError("cli.run_failed", error, commandContext)
    const message = error instanceof Error ? error.message : "Unknown failure"
    writeStderr(`${message}\n`)
    process.exitCode = 1
  }
}
