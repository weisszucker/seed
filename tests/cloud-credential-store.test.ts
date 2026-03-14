import { describe, expect, test } from "bun:test"

import type { CommandOptions, CommandResult, CommandRunner } from "../src/cloud/command"
import { GitCredentialStore } from "../src/cloud/credentials"

class CredentialRunner implements CommandRunner {
  readonly calls: string[] = []
  existingHelpers = ""
  lastEnv: Record<string, string | undefined> | undefined

  async run(command: string, args: string[], options?: CommandOptions): Promise<CommandResult> {
    this.calls.push([command, ...args].join(" "))
    this.lastEnv = options?.env

    if (args.join(" ") === "config --global --get-all credential.helper") {
      return {
        stdout: this.existingHelpers,
        stderr: "",
        exitCode: this.existingHelpers.length > 0 ? 0 : 1,
      }
    }

    if (args.join(" ") === "-c credential.helper= -c credential.helper=osxkeychain -c credential.interactive=never credential fill") {
      return {
        stdout: "",
        stderr: "",
        exitCode: 1,
      }
    }

    return {
      stdout: "",
      stderr: "",
      exitCode: 0,
    }
  }
}

describe("git credential store config", () => {
  test("adds helper without overwriting existing multiple values", async () => {
    const runner = new CredentialRunner()
    runner.existingHelpers = "store\ncache --timeout=3600\n"
    const store = new GitCredentialStore(runner, {
      helper: "osxkeychain",
      binary: "git-credential-osxkeychain",
    })

    await store.get("github.com/alice")

    expect(runner.calls).toContain("git config --global --get-all credential.helper")
    expect(runner.calls).toContain("git config --global --add credential.helper osxkeychain")
    expect(runner.calls).toContain(
      "git -c credential.helper= -c credential.helper=osxkeychain -c credential.interactive=never credential fill",
    )
    expect(runner.lastEnv).toEqual({
      GCM_INTERACTIVE: "never",
      GIT_TERMINAL_PROMPT: "0",
    })
  })

  test("does not add helper when already present", async () => {
    const runner = new CredentialRunner()
    runner.existingHelpers = "osxkeychain\n"
    const store = new GitCredentialStore(runner, {
      helper: "osxkeychain",
      binary: "git-credential-osxkeychain",
    })

    await store.get("github.com/alice")

    expect(runner.calls).toContain("git config --global --get-all credential.helper")
    expect(runner.calls).not.toContain("git config --global --add credential.helper osxkeychain")
    expect(runner.calls).toContain(
      "git -c credential.helper= -c credential.helper=osxkeychain -c credential.interactive=never credential fill",
    )
  })

  test("scopes credential approve and reject to the selected helper", async () => {
    const runner = new CredentialRunner()
    const store = new GitCredentialStore(runner, {
      helper: "/usr/local/share/gcm-core/git-credential-manager",
      binary: "git-credential-manager",
    })

    await store.set("github.com/alice", "token")
    await store.clear("github.com/alice")

    expect(runner.calls).toContain(
      "git -c credential.helper= -c credential.helper=/usr/local/share/gcm-core/git-credential-manager credential approve",
    )
    expect(runner.calls).toContain(
      "git -c credential.helper= -c credential.helper=/usr/local/share/gcm-core/git-credential-manager credential reject",
    )
  })
})
