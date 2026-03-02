import { access, mkdir, readdir, writeFile } from "node:fs/promises"
import { constants } from "node:fs"
import { dirname, join } from "node:path"
import { homedir } from "node:os"

import type { CommandRunner } from "./command"
import type { GithubClient } from "./github"

export type RepoContext = {
  owner: string
  repo: string
  remoteUrl: string
  localPath: string
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function normalizeRemoteSlug(url: string): string | null {
  const trimmed = url.trim()
  const httpsMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i)
  if (httpsMatch) {
    return `${httpsMatch[1]?.toLowerCase()}/${httpsMatch[2]?.toLowerCase()}`
  }

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i)
  if (sshMatch) {
    return `${sshMatch[1]?.toLowerCase()}/${sshMatch[2]?.toLowerCase()}`
  }

  const sshProtocolMatch = trimmed.match(/^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i)
  if (sshProtocolMatch) {
    return `${sshProtocolMatch[1]?.toLowerCase()}/${sshProtocolMatch[2]?.toLowerCase()}`
  }

  return null
}

async function directoryHasVisibleFiles(path: string): Promise<boolean> {
  const entries = await readdir(path)
  return entries.some((entry) => entry !== ".git")
}

function formatRemoteHttps(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}.git`
}

export class RepoBootstrapper {
  constructor(
    private readonly runner: CommandRunner,
    private readonly githubClient: GithubClient,
    private readonly rootDir = join(homedir(), ".seed"),
  ) {}

  async ensureReady(owner: string, repo: string, token: string, authenticatedLogin: string): Promise<RepoContext> {
    const repoInfo = await this.githubClient.ensureRepository(owner, repo, token, authenticatedLogin)
    const remoteUrl = repoInfo.remoteUrl || formatRemoteHttps(owner, repo)
    const localPath = join(this.rootDir, owner, repo)

    await mkdir(dirname(localPath), { recursive: true })
    if (await pathExists(localPath)) {
      await this.ensureLocalRemoteMatches(localPath, owner, repo)
    } else {
      await this.runner.run("git", ["clone", remoteUrl, localPath])
    }

    await this.ensureMainBranch(localPath)
    await this.ensureInitializedRemote(localPath)
    await this.ensureMainTracking(localPath)

    return {
      owner,
      repo,
      remoteUrl,
      localPath,
    }
  }

  private async ensureLocalRemoteMatches(localPath: string, owner: string, repo: string): Promise<void> {
    await this.runner.run("git", ["-C", localPath, "rev-parse", "--is-inside-work-tree"])
    const result = await this.runner.run("git", ["-C", localPath, "remote", "get-url", "origin"])
    const actualSlug = normalizeRemoteSlug(result.stdout.trim())
    const expectedSlug = `${owner.toLowerCase()}/${repo.toLowerCase()}`
    if (!actualSlug || actualSlug !== expectedSlug) {
      throw new Error(
        [
          `Local repo remote mismatch at ${localPath}.`,
          `Expected origin to point to ${owner}/${repo}.`,
          `Found: ${result.stdout.trim() || "(missing)"}`,
        ].join(" "),
      )
    }
  }

  private async ensureMainBranch(localPath: string): Promise<void> {
    const hasMain = await this.runner.run("git", ["-C", localPath, "rev-parse", "--verify", "main"], {
      allowFailure: true,
    })
    if (hasMain.exitCode === 0) {
      await this.runner.run("git", ["-C", localPath, "checkout", "main"])
      return
    }
    await this.runner.run("git", ["-C", localPath, "checkout", "-B", "main"])
  }

  private async ensureInitializedRemote(localPath: string): Promise<void> {
    const remoteMain = await this.runner.run("git", ["-C", localPath, "ls-remote", "--heads", "origin", "main"])
    if (remoteMain.stdout.trim().length > 0) {
      return
    }

    if (!(await directoryHasVisibleFiles(localPath))) {
      const readmePath = join(localPath, "README.md")
      await writeFile(readmePath, "# Seed Cloud Repo\n")
    }

    await this.runner.run("git", ["-C", localPath, "add", "-A"])
    await this.runner.run("git", ["-C", localPath, "commit", "--allow-empty", "-m", "Initialize seed cloud repository"])
    await this.runner.run("git", ["-C", localPath, "push", "-u", "origin", "main"])
  }

  private async ensureMainTracking(localPath: string): Promise<void> {
    await this.runner.run("git", ["-C", localPath, "fetch", "origin"])
    await this.runner.run("git", ["-C", localPath, "branch", "--set-upstream-to", "origin/main", "main"], {
      allowFailure: true,
    })
  }
}
