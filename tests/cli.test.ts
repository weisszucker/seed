import { describe, expect, test } from "bun:test"

import { CliUsageError, parseCliArgs, parseRepoSlug } from "../src/cli"

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
