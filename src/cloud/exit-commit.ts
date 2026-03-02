import type { CommandRunner } from "./command"

export type CommitResult =
  | { committed: false }
  | { committed: true; message: string }

export function formatUtcTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z")
}

export class ExitCommitService {
  constructor(
    private readonly runner: CommandRunner,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async commitIfChanged(repoPath: string): Promise<CommitResult> {
    const status = await this.runner.run("git", ["-C", repoPath, "status", "--porcelain"])
    if (status.stdout.trim().length === 0) {
      return { committed: false }
    }

    const message = formatUtcTimestamp(this.now())
    await this.runner.run("git", ["-C", repoPath, "add", "-A"])
    await this.runner.run("git", ["-C", repoPath, "commit", "-m", message])
    return { committed: true, message }
  }
}
