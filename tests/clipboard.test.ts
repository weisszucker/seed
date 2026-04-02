import { describe, expect, test } from "bun:test"

import { copyTextToClipboard } from "../src/effects/clipboard"

describe("clipboard helpers", () => {
  test("uses the macOS clipboard writer before OSC 52 on darwin", async () => {
    const renderer = {
      copyToClipboardOSC52() {
        throw new Error("OSC 52 should not be used when pbcopy succeeds")
      },
    }

    const copied = await copyTextToClipboard("hello", renderer, {
      platform: "darwin",
      async copyWithMacClipboard(text) {
        expect(text).toBe("hello")
        return true
      },
    })

    expect(copied).toBeTrue()
  })

  test("falls back to OSC 52 when the macOS clipboard writer fails", async () => {
    const renderer = {
      copyToClipboardOSC52(text: string) {
        expect(text).toBe("hello")
        return true
      },
    }

    const copied = await copyTextToClipboard("hello", renderer, {
      platform: "darwin",
      async copyWithMacClipboard() {
        return false
      },
    })

    expect(copied).toBeTrue()
  })
})
