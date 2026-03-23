import { access, mkdir, readdir, writeFile } from "node:fs/promises"
import { constants } from "node:fs"
import { dirname, join } from "node:path"
import { homedir } from "node:os"

import type { CommandRunner } from "./command"
import type { GithubClient } from "./github"
import { createNoopLogger, type Logger } from "../logging/logger"

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
    private readonly logger: Logger = createNoopLogger({ component: "cloud.bootstrap" }),
  ) {}

  async ensureReady(owner: string, repo: string, token: string, authenticatedLogin?: string): Promise<RepoContext> {
    const operation = this.logger.beginOperation("cloud.repo.bootstrap", {
      owner,
      repo,
    })
    const repoInfo = await this.githubClient.ensureRepository(owner, repo, token, authenticatedLogin)
    let remoteUrl = repoInfo.remoteUrl || formatRemoteHttps(owner, repo)
    const localPath = join(this.rootDir, owner, repo)
    let clonedThisRun = false

    await mkdir(dirname(localPath), { recursive: true })
    if (await pathExists(localPath)) {
      remoteUrl = await this.ensureLocalRemoteMatches(localPath, owner, repo)
    } else {
      await this.runner.run("git", ["clone", remoteUrl, localPath])
      clonedThisRun = true
    }

    await this.ensureHeadOnMain(localPath)
    await this.ensureInitializedRemote(localPath, clonedThisRun)
    operation.succeed({
      local_path: localPath,
      remote_url: remoteUrl,
      repository_created: repoInfo.created,
    })

    return {
      owner,
      repo,
      remoteUrl,
      localPath,
    }
  }

  async tryResolveLocalRepo(owner: string, repo: string): Promise<RepoContext | null> {
    const localPath = join(this.rootDir, owner, repo)
    if (!(await pathExists(localPath))) {
      return null
    }

    try {
      const remoteUrl = await this.ensureLocalRemoteMatches(localPath, owner, repo)
      await this.ensureHeadOnMain(localPath)
      return {
        owner,
        repo,
        remoteUrl,
        localPath,
      }
    } catch (error) {
      this.logger.warn("cloud.repo.fast_path_unavailable", {
        local_path: localPath,
        reason: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  private async ensureLocalRemoteMatches(localPath: string, owner: string, repo: string): Promise<string> {
    await this.runner.run("git", ["-C", localPath, "rev-parse", "--is-inside-work-tree"])
    const result = await this.runner.run("git", ["-C", localPath, "remote", "get-url", "origin"])
    const actualSlug = normalizeRemoteSlug(result.stdout.trim())
    const expectedSlug = `${owner.toLowerCase()}/${repo.toLowerCase()}`
    if (!actualSlug || actualSlug !== expectedSlug) {
      const error = new Error(
        [
          `Local repo remote mismatch at ${localPath}.`,
          `Expected origin to point to ${owner}/${repo}.`,
          `Found: ${result.stdout.trim() || "(missing)"}`,
        ].join(" "),
      )
      this.logger.error("cloud.repo.remote_mismatch", error, {
        local_path: localPath,
        expected_repo: expectedSlug,
        actual_repo: actualSlug ?? "(missing)",
      })
      throw error
    }

    return result.stdout.trim() || formatRemoteHttps(owner, repo)
  }

  private async ensureHeadOnMain(localPath: string): Promise<void> {
    const currentBranch = await this.runner.run("git", ["-C", localPath, "branch", "--show-current"], {
      allowFailure: true,
    })
    if (currentBranch.stdout.trim() === "main") {
      return
    }

    const hasMain = await this.runner.run("git", ["-C", localPath, "rev-parse", "--verify", "main"], {
      allowFailure: true,
    })
    if (hasMain.exitCode === 0) {
      await this.runner.run("git", ["-C", localPath, "checkout", "main"])
      return
    }
    await this.runner.run("git", ["-C", localPath, "checkout", "-B", "main"])
  }

  private async ensureInitializedRemote(localPath: string, clonedThisRun: boolean): Promise<void> {
    if (await this.hasRemoteMain(localPath)) {
      return
    }

    if (!clonedThisRun) {
      await this.runner.run("git", ["-C", localPath, "fetch", "origin"])
      if (await this.hasRemoteMain(localPath)) {
        return
      }
    }

    if (!(await directoryHasVisibleFiles(localPath))) {
      const readmePath = join(localPath, "README.md")
      await writeFile(readmePath, "# Seed Cloud Repo\n")
    }

    const hasHead = await this.runner.run("git", ["-C", localPath, "rev-parse", "--verify", "HEAD"], {
      allowFailure: true,
    })
    const status = await this.runner.run("git", ["-C", localPath, "status", "--porcelain"])

    await this.runner.run("git", ["-C", localPath, "add", "-A"])
    if (hasHead.exitCode !== 0) {
      await this.runner.run("git", ["-C", localPath, "commit", "--allow-empty", "-m", "Initialize seed cloud repository"])
    } else if (status.stdout.trim().length > 0) {
      await this.runner.run("git", ["-C", localPath, "commit", "-m", "Initialize seed cloud repository"])
    }
    await this.runner.run("git", ["-C", localPath, "push", "-u", "origin", "main"])
  }

  private async hasRemoteMain(localPath: string): Promise<boolean> {
    const remoteMain = await this.runner.run("git", ["-C", localPath, "rev-parse", "--verify", "refs/remotes/origin/main"], {
      allowFailure: true,
    })
    return remoteMain.exitCode === 0
  }
}
