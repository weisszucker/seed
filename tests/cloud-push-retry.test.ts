import { describe, expect, test } from "bun:test"

import type { CommandOptions, CommandResult, CommandRunner } from "../src/cloud/command"
import { PushRetryCoordinator, RetryDecision, type RetryPrompt } from "../src/cloud/push-retry"

class SequenceRunner implements CommandRunner {
  readonly calls: string[] = []
  pushAttempts = 0
  failPushAlways = false

  async run(command: string, args: string[], _options?: CommandOptions): Promise<CommandResult> {
    const call = [command, ...args].join(" ")
    this.calls.push(call)

    if (args.includes("push") && args.includes("main")) {
      this.pushAttempts += 1
      if (this.failPushAlways || this.pushAttempts === 1) {
        throw new Error("push failed")
      }
    }

    return { stdout: "", stderr: "", exitCode: 0 }
  }
}

class PromptSequence implements RetryPrompt {
  private index = 0

  constructor(private readonly decisions: RetryDecision[]) {}

  async askPushFailure(_error: string): Promise<RetryDecision> {
    const decision = this.decisions[this.index]
    this.index += 1
    return decision ?? RetryDecision.EXIT_WITHOUT_SAVE
  }
}

describe("push retry coordinator", () => {
  test("retries push after fetch and rebase", async () => {
    const runner = new SequenceRunner()
    const prompt = new PromptSequence([RetryDecision.RETRY])
    const coordinator = new PushRetryCoordinator(runner, prompt)

    const result = await coordinator.pushWithManualRetry("/tmp/repo")

    expect(result).toEqual({ status: "pushed", retryCount: 1 })
    expect(runner.calls).toEqual([
      "git -C /tmp/repo push origin main",
      "git -C /tmp/repo fetch origin",
      "git -C /tmp/repo rebase origin/main",
      "git -C /tmp/repo push origin main",
    ])
  })

  test("exit without save discards local changes", async () => {
    const runner = new SequenceRunner()
    runner.failPushAlways = true
    const prompt = new PromptSequence([RetryDecision.EXIT_WITHOUT_SAVE])
    const coordinator = new PushRetryCoordinator(runner, prompt)

    const result = await coordinator.pushWithManualRetry("/tmp/repo")

    expect(result).toEqual({ status: "discarded", retryCount: 0 })
    expect(runner.calls).toEqual([
      "git -C /tmp/repo push origin main",
      "git -C /tmp/repo rebase --abort",
      "git -C /tmp/repo merge --abort",
      "git -C /tmp/repo reset --hard origin/main",
      "git -C /tmp/repo clean -fd",
    ])
  })
})
