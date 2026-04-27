import type { CommandRunner } from "./command"
import { createNoopLogger, type Logger } from "../logging/logger"

export type CommitResult =
  | { committed: false }
  | { committed: true; message: string }

const CLOUD_METADATA_PATHSPEC = ":(exclude).seed-cloud.json"

export function formatUtcTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z")
}

export class ExitCommitService {
  constructor(
    private readonly runner: CommandRunner,
    private readonly now: () => Date = () => new Date(),
    private readonly logger: Logger = createNoopLogger({ component: "cloud.exit_commit" }),
  ) {}

  async commitIfChanged(repoPath: string): Promise<CommitResult> {
    const status = await this.runner.run("git", [
      "-C",
      repoPath,
      "status",
      "--porcelain",
      "--",
      ".",
      CLOUD_METADATA_PATHSPEC,
    ])
    if (status.stdout.trim().length === 0) {
      this.logger.info("cloud.exit_commit.clean_worktree", { repo_path: repoPath })
      return { committed: false }
    }

    const message = formatUtcTimestamp(this.now())
    await this.runner.run("git", ["-C", repoPath, "add", "-A", "--", ".", CLOUD_METADATA_PATHSPEC])
    await this.runner.run("git", ["-C", repoPath, "commit", "-m", message])
    this.logger.info("cloud.exit_commit.created", {
      repo_path: repoPath,
      commit_message: message,
    })
    return { committed: true, message }
  }
}
