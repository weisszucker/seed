import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { CommandOptions, CommandResult, CommandRunner } from "../src/cloud/command"
import { runCloudMode } from "../src/cloud/mode"
import { GithubClient } from "../src/cloud/github"
import { createNoopLogger } from "../src/logging/logger"
import type { CredentialStore } from "../src/cloud/credentials"

class MemoryCredentialStore implements CredentialStore {
  constructor(private readonly values: Record<string, string>) {}

  isAvailable(): boolean {
    return true
  }

  async get(key: string): Promise<string | null> {
    return this.values[key] ?? null
  }

  async set(key: string, value: string): Promise<void> {
    this.values[key] = value
  }

  async clear(key: string): Promise<void> {
    delete this.values[key]
  }
}

class RecordingRunner implements CommandRunner {
  readonly calls: string[] = []

  constructor(private readonly responses: Record<string, CommandResult>) {}

  async run(command: string, args: string[], _options?: CommandOptions): Promise<CommandResult> {
    const key = [command, ...args].join(" ")
    this.calls.push(key)
    return this.responses[key] ?? { stdout: "", stderr: "", exitCode: 0 }
  }
}

class FakeGithubClient extends GithubClient {
  authenticatedUserCalls = 0
  ensureRepositoryCalls = 0

  constructor() {
    super()
  }

  override async getAuthenticatedUser(_token: string): Promise<{ login: string }> {
    this.authenticatedUserCalls += 1
    return { login: "alice" }
  }

  override async ensureRepository(): Promise<{ remoteUrl: string; created: boolean }> {
    this.ensureRepositoryCalls += 1
    return {
      remoteUrl: "https://github.com/alice/notes.git",
      created: false,
    }
  }
}

describe("cloud mode", () => {
  let rootDir: string

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "seed-cloud-mode-"))
  })

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true })
  })

  test("uses the local fast path before any auth validation or repository bootstrap", async () => {
    const owner = "alice"
    const repo = "notes"
    const localPath = join(rootDir, owner, repo)
    await mkdir(localPath, { recursive: true })

    const runner = new RecordingRunner({
      [`git -C ${localPath} rev-parse --is-inside-work-tree`]: { stdout: "true\n", stderr: "", exitCode: 0 },
      [`git -C ${localPath} remote get-url origin`]: {
        stdout: "https://github.com/alice/notes.git\n",
        stderr: "",
        exitCode: 0,
      },
      [`git -C ${localPath} branch --show-current`]: { stdout: "main\n", stderr: "", exitCode: 0 },
      [`git -C ${localPath} fetch origin`]: { stdout: "", stderr: "", exitCode: 0 },
      [`git -C ${localPath} reset --hard origin/main`]: { stdout: "HEAD is now at abc123\n", stderr: "", exitCode: 0 },
    })
    const credentials = new MemoryCredentialStore({
      "seed-cloud-github": "cached-token",
    })
    const github = new FakeGithubClient()

    const startCalls: string[] = []
    await runCloudMode(owner, repo, {
      commandRunner: runner,
      credentialStore: credentials,
      githubClient: github,
      logger: createNoopLogger({ component: "test.cloud.mode" }),
      rootDir,
      startApp: async (startOptions = {}) => {
        const { cwd } = startOptions
        startCalls.push(cwd ?? "")
      },
    })

    expect(startCalls).toEqual([localPath])
    expect(github.authenticatedUserCalls).toBe(0)
    expect(github.ensureRepositoryCalls).toBe(0)
    expect(runner.calls).toEqual([
      `git -C ${localPath} rev-parse --is-inside-work-tree`,
      `git -C ${localPath} remote get-url origin`,
      `git -C ${localPath} branch --show-current`,
      `git -C ${localPath} fetch origin`,
      `git -C ${localPath} reset --hard origin/main`,
    ])
  })
})
