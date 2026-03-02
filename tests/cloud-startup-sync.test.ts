import { describe, expect, test } from "bun:test"

import type { CommandOptions, CommandResult, CommandRunner } from "../src/cloud/command"
import { StartupSync } from "../src/cloud/startup-sync"

class RecordingRunner implements CommandRunner {
  readonly calls: string[] = []

  async run(command: string, args: string[], _options?: CommandOptions): Promise<CommandResult> {
    this.calls.push([command, ...args].join(" "))
    return { stdout: "", stderr: "", exitCode: 0 }
  }
}

describe("startup sync", () => {
  test("runs fetch then hard reset", async () => {
    const runner = new RecordingRunner()
    const sync = new StartupSync(runner)

    await sync.run("/tmp/repo")

    expect(runner.calls).toEqual([
      "git -C /tmp/repo fetch origin",
      "git -C /tmp/repo reset --hard origin/main",
    ])
  })
})
