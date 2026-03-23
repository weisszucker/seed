import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import { CliUsageError, parseCliArgs, parseRepoSlug, runCli } from "../src/cli"

class MemoryCloudRepoStore {
  value: { owner: string; repo: string } | null = null
  saveCalls: Array<{ owner: string; repo: string }> = []

  async load(): Promise<{ owner: string; repo: string } | null> {
    return this.value
  }

  async save(repo: { owner: string; repo: string }): Promise<void> {
    this.value = repo
    this.saveCalls.push(repo)
  }
}

describe("cli parsing", () => {
  test("defaults to local mode with no args", () => {
    expect(parseCliArgs([])).toEqual({ type: "local" })
  })

  test("parses cloud command with valid slug", () => {
    expect(parseCliArgs(["cloud", "alice/notes"])).toEqual({
      type: "cloud",
      owner: "alice",
      repo: "notes",
    })
  })

  test("parses cloud command without slug", () => {
    expect(parseCliArgs(["cloud"])).toEqual({ type: "cloud" })
  })

  test("returns help mode", () => {
    expect(parseCliArgs(["--help"])).toEqual({ type: "help" })
  })

  test("rejects invalid cloud slug", () => {
    expect(() => parseCliArgs(["cloud", "bad-slug"])).toThrow(CliUsageError)
  })

  test("parses repo slug utility", () => {
    expect(parseRepoSlug("org/re.po")).toEqual({ owner: "org", repo: "re.po" })
    expect(parseRepoSlug("missing")).toBeNull()
  })
})

describe("cli cloud repo fallback", () => {
  let cloudRepoStore: MemoryCloudRepoStore
  let stderr = ""
  let startCloudCalls: Array<{ owner: string; repo: string }> = []

  beforeEach(() => {
    cloudRepoStore = new MemoryCloudRepoStore()
    stderr = ""
    startCloudCalls = []
    process.exitCode = 0
  })

  afterEach(() => {
    process.exitCode = 0
  })

  test("stores explicit cloud repo before starting cloud mode", async () => {
    await runCli(["cloud", "alice/notes"], {
      cloudRepoStore,
      startCloud: async (owner, repo) => {
        startCloudCalls.push({ owner, repo })
      },
      writeStderr: (message) => {
        stderr += message
      },
    })

    expect(cloudRepoStore.value).toEqual({ owner: "alice", repo: "notes" })
    expect(cloudRepoStore.saveCalls).toEqual([{ owner: "alice", repo: "notes" }])
    expect(startCloudCalls).toEqual([{ owner: "alice", repo: "notes" }])
    expect(stderr).toBe("")
  })

  test("reuses the last cloud repo when no slug is provided", async () => {
    cloudRepoStore.value = { owner: "alice", repo: "notes" }

    await runCli(["cloud"], {
      cloudRepoStore,
      startCloud: async (owner, repo) => {
        startCloudCalls.push({ owner, repo })
      },
      writeStderr: (message) => {
        stderr += message
      },
    })

    expect(cloudRepoStore.saveCalls).toEqual([])
    expect(startCloudCalls).toEqual([{ owner: "alice", repo: "notes" }])
    expect(stderr).toBe("")
  })

  test("shows an actionable message when no previous cloud repo exists", async () => {
    await runCli(["cloud"], {
      cloudRepoStore,
      startCloud: async (owner, repo) => {
        startCloudCalls.push({ owner, repo })
      },
      writeStderr: (message) => {
        stderr += message
      },
    })

    expect(startCloudCalls).toEqual([])
    expect(stderr).toContain('No previous cloud repo found. Run "seed cloud <owner>/<repo>" first.')
    expect(process.exitCode).toBe(1)
  })
})
