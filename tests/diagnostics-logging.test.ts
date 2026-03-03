import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { initializeDiagnosticsLog, logDiagnostic, setDiagnosticLogPathForTests } from "../src/diagnostics/logging"

describe("diagnostics logging", () => {
  let logPath = ""

  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), "seed-log-test-"))
    logPath = join(dir, "log")
    setDiagnosticLogPathForTests(logPath)
  })

  afterEach(() => {
    setDiagnosticLogPathForTests(null)
  })

  test("clears log on startup initialization", async () => {
    initializeDiagnosticsLog()
    logDiagnostic("error", "first_event", { message: "first" })
    initializeDiagnosticsLog()

    const content = await readFile(logPath, "utf8")
    expect(content).toBe("")
  })

  test("redacts sensitive values", async () => {
    initializeDiagnosticsLog()
    logDiagnostic("error", "secret_test", {
      token: "ghp_abcdefghijklmnopqrstuvwxyz123456",
      fine_grained_token: "github_pat_abcdefghijklmnopqrstuvwxyz123456",
      authorization: "Bearer top-secret-token",
      text: "user document line should never be logged",
      error: "request failed with ghp_abcdefghijklmnopqrstuvwxyz123456",
      remote: "https://alice:super-secret@example.com/private/repo.git",
    })

    const line = (await readFile(logPath, "utf8")).trim()
    const record = JSON.parse(line) as Record<string, string>

    expect(record.token).toBe("[REDACTED]")
    expect(record.fine_grained_token).toBe("[REDACTED]")
    expect(record.authorization).toBe("[REDACTED]")
    expect(record.text).toBe("[REDACTED]")
    expect(record.error).not.toContain("ghp_")
    expect(record.remote).not.toContain("alice:super-secret@")
  })
})
