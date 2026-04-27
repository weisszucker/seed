import { describe, expect, test } from "bun:test"

import type { CommandOptions, CommandResult, CommandRunner } from "../src/cloud/command"
import { ExitCommitService, formatUtcTimestamp } from "../src/cloud/exit-commit"

class CommitTestRunner implements CommandRunner {
  readonly calls: string[] = []
  statusOutput = ""

  async run(command: string, args: string[], _options?: CommandOptions): Promise<CommandResult> {
    const line = [command, ...args].join(" ")
    this.calls.push(line)

    if (args.includes("status") && args.includes("--porcelain")) {
      return {
        stdout: this.statusOutput,
        stderr: "",
        exitCode: 0,
      }
    }

    return {
      stdout: "",
      stderr: "",
      exitCode: 0,
    }
  }
}

describe("exit commit service", () => {
  test("formats UTC commit message without milliseconds", () => {
    expect(formatUtcTimestamp(new Date("2026-02-26T18:05:12.999Z"))).toBe("2026-02-26T18:05:12Z")
  })

  test("skips commit when working tree is clean", async () => {
    const runner = new CommitTestRunner()
    const service = new ExitCommitService(runner)

    const result = await service.commitIfChanged("/tmp/repo")

    expect(result).toEqual({ committed: false })
    expect(runner.calls).toEqual(["git -C /tmp/repo status --porcelain -- . :(exclude).seed-cloud.json"])
  })

  test("commits with UTC timestamp when changes exist", async () => {
    const runner = new CommitTestRunner()
    runner.statusOutput = " M notes.md\n"
    const service = new ExitCommitService(runner, () => new Date("2026-02-26T18:05:12.999Z"))

    const result = await service.commitIfChanged("/tmp/repo")

    expect(result).toEqual({
      committed: true,
      message: "2026-02-26T18:05:12Z",
    })
    expect(runner.calls).toContain("git -C /tmp/repo add -A -- . :(exclude).seed-cloud.json")
    expect(runner.calls).toContain("git -C /tmp/repo commit -m 2026-02-26T18:05:12Z")
  })
})
