import { describe, expect, test } from "bun:test"

import { DEFAULT_KEYBINDINGS } from "../src/core/types"
import { commandFromKeyEvent } from "../src/ui/keybindings"

describe("keybinding matching", () => {
  test("matches ctrl+shift+s for saveAs", () => {
    const command = commandFromKeyEvent(DEFAULT_KEYBINDINGS, {
      name: "s",
      ctrl: true,
      shift: true,
      meta: undefined,
      option: false,
      repeated: false,
      eventType: "press",
      sequence: "",
    } as never)

    expect(command).toBe("saveAs")
  })

  test("matches ctrl+k for showShortcutHelp", () => {
    const command = commandFromKeyEvent(DEFAULT_KEYBINDINGS, {
      name: "k",
      ctrl: true,
      shift: false,
      meta: undefined,
      option: false,
      repeated: false,
      eventType: "press",
      sequence: "",
    } as never)

    expect(command).toBe("showShortcutHelp")
  })
})
