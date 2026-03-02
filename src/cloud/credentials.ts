import type { CommandRunner } from "./command"
import { commandExists } from "./command"

export type CredentialBackend = {
  helper: string
  binary: string
}

const BACKEND_BY_PLATFORM: Record<string, CredentialBackend[]> = {
  darwin: [{ helper: "osxkeychain", binary: "git-credential-osxkeychain" }],
  win32: [
    { helper: "manager-core", binary: "git-credential-manager-core" },
    { helper: "manager", binary: "git-credential-manager" },
  ],
  linux: [
    { helper: "libsecret", binary: "git-credential-libsecret" },
    { helper: "manager-core", binary: "git-credential-manager-core" },
    { helper: "manager", binary: "git-credential-manager" },
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
    const result = await this.runner.run("git", ["credential", "fill"], {
      stdin: input,
      allowFailure: true,
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
    await this.runner.run("git", ["credential", "approve"], {
      stdin: toCredentialInput(host, username, value),
    })
  }

  async clear(key: string): Promise<void> {
    this.requireBackend()
    await this.ensureConfigured()

    const { host, username } = parseCredentialKey(key)
    await this.runner.run("git", ["credential", "reject"], {
      stdin: toCredentialInput(host, username),
      allowFailure: true,
    })
  }

  private async ensureConfigured(): Promise<void> {
    const backend = this.requireBackend()
    if (this.configured) {
      return
    }

    const existingResult = await this.runner.run(
      "git",
      ["config", "--global", "--get-all", "credential.helper"],
      { allowFailure: true },
    )

    const existingHelpers =
      existingResult.exitCode === 0
        ? existingResult.stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
        : []

    if (!existingHelpers.includes(backend.helper)) {
      await this.runner.run("git", ["config", "--global", "--add", "credential.helper", backend.helper])
    }

    this.configured = true
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
        "- Windows: manager-core or manager",
        "- Linux: git-credential-libsecret, manager-core, or manager",
      ].join("\n"),
    )
  }
}

export async function createCredentialStore(
  runner: CommandRunner,
  platform: NodeJS.Platform = process.platform,
): Promise<CredentialStore> {
  const backend = await resolveCredentialBackend(platform, async (binary) => commandExists(runner, binary))
  return new GitCredentialStore(runner, backend)
}
