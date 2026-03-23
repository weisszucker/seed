import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createSeedLogger, FileLogSink } from "../src/logging/logger"

const FIXED_LOG_DATE = "2026-03-14"
const FIXED_NOW = () => new Date(`${FIXED_LOG_DATE}T12:00:00.000Z`)

describe("seed logger", () => {
  test("writes runtime and error jsonl logs to disk", async () => {
    const logRoot = await mkdtemp(join(tmpdir(), "seed-log-"))

    try {
      const logger = await createSeedLogger({
        component: "test.logger",
        logRoot,
        sessionId: "session-1",
        sink: await FileLogSink.create(logRoot, FIXED_NOW),
      })

      logger.info("test.started", { repo: "alice/demo" })
      logger.error("test.failed", new Error("boom"), {
        access_token: "gho_secret_value",
      })
      await logger.close()

      const runtime = await readFile(join(logRoot, `runtime-${FIXED_LOG_DATE}.jsonl`), "utf8")
      const error = await readFile(join(logRoot, `error-${FIXED_LOG_DATE}.jsonl`), "utf8")

      expect(runtime).toContain("\"event\":\"test.started\"")
      expect(runtime).toContain("\"event\":\"test.failed\"")
      expect(runtime).toContain("\"session_id\":\"session-1\"")
      expect(runtime).toContain("\"access_token\":\"[REDACTED]\"")
      expect(runtime).not.toContain("gho_secret_value")
      expect(error).toContain("\"event\":\"test.failed\"")
    } finally {
      await rm(logRoot, { recursive: true, force: true })
    }
  })

  test("records operation timing and inherited context", async () => {
    const logRoot = await mkdtemp(join(tmpdir(), "seed-log-"))

    try {
      const logger = await createSeedLogger({
        component: "test.logger",
        logRoot,
        sessionId: "session-2",
        sink: await FileLogSink.create(logRoot, FIXED_NOW),
      })

      const child = logger.child({ owner: "alice", repo: "alice/demo" })
      const operation = child.beginOperation("cloud.sync.startup", { repo_path: "/tmp/demo" })
      operation.succeed()
      await logger.close()

      const runtime = await readFile(join(logRoot, `runtime-${FIXED_LOG_DATE}.jsonl`), "utf8")
      expect(runtime).toContain("\"event\":\"cloud.sync.startup.start\"")
      expect(runtime).toContain("\"event\":\"cloud.sync.startup.success\"")
      expect(runtime).toContain("\"owner\":\"alice\"")
      expect(runtime).toContain("\"repo\":\"alice/demo\"")
      expect(runtime).toContain("\"duration_ms\":")
    } finally {
      await rm(logRoot, { recursive: true, force: true })
    }
  })
})
