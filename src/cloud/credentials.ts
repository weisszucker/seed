import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { homedir } from "node:os"

import type { CommandRunner } from "./command"
import { commandExists } from "./command"
import { createNoopLogger, type Logger } from "../logging/logger"

export type CredentialBackend = {
  helper: string
  binary: string
}

const SEED_CLOUD_CREDENTIAL_HOST = "seed-cloud-github"
const MACOS_KEYCHAIN_SERVICE = "seed-cloud"
const FALLBACK_CACHE_PATH = join(homedir(), ".seed", ".cloud-credentials.json")

function authDebugEnabled(): boolean {
  return process.env.SEED_CLOUD_AUTH_DEBUG === "1"
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

  for (const candidate of candidates) {
    const helper = helpers.find((configuredHelper) => helperMatchesCandidate(configuredHelper, candidate))
    if (helper) {
      return {
        ...candidate,
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

function normalizeCredentialIdentity(identity: string): string {
  return identity.trim().toLowerCase()
}

export function credentialKeyForOwner(owner: string): string {
  return `${SEED_CLOUD_CREDENTIAL_HOST}/${normalizeCredentialIdentity(owner)}`
}

export function credentialKeyForGithubHost(): string {
  return SEED_CLOUD_CREDENTIAL_HOST
}

export function credentialKeyForGithubAccount(): string {
  return `${SEED_CLOUD_CREDENTIAL_HOST}/seed-cloud`
}

export function legacyCredentialKeyForOwner(owner: string): string {
  return `github.com/${normalizeCredentialIdentity(owner)}`
}

export function legacyCredentialKeyForGithubHost(): string {
  return "github.com"
}

export function legacyCredentialKeyForGithubAccount(): string {
  return "github.com/seed-cloud"
}

export interface CredentialStore {
  isAvailable(): boolean
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  clear(key: string): Promise<void>
}

type CredentialCacheFile = {
  version: 1
  entries: Record<string, string>
}

export class LocalFileCredentialStore implements CredentialStore {
  constructor(private readonly cachePath = FALLBACK_CACHE_PATH) {}

  isAvailable(): boolean {
    return true
  }

  async get(key: string): Promise<string | null> {
    const cache = await this.readCache()
    return cache.entries[key] ?? null
  }

  async set(key: string, value: string): Promise<void> {
    const cache = await this.readCache()
    cache.entries[key] = value
    await this.writeCache(cache)
  }

  async clear(key: string): Promise<void> {
    const cache = await this.readCache()
    if (!(key in cache.entries)) {
      return
    }
    delete cache.entries[key]
    await this.writeCache(cache)
  }

  private async readCache(): Promise<CredentialCacheFile> {
    try {
      const raw = await readFile(this.cachePath, "utf8")
      const parsed = JSON.parse(raw) as Partial<CredentialCacheFile>
      if (parsed.version === 1 && parsed.entries && typeof parsed.entries === "object") {
        return {
          version: 1,
          entries: Object.fromEntries(
            Object.entries(parsed.entries).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
          ),
        }
      }
    } catch {
      return { version: 1, entries: {} }
    }

    return { version: 1, entries: {} }
  }

  private async writeCache(cache: CredentialCacheFile): Promise<void> {
    await mkdir(dirname(this.cachePath), { recursive: true })
    await writeFile(this.cachePath, `${JSON.stringify(cache, null, 2)}\n`, { mode: 0o600 })
    await chmod(this.cachePath, 0o600)
  }
}

export class CompositeCredentialStore implements CredentialStore {
  private warnedAboutFallback = false

  constructor(
    private readonly primary: CredentialStore,
    private readonly fallback: CredentialStore,
    private readonly logger: Logger = createNoopLogger({ component: "cloud.credentials" }),
  ) {}

  isAvailable(): boolean {
    return this.primary.isAvailable() || this.fallback.isAvailable()
  }

  async get(key: string): Promise<string | null> {
    if (this.primary.isAvailable()) {
      try {
        const value = await this.primary.get(key)
        if (value) {
          return value
        }
      } catch (error) {
        if (authDebugEnabled()) {
          const message = error instanceof Error ? error.message : "unknown error"
          this.logger.debug("cloud.credentials.primary_get_failed", {
            credential_key: key,
            reason: message,
          })
        }
      }
    }

    return await this.fallback.get(key)
  }

  async set(key: string, value: string): Promise<void> {
    let primaryStored = false
    if (this.primary.isAvailable()) {
      try {
        await this.primary.set(key, value)
        primaryStored = true
      } catch {
        if (!this.warnedAboutFallback) {
          console.error("[seed-cloud] Primary credential store unavailable; using local credential cache.")
          this.logger.warn("cloud.credentials.fallback_enabled", {
            reason: "primary_store_set_failed",
          })
          this.warnedAboutFallback = true
        }
      }
    }

    if (!primaryStored) {
      await this.fallback.set(key, value)
    }
  }

  async clear(key: string): Promise<void> {
    if (this.primary.isAvailable()) {
      try {
        await this.primary.clear(key)
      } catch {
        // Ignore primary clear failures and continue to fallback cleanup.
      }
    }
    await this.fallback.clear(key)
  }
}

export class MacOSKeychainStore implements CredentialStore {
  constructor(
    private readonly runner: CommandRunner,
    private readonly available: boolean,
    private readonly logger: Logger = createNoopLogger({ component: "cloud.credentials.keychain" }),
  ) {}

  isAvailable(): boolean {
    return this.available
  }

  async get(key: string): Promise<string | null> {
    this.requireAvailable()
    const result = await this.runner.run(
      "security",
      ["find-generic-password", "-a", key, "-s", MACOS_KEYCHAIN_SERVICE, "-w"],
      { allowFailure: true },
    )
    if (result.exitCode !== 0) {
      if (authDebugEnabled()) {
        this.logger.debug("cloud.credentials.keychain_miss", { credential_key: key })
      }
      return null
    }

    return result.stdout.trim() || null
  }

  async set(key: string, value: string): Promise<void> {
    this.requireAvailable()
    await this.runner.run("security", [
      "add-generic-password",
      "-U",
      "-a",
      key,
      "-s",
      MACOS_KEYCHAIN_SERVICE,
      "-w",
      value,
    ])
  }

  async clear(key: string): Promise<void> {
    this.requireAvailable()
    await this.runner.run("security", ["delete-generic-password", "-a", key, "-s", MACOS_KEYCHAIN_SERVICE], {
      allowFailure: true,
    })
  }

  private requireAvailable(): void {
    if (this.available) {
      return
    }

    throw new Error("macOS Keychain is not available.")
  }
}

function parseCredentialKey(key: string): { host: string; username?: string } {
  const parts = key.split("/")
  if (parts.length === 1 && parts[0]) {
    return { host: parts[0] }
  }
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { host: parts[0], username: parts[1] }
  }
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid credential key: "${key}"`)
  }
  throw new Error(`Invalid credential key: "${key}"`)
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

function toCredentialInput(host: string, username?: string, password?: string): string {
  const fields = [`protocol=https`, `host=${host}`]
  if (typeof username === "string" && username.length > 0) {
    fields.push(`username=${username}`)
  }
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
    private readonly logger: Logger = createNoopLogger({ component: "cloud.credentials.git" }),
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
      if (authDebugEnabled()) {
        this.logger.debug("cloud.credentials.git_fill_miss", { credential_key: key })
      }
      return null
    }

    const parsed = parseCredentialOutput(result.stdout)
    if (authDebugEnabled()) {
      const fields = Object.keys(parsed).sort().join(",")
      this.logger.debug("cloud.credentials.git_fill_fields", {
        credential_key: key,
        fields: fields || "(none)",
      })
    }
    return parsed.password ?? null
  }

  async set(key: string, value: string): Promise<void> {
    this.requireBackend()
    await this.ensureConfigured()

    const { host, username } = parseCredentialKey(key)
    if (authDebugEnabled()) {
      this.logger.debug("cloud.credentials.git_approve", { credential_key: key })
    }
    await this.runner.run("git", this.credentialCommandArgs("approve"), {
      stdin: toCredentialInput(host, username, value),
    })
  }

  async clear(key: string): Promise<void> {
    this.requireBackend()
    await this.ensureConfigured()

    const { host, username } = parseCredentialKey(key)
    if (authDebugEnabled()) {
      this.logger.debug("cloud.credentials.git_reject", { credential_key: key })
    }
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
  logger: Logger = createNoopLogger({ component: "cloud.credentials" }),
): Promise<CredentialStore> {
  const fallbackStore = new LocalFileCredentialStore()
  if (platform === "darwin") {
    return new CompositeCredentialStore(
      new MacOSKeychainStore(runner, await commandExists(runner, "security"), logger.child({
        component: "cloud.credentials.keychain",
      })),
      fallbackStore,
      logger,
    )
  }

  const backend =
    (await resolveConfiguredCredentialBackend(runner, platform)) ??
    (await resolveAvailableCredentialBackend(runner, platform))
  return new CompositeCredentialStore(
    new GitCredentialStore(runner, backend, logger.child({
      component: "cloud.credentials.git",
    })),
    fallbackStore,
    logger,
  )
}
