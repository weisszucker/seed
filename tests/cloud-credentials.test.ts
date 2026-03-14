import { describe, expect, test } from "bun:test"

import type { CommandOptions, CommandResult, CommandRunner } from "../src/cloud/command"
import { createCredentialStore, credentialCandidates, resolveCredentialBackend } from "../src/cloud/credentials"

class CredentialResolverRunner implements CommandRunner {
  configuredHelpers = ""
  execPath = "/git-core"
  availableCommands = new Set<string>()

  async run(command: string, args: string[], _options?: CommandOptions): Promise<CommandResult> {
    if (command === "security" && args.join(" ") === "--version") {
      if (this.availableCommands.has(command)) {
        return {
          stdout: "",
          stderr: "",
          exitCode: 0,
        }
      }
      throw new Error(`spawn ${command} ENOENT`)
    }

    if (args.join(" ") === "config --global --get-all credential.helper") {
      return {
        stdout: this.configuredHelpers,
        stderr: "",
        exitCode: this.configuredHelpers.length > 0 ? 0 : 1,
      }
    }

    if (args.join(" ") === "--exec-path") {
      return {
        stdout: `${this.execPath}\n`,
        stderr: "",
        exitCode: 0,
      }
    }

    if (args.join(" ") === "--version") {
      if (this.availableCommands.has(command)) {
        return {
          stdout: "",
          stderr: "",
          exitCode: 0,
        }
      }
      throw new Error(`spawn ${command} ENOENT`)
    }

    return {
      stdout: "",
      stderr: "",
      exitCode: 0,
    }
  }
}

describe("credential backend resolver", () => {
  test("lists known macOS helpers", () => {
    const candidates = credentialCandidates("darwin")
    expect(candidates).toEqual([
      { helper: "osxkeychain", binary: "git-credential-osxkeychain" },
      { helper: "manager", binary: "git-credential-manager" },
      { helper: "manager-core", binary: "git-credential-manager-core" },
    ])
  })

  test("recognizes current git credential manager binary on macOS", async () => {
    const backend = await resolveCredentialBackend("darwin", async (binary) => binary === "git-credential-manager")

    expect(backend).toEqual({ helper: "manager", binary: "git-credential-manager" })
  })

  test("prefers linux libsecret when both helpers exist", async () => {
    const backend = await resolveCredentialBackend("linux", async (binary) => {
      return (
        binary === "git-credential-libsecret" ||
        binary === "git-credential-manager" ||
        binary === "git-credential-manager-core"
      )
    })

    expect(backend).toEqual({ helper: "libsecret", binary: "git-credential-libsecret" })
  })

  test("returns null when no helper is available", async () => {
    const backend = await resolveCredentialBackend("linux", async () => false)
    expect(backend).toBeNull()
  })

  test("accepts configured path-based git credential manager on macOS", async () => {
    const runner = new CredentialResolverRunner()
    runner.availableCommands.add("security")
    runner.configuredHelpers = "/usr/local/share/gcm-core/git-credential-manager\n"

    const store = await createCredentialStore(runner, "darwin")

    expect(store.isAvailable()).toBe(true)
  })

  test("prefers configured osxkeychain over configured git credential manager on macOS", async () => {
    const runner = new CredentialResolverRunner()
    runner.availableCommands.add("security")
    runner.configuredHelpers = "/usr/local/share/gcm-core/git-credential-manager\nosxkeychain\n"
    const store = await createCredentialStore(runner, "darwin")

    expect(store.isAvailable()).toBe(true)
  })

  test("finds osxkeychain in git exec-path when it is not on PATH", async () => {
    const runner = new CredentialResolverRunner()
    runner.availableCommands.add("security")
    runner.execPath = "/Applications/Xcode.app/Contents/Developer/usr/libexec/git-core"
    runner.availableCommands.add("/Applications/Xcode.app/Contents/Developer/usr/libexec/git-core/git-credential-osxkeychain")

    const store = await createCredentialStore(runner, "darwin")

    expect(store.isAvailable()).toBe(true)
  })

  test("uses security tool as the macOS credential store when available", async () => {
    const runner = new CredentialResolverRunner()
    runner.availableCommands.add("security")

    const store = await createCredentialStore(runner, "darwin")

    expect(store.isAvailable()).toBe(true)
  })
})
