import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { CommandOptions, CommandResult, CommandRunner } from "../src/cloud/command"
import { RepoBootstrapper } from "../src/cloud/bootstrap"
import { GithubClient, type GithubRepoInfo } from "../src/cloud/github"

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
  calls: Array<{ owner: string; repo: string; token: string; authenticatedLogin?: string }> = []

  constructor(private readonly repoInfo: GithubRepoInfo) {
    super()
  }

  override async ensureRepository(
    owner: string,
    repo: string,
    token: string,
    authenticatedLogin?: string,
  ): Promise<GithubRepoInfo> {
    this.calls.push({ owner, repo, token, authenticatedLogin })
    return this.repoInfo
  }
}

describe("cloud repo bootstrap", () => {
  let rootDir: string

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "seed-cloud-bootstrap-"))
  })

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true })
  })

  test("reuses a healthy local repo without redundant remote bootstrap commands", async () => {
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
      [`git -C ${localPath} rev-parse --verify refs/remotes/origin/main`]: {
        stdout: "abc123\n",
        stderr: "",
        exitCode: 0,
      },
    })
    const github = new FakeGithubClient({
      remoteUrl: "https://github.com/alice/notes.git",
      created: false,
    })
    const bootstrapper = new RepoBootstrapper(runner, github, rootDir)

    const context = await bootstrapper.ensureReady(owner, repo, "cached-token")

    expect(context).toEqual({
      owner: "alice",
      repo: "notes",
      remoteUrl: "https://github.com/alice/notes.git",
      localPath,
    })
    expect(runner.calls).toEqual([
      `git -C ${localPath} rev-parse --is-inside-work-tree`,
      `git -C ${localPath} remote get-url origin`,
      `git -C ${localPath} branch --show-current`,
      `git -C ${localPath} rev-parse --verify refs/remotes/origin/main`,
    ])
    expect(runner.calls.some((call) => call.includes("ls-remote"))).toBeFalse()
    expect(runner.calls.some((call) => call.includes("fetch origin"))).toBeFalse()
    expect(runner.calls.some((call) => call.includes("checkout main"))).toBeFalse()
    expect(runner.calls.some((call) => call.includes("set-upstream-to"))).toBeFalse()
    expect(github.calls).toEqual([
      {
        owner: "alice",
        repo: "notes",
        token: "cached-token",
        authenticatedLogin: undefined,
      },
    ])
  })

  test("only checks out main when the worktree is on a different branch", async () => {
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
      [`git -C ${localPath} branch --show-current`]: { stdout: "feature\n", stderr: "", exitCode: 0 },
      [`git -C ${localPath} rev-parse --verify main`]: { stdout: "abc123\n", stderr: "", exitCode: 0 },
      [`git -C ${localPath} rev-parse --verify refs/remotes/origin/main`]: {
        stdout: "abc123\n",
        stderr: "",
        exitCode: 0,
      },
    })
    const github = new FakeGithubClient({
      remoteUrl: "https://github.com/alice/notes.git",
      created: false,
    })
    const bootstrapper = new RepoBootstrapper(runner, github, rootDir)

    await bootstrapper.ensureReady(owner, repo, "cached-token")

    expect(runner.calls).toContain(`git -C ${localPath} checkout main`)
    expect(runner.calls.filter((call) => call.includes("checkout main"))).toHaveLength(1)
  })
})
