import { describe, expect, test } from "bun:test"

import type { CommandOptions, CommandResult, CommandRunner } from "../src/cloud/command"
import { createGithubAuthenticatedRunner } from "../src/cloud/command"

class RecordingRunner implements CommandRunner {
  call:
    | {
        command: string
        args: string[]
        options?: CommandOptions
      }
    | null = null

  async run(command: string, args: string[], options?: CommandOptions): Promise<CommandResult> {
    this.call = { command, args, options }
    return { stdout: "", stderr: "", exitCode: 0 }
  }
}

describe("github authenticated runner", () => {
  test("injects github auth into git commands and disables terminal prompts", async () => {
    const base = new RecordingRunner()
    const runner = createGithubAuthenticatedRunner(base, "secret-token")

    await runner.run("git", ["fetch", "origin"], {
      env: {
        EXISTING_FLAG: "1",
      },
    })

    expect(base.call).not.toBeNull()
    expect(base.call?.command).toBe("git")
    expect(base.call?.args).toEqual(["fetch", "origin"])
    expect(base.call?.options?.env).toMatchObject({
      EXISTING_FLAG: "1",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
      GIT_TERMINAL_PROMPT: "0",
    })
    expect(base.call?.options?.env?.GIT_CONFIG_VALUE_0).toMatch(/^AUTHORIZATION: basic /)
    expect(base.call?.options?.env?.GIT_CONFIG_VALUE_0).not.toContain("secret-token")
  })

  test("appends to existing git config env entries", async () => {
    const base = new RecordingRunner()
    const runner = createGithubAuthenticatedRunner(base, "secret-token")

    await runner.run("git", ["push", "origin", "main"], {
      env: {
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "credential.helper",
        GIT_CONFIG_VALUE_0: "osxkeychain",
      },
    })

    expect(base.call?.options?.env).toMatchObject({
      GIT_CONFIG_COUNT: "2",
      GIT_CONFIG_KEY_0: "credential.helper",
      GIT_CONFIG_VALUE_0: "osxkeychain",
      GIT_CONFIG_KEY_1: "http.https://github.com/.extraheader",
      GIT_TERMINAL_PROMPT: "0",
    })
    expect(base.call?.options?.env?.GIT_CONFIG_VALUE_1).toMatch(/^AUTHORIZATION: basic /)
  })

  test("leaves non-git commands unchanged", async () => {
    const base = new RecordingRunner()
    const runner = createGithubAuthenticatedRunner(base, "secret-token")
    const options = {
      env: {
        PLAIN: "1",
      },
    }

    await runner.run("bun", ["test"], options)

    expect(base.call).toEqual({
      command: "bun",
      args: ["test"],
      options,
    })
  })
})
