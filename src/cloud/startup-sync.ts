import type { CommandRunner } from "./command"
import { createNoopLogger, type Logger } from "../logging/logger"

export class StartupSync {
  constructor(
    private readonly runner: CommandRunner,
    private readonly logger: Logger = createNoopLogger({ component: "cloud.startup_sync" }),
  ) {}

  async run(repoPath: string): Promise<void> {
    const operation = this.logger.beginOperation("cloud.sync.startup", { repo_path: repoPath })
    await this.runner.run("git", ["-C", repoPath, "fetch", "origin"])
    await this.runner.run("git", ["-C", repoPath, "reset", "--hard", "origin/main"])
    operation.succeed()
  }
}
