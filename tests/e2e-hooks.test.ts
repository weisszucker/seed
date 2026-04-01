import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { SeedRuntime } from "../src/app/runtime"
import { createE2eHookSinkFromEnv, createMemoryE2eHookSink, type E2eHookEvent } from "../src/e2e/hooks"

async function waitForEvent(
  events: E2eHookEvent[],
  predicate: (event: E2eHookEvent) => boolean,
  timeoutMs = 1000,
): Promise<E2eHookEvent> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const match = events.find(predicate)
    if (match) {
      return match
    }

    await Bun.sleep(1)
  }

  throw new Error("Timed out waiting for hook event")
}

describe("E2E hook sinks", () => {
  test("requires SEED_E2E_EVENT_LOG when E2E hooks are enabled from env", () => {
    expect(() => createE2eHookSinkFromEnv({ SEED_E2E: "1" })).toThrow(
      "SEED_E2E_EVENT_LOG is required when SEED_E2E=1",
    )
  })

  test("writes JSONL events when configured from env", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "seed-e2e-hooks-"))

    try {
      const logPath = join(tempRoot, "events.jsonl")
      const sink = createE2eHookSinkFromEnv({
        SEED_E2E: "1",
        SEED_E2E_EVENT_LOG: logPath,
      })

      sink?.emit({ type: "runtime_idle", seq: 3 })

      const content = await readFile(logPath, "utf8")
      expect(content.trim()).toBe('{"type":"runtime_idle","seq":3}')
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })
})

describe("SeedRuntime E2E hooks", () => {
  test("emits startup readiness after config and file tree have both settled", async () => {
    const { events, sink } = createMemoryE2eHookSink()
    const runtime = new SeedRuntime(
      "/tmp/work",
      {} as never,
      async (effect) => {
        switch (effect.type) {
          case "LOAD_CONFIG":
            return [{ type: "CONFIG_LOADED", keybindings: {} }]

          case "LOAD_FILE_TREE":
            return [{
              type: "FILE_TREE_LOADED",
              nodes: [{
                name: "note.md",
                path: "/tmp/work/note.md",
                isDirectory: false,
                children: [],
              }],
            }]

          default:
            return []
        }
      },
      sink,
    )

    runtime.dispatch({ type: "APP_STARTED" })

    await waitForEvent(events, (event) => event.type === "runtime_idle")

    expect(events.map((event) => event.type)).toEqual([
      "app_started",
      "effect_started",
      "effect_finished",
      "effect_started",
      "effect_finished",
      "state_published",
      "config_loaded",
      "state_published",
      "file_tree_loaded",
      "initial_render_complete",
      "runtime_idle",
    ])

    const initialRenderComplete = events.find((event) => event.type === "initial_render_complete")
    const configLoaded = events.find((event) => event.type === "config_loaded")
    const fileTreeLoaded = events.find((event) => event.type === "file_tree_loaded")
    const runtimeIdle = events.find((event) => event.type === "runtime_idle")

    expect(configLoaded?.seq).toBe(1)
    expect(fileTreeLoaded?.seq).toBe(2)
    expect(initialRenderComplete?.seq).toBe(2)
    expect(runtimeIdle?.seq).toBe(2)
  })

  test("does not emit initial_render_complete before APP_STARTED even if earlier state publishes occur", async () => {
    const { events, sink } = createMemoryE2eHookSink()
    const runtime = new SeedRuntime(
      "/tmp/work",
      {} as never,
      async (effect) => {
        switch (effect.type) {
          case "LOAD_CONFIG":
            return [{ type: "CONFIG_LOADED", keybindings: {} }]

          case "LOAD_FILE_TREE":
            return [{ type: "FILE_TREE_LOADED", nodes: [] }]

          default:
            return []
        }
      },
      sink,
    )

    runtime.dispatch({ type: "EDITOR_TEXT_CHANGED", text: "prefill" })
    await waitForEvent(events, (event) => event.type === "runtime_idle" && event.seq === 1)

    expect(events.some((event) => event.type === "initial_render_complete")).toBeFalse()

    runtime.dispatch({ type: "APP_STARTED" })
    await waitForEvent(events, (event) => event.type === "initial_render_complete")

    const initialRenderComplete = events.find((event) => event.type === "initial_render_complete")
    expect(initialRenderComplete?.seq).toBe(3)
  })

  test("emits runtime_idle after save-then-continue pending action settles", async () => {
    const { events, sink } = createMemoryE2eHookSink()
    const runtime = new SeedRuntime(
      "/tmp/work",
      {} as never,
      async (effect) => {
        switch (effect.type) {
          case "SAVE_FILE":
            return [{ type: "FILE_SAVED", path: effect.path }]

          default:
            return []
        }
      },
      sink,
    )

    runtime.dispatch({
      type: "FILE_LOADED",
      path: "/tmp/work/note.md",
      text: "old",
    })
    runtime.dispatch({ type: "EDITOR_TEXT_CHANGED", text: "new" })
    runtime.dispatch({ type: "REQUEST_NEW_FILE" })

    const afterSeq = runtime.getLatestHookSeq()

    runtime.dispatch({ type: "PROMPT_CHOOSE_SAVE" })

    const idle = await waitForEvent(
      events,
      (event) => event.type === "runtime_idle" && event.seq > afterSeq,
    )

    expect(idle.seq).toBeGreaterThan(afterSeq)
    expect(runtime.getState().document.path).toBeNull()
    expect(runtime.getState().document.text).toBe("")
    expect(runtime.getState().statusMessage).toBe("New untitled file")

    const publishedEvents = events
      .filter((event): event is Extract<E2eHookEvent, { type: "state_published" }> => event.type === "state_published")
      .map((event) => event.event)

    expect(publishedEvents).toEqual([
      "FILE_LOADED",
      "EDITOR_TEXT_CHANGED",
      "REQUEST_NEW_FILE",
      "PROMPT_CHOOSE_SAVE",
      "FILE_SAVED",
    ])
  })

  test("emits app_exit for graceful quit effects", async () => {
    const { events, sink } = createMemoryE2eHookSink()
    const runtime = new SeedRuntime(
      "/tmp/work",
      {} as never,
      async () => [],
      sink,
    )

    runtime.dispatch({ type: "REQUEST_QUIT" })
    await waitForEvent(events, (event) => event.type === "app_exit")

    expect(events.map((event) => event.type)).toContain("app_exit")
  })
})
