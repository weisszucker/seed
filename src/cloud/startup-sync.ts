import type { CommandRunner } from "./command"

export class StartupSync {
  constructor(private readonly runner: CommandRunner) {}

  async run(repoPath: string): Promise<void> {
    await this.runner.run("git", ["-C", repoPath, "fetch", "origin"])
    await this.runner.run("git", ["-C", repoPath, "reset", "--hard", "origin/main"])
  }
}
