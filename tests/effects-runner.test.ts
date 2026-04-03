import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { runEffect } from "../src/effects/runner"
import { getDeveloperTodoListPath } from "../src/effects/todo"

describe("clipboard effect runner", () => {
  test("reports success when the system clipboard writer succeeds", async () => {
    const renderer = {
      copyToClipboardOSC52() {
        throw new Error("OSC 52 should not be used when the system clipboard succeeds")
      },
    }

    const events = await runEffect(
      {
        type: "COPY_TO_CLIPBOARD",
        text: "hello",
      },
      renderer as never,
      {
        async copyTextToClipboard(text: string) {
          expect(text).toBe("hello")
          return true
        },
      },
    )

    expect(events).toEqual([{ type: "CLIPBOARD_COPY_SUCCEEDED" }])
  })

  test("reports success when the renderer copies text to the clipboard", async () => {
    const renderer = {
      copyToClipboardOSC52(text: string) {
        expect(text).toBe("hello")
        return true
      },
    }

    const events = await runEffect(
      {
        type: "COPY_TO_CLIPBOARD",
        text: "hello",
      },
      renderer as never,
    )

    expect(events).toEqual([{ type: "CLIPBOARD_COPY_SUCCEEDED" }])
  })

  test("reports a terminal support failure when clipboard copy is unavailable", async () => {
    const renderer = {
      copyToClipboardOSC52() {
        return false
      },
    }

    const events = await runEffect(
      {
        type: "COPY_TO_CLIPBOARD",
        text: "hello",
      },
      renderer as never,
      {
        async copyTextToClipboard() {
          return false
        },
      },
    )

    expect(events).toEqual([
      {
        type: "CLIPBOARD_COPY_FAILED",
        message: "Clipboard copy is not supported in this terminal",
      },
    ])
  })
})

describe("developer todo effect runner", () => {
  test("loads the developer todo list from the workspace", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "seed-runner-todo-"))

    try {
      await mkdir(join(rootPath, ".seed"), { recursive: true })
      await Bun.write(getDeveloperTodoListPath(rootPath), "- [ ] Ship feature\n")

      const events = await runEffect(
        {
          type: "LOAD_DEVELOPER_TODO_LIST",
          rootPath,
        },
        {} as never,
      )

      expect(events).toEqual([
        {
          type: "DEVELOPER_TODO_LIST_LOADED",
          items: [{ text: "Ship feature", done: false }],
        },
      ])
    } finally {
      await rm(rootPath, { recursive: true, force: true })
    }
  })

  test("saves the developer todo list into the workspace", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "seed-runner-todo-"))

    try {
      const events = await runEffect(
        {
          type: "SAVE_DEVELOPER_TODO_LIST",
          rootPath,
          items: [{ text: "Ship feature", done: true }],
        },
        {} as never,
      )

      expect(events).toEqual([{ type: "DEVELOPER_TODO_LIST_SAVED" }])
      expect(await Bun.file(getDeveloperTodoListPath(rootPath)).text()).toBe("- [x] Ship feature\n")
    } finally {
      await rm(rootPath, { recursive: true, force: true })
    }
  })
})
