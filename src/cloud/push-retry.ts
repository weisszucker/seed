import type { CommandRunner } from "./command"
import { createNoopLogger, type Logger } from "../logging/logger"

export enum RetryDecision {
  RETRY = "RETRY",
  EXIT_WITHOUT_SAVE = "EXIT_WITHOUT_SAVE",
}

export interface RetryPrompt {
  askPushFailure(error: string): Promise<RetryDecision>
}

export class ConsoleRetryPrompt implements RetryPrompt {
  async askPushFailure(error: string): Promise<RetryDecision> {
    while (true) {
      console.info(`[seed-cloud] Push failed: ${error}`)
      const answer = prompt("Choose action: [r]etry or [e]xit without save:")?.trim().toLowerCase() ?? ""
      if (answer === "r" || answer === "retry") {
        return RetryDecision.RETRY
      }
      if (answer === "e" || answer === "exit" || answer === "exit without save") {
        const confirm =
          prompt("This discards local unpushed changes. Type 'discard' to confirm:")?.trim().toLowerCase() ?? ""
        if (confirm === "discard") {
          return RetryDecision.EXIT_WITHOUT_SAVE
        }
      }
    }
  }
}

export type PushResult =
  | { status: "pushed"; retryCount: number }
  | { status: "discarded"; retryCount: number }

function isRebaseConflict(stderr: string): boolean {
  const normalized = stderr.toLowerCase()
  return normalized.includes("conflict") || normalized.includes("could not apply")
}

export class PushRetryCoordinator {
  constructor(
    private readonly runner: CommandRunner,
    private readonly prompt: RetryPrompt = new ConsoleRetryPrompt(),
    private readonly logger: Logger = createNoopLogger({ component: "cloud.push_retry" }),
  ) {}

  async pushWithManualRetry(repoPath: string): Promise<PushResult> {
    let retryCount = 0
    let lastError: string | null = null
    const operation = this.logger.beginOperation("cloud.sync.push", { repo_path: repoPath })

    try {
      await this.runner.run("git", ["-C", repoPath, "push", "origin", "main"])
      operation.succeed({ retry_count: retryCount })
      return { status: "pushed", retryCount }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "git push failed"
      this.logger.warn("cloud.sync.push_initial_failure", {
        repo_path: repoPath,
        reason: lastError,
      })
    }

    while (true) {
      const decision = await this.prompt.askPushFailure(lastError ?? "git push failed")
      this.logger.info("cloud.sync.push_retry_decision", {
        retry_count: retryCount,
        decision,
      })
      if (decision === RetryDecision.EXIT_WITHOUT_SAVE) {
        await this.discardLocalChanges(repoPath)
        operation.succeed({
          retry_count: retryCount,
          outcome: "discarded",
        })
        return { status: "discarded", retryCount }
      }

      retryCount += 1
      try {
        await this.runner.run("git", ["-C", repoPath, "fetch", "origin"])
        await this.runner.run("git", ["-C", repoPath, "rebase", "origin/main"])
        await this.runner.run("git", ["-C", repoPath, "push", "origin", "main"])
        operation.succeed({ retry_count: retryCount })
        return { status: "pushed", retryCount }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Retry attempt failed"
        if (isRebaseConflict(message)) {
          await this.runner.run("git", ["-C", repoPath, "rebase", "--abort"], { allowFailure: true })
        }
        this.logger.warn("cloud.sync.push_retry_failed", {
          retry_count: retryCount,
          reason: message,
        })
        lastError = message
      }
    }
  }

  private async discardLocalChanges(repoPath: string): Promise<void> {
    await this.runner.run("git", ["-C", repoPath, "rebase", "--abort"], { allowFailure: true })
    await this.runner.run("git", ["-C", repoPath, "merge", "--abort"], { allowFailure: true })
    await this.runner.run("git", ["-C", repoPath, "reset", "--hard", "origin/main"])
    await this.runner.run("git", ["-C", repoPath, "clean", "-fd"])
  }
}
