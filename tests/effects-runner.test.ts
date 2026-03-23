import { describe, expect, test } from "bun:test"

import { runEffect } from "../src/effects/runner"

describe("clipboard effect runner", () => {
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
    )

    expect(events).toEqual([
      {
        type: "CLIPBOARD_COPY_FAILED",
        message: "Clipboard copy is not supported in this terminal",
      },
    ])
  })
})
