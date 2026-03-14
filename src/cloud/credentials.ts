import { join } from "node:path"

import type { CommandRunner } from "./command"
import { commandExists } from "./command"

export type CredentialBackend = {
  helper: string
  binary: string
}

const BACKEND_BY_PLATFORM: Record<string, CredentialBackend[]> = {
  darwin: [
    { helper: "osxkeychain", binary: "git-credential-osxkeychain" },
    { helper: "manager", binary: "git-credential-manager" },
    { helper: "manager-core", binary: "git-credential-manager-core" },
  ],
  win32: [
    { helper: "manager", binary: "git-credential-manager" },
    { helper: "manager-core", binary: "git-credential-manager-core" },
  ],
  linux: [
    { helper: "libsecret", binary: "git-credential-libsecret" },
    { helper: "manager", binary: "git-credential-manager" },
    { helper: "manager-core", binary: "git-credential-manager-core" },
  ],
}

export function credentialCandidates(platform: NodeJS.Platform): CredentialBackend[] {
  return BACKEND_BY_PLATFORM[platform] ?? []
}

export async function resolveCredentialBackend(
  platform: NodeJS.Platform,
  hasBinary: (binary: string) => Promise<boolean>,
): Promise<CredentialBackend | null> {
  for (const candidate of credentialCandidates(platform)) {
    if (await hasBinary(candidate.binary)) {
      return candidate
    }
  }
  return null
}

async function configuredCredentialHelpers(runner: CommandRunner): Promise<string[]> {
  const result = await runner.run("git", ["config", "--global", "--get-all", "credential.helper"], {
    allowFailure: true,
  })
  if (result.exitCode !== 0) {
    return []
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function helperMatchesCandidate(helper: string, candidate: CredentialBackend): boolean {
  if (helper.startsWith("!")) {
    return false
  }

  return (
    helper === candidate.helper ||
    helper === candidate.binary ||
    helper.endsWith(`/${candidate.binary}`) ||
    helper.endsWith(`\\${candidate.binary}`)
  )
}

async function resolveConfiguredCredentialBackend(
  runner: CommandRunner,
  platform: NodeJS.Platform,
): Promise<CredentialBackend | null> {
  const helpers = await configuredCredentialHelpers(runner)
  const candidates = credentialCandidates(platform)

  for (const helper of helpers) {
    const match = candidates.find((candidate) => helperMatchesCandidate(helper, candidate))
    if (match) {
      return {
        ...match,
        helper,
      }
    }
  }

  return null
}

async function gitExecPath(runner: CommandRunner): Promise<string | null> {
  const result = await runner.run("git", ["--exec-path"], { allowFailure: true })
  if (result.exitCode !== 0) {
    return null
  }

  const execPath = result.stdout.trim()
  return execPath.length > 0 ? execPath : null
}

async function resolveAvailableCredentialBackend(
  runner: CommandRunner,
  platform: NodeJS.Platform,
): Promise<CredentialBackend | null> {
  const directMatch = await resolveCredentialBackend(platform, async (binary) => commandExists(runner, binary))
  if (directMatch) {
    return directMatch
  }

  const execPath = await gitExecPath(runner)
  if (!execPath) {
    return null
  }

  return await resolveCredentialBackend(platform, async (binary) => commandExists(runner, join(execPath, binary)))
}

export function credentialKeyForOwner(owner: string): string {
  return `github.com/${owner}`
}

export interface CredentialStore {
  isAvailable(): boolean
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  clear(key: string): Promise<void>
}

function parseCredentialKey(key: string): { host: string; username: string } {
  const parts = key.split("/")
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid credential key: "${key}"`)
  }
  return { host: parts[0], username: parts[1] }
}

function parseCredentialOutput(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const [key, ...rest] = line.split("=")
    if (!key || rest.length === 0) {
      continue
    }
    result[key.trim()] = rest.join("=").trim()
  }
  return result
}

function toCredentialInput(host: string, username: string, password?: string): string {
  const fields = [`protocol=https`, `host=${host}`, `username=${username}`]
  if (typeof password === "string") {
    fields.push(`password=${password}`)
  }
  return `${fields.join("\n")}\n\n`
}

export class GitCredentialStore implements CredentialStore {
  private configured = false

  constructor(
    private readonly runner: CommandRunner,
    private readonly backend: CredentialBackend | null,
  ) {}

  isAvailable(): boolean {
    return this.backend !== null
  }

  async get(key: string): Promise<string | null> {
    this.requireBackend()
    await this.ensureConfigured()

    const { host, username } = parseCredentialKey(key)
    const input = toCredentialInput(host, username)
    const result = await this.runner.run("git", this.credentialCommandArgs("fill", { nonInteractive: true }), {
      stdin: input,
      allowFailure: true,
      env: {
        GCM_INTERACTIVE: "never",
        GIT_TERMINAL_PROMPT: "0",
      },
    })
    if (result.exitCode !== 0) {
      return null
    }

    const parsed = parseCredentialOutput(result.stdout)
    return parsed.password ?? null
  }

  async set(key: string, value: string): Promise<void> {
    this.requireBackend()
    await this.ensureConfigured()

    const { host, username } = parseCredentialKey(key)
    await this.runner.run("git", this.credentialCommandArgs("approve"), {
      stdin: toCredentialInput(host, username, value),
    })
  }

  async clear(key: string): Promise<void> {
    this.requireBackend()
    await this.ensureConfigured()

    const { host, username } = parseCredentialKey(key)
    await this.runner.run("git", this.credentialCommandArgs("reject"), {
      stdin: toCredentialInput(host, username),
      allowFailure: true,
    })
  }

  private async ensureConfigured(): Promise<void> {
    const backend = this.requireBackend()
    if (this.configured) {
      return
    }

    const existingHelpers = await configuredCredentialHelpers(this.runner)

    if (!existingHelpers.includes(backend.helper)) {
      await this.runner.run("git", ["config", "--global", "--add", "credential.helper", backend.helper])
    }

    this.configured = true
  }

  private credentialCommandArgs(
    action: "fill" | "approve" | "reject",
    options: { nonInteractive?: boolean } = {},
  ): string[] {
    const backend = this.requireBackend()
    const args = [
      "-c",
      "credential.helper=",
      "-c",
      `credential.helper=${backend.helper}`,
    ]
    if (options.nonInteractive) {
      args.push("-c", "credential.interactive=never")
    }
    args.push("credential", action)
    return args
  }

  private requireBackend(): CredentialBackend {
    if (this.backend) {
      return this.backend
    }
    throw new Error(
      [
        "No secure Git credential helper is available.",
        "Install Git Credential Manager or an OS helper and retry:",
        "- macOS: git-credential-osxkeychain",
        "- Windows: manager-core",
        "- Linux: git-credential-libsecret or manager-core",
      ].join("\n"),
    )
  }
}

export async function createCredentialStore(
  runner: CommandRunner,
  platform: NodeJS.Platform = process.platform,
): Promise<CredentialStore> {
  const backend =
    (await resolveConfiguredCredentialBackend(runner, platform)) ??
    (await resolveAvailableCredentialBackend(runner, platform))
  return new GitCredentialStore(runner, backend)
}
