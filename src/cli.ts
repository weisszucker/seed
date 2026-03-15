import { startSeedApp } from "./app/start"
import { LastCloudRepoStore, type CloudRepoRef } from "./cloud/last-repo"
import { runCloudMode } from "./cloud/mode"

export type ParsedCommand =
  | { type: "local" }
  | { type: "help" }
  | { type: "cloud"; owner?: string; repo?: string }

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
    "  seed cloud [<owner>/<repo>]",
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
    if (rest.length > 0) {
      throw new CliUsageError(`Expected at most one repo slug.\n\n${usageText()}`)
    }
    if (!second) {
      return { type: "cloud" }
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
  cloudRepoStore?: {
    load: () => Promise<CloudRepoRef | null>
    save: (repo: CloudRepoRef) => Promise<void>
  }
  writeStdout?: (message: string) => void
  writeStderr?: (message: string) => void
}

export async function runCli(args: string[], options: CliRunOptions = {}): Promise<void> {
  const startLocal = options.startLocal ?? (() => startSeedApp())
  const startCloud = options.startCloud ?? ((owner: string, repo: string) => runCloudMode(owner, repo))
  const cloudRepoStore = options.cloudRepoStore ?? new LastCloudRepoStore()
  const writeStdout = options.writeStdout ?? ((message: string) => process.stdout.write(message))
  const writeStderr = options.writeStderr ?? ((message: string) => process.stderr.write(message))

  try {
    const command = parseCliArgs(args)
    if (command.type === "help") {
      writeStdout(`${usageText()}\n`)
      return
    }
    if (command.type === "local") {
      await startLocal()
      return
    }
    const repo =
      typeof command.owner === "string" && typeof command.repo === "string"
        ? { owner: command.owner, repo: command.repo }
        : await cloudRepoStore.load()

    if (!repo) {
      throw new CliUsageError(`No previous cloud repo found. Run "seed cloud <owner>/<repo>" first.\n\n${usageText()}`)
    }

    if (typeof command.owner === "string" && typeof command.repo === "string") {
      await cloudRepoStore.save(repo)
    }

    await startCloud(repo.owner, repo.repo)
  } catch (error) {
    if (error instanceof CliUsageError) {
      writeStderr(`${error.message}\n`)
      process.exitCode = 1
      return
    }
    const message = error instanceof Error ? error.message : "Unknown failure"
    writeStderr(`${message}\n`)
    process.exitCode = 1
  }
}
