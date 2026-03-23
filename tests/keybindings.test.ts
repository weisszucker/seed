import { describe, expect, test } from "bun:test"

import { DEFAULT_KEYBINDINGS, DEFAULT_LEADER_KEY } from "../src/core/types"
import {
  commandFromKeyEvent,
  EDITOR_TEXTAREA_KEYBINDINGS,
  resolveLeaderKeyEvent,
  shouldInsertEditorTab,
} from "../src/ui/keybindings"

describe("keybinding matching", () => {
  test("matches shift+s for saveAs after leader", () => {
    const command = commandFromKeyEvent(DEFAULT_KEYBINDINGS, {
      name: "s",
      ctrl: false,
      shift: true,
      meta: undefined,
      option: false,
      repeated: false,
      eventType: "press",
      sequence: "",
    } as never)

    expect(command).toBe("saveAs")
  })

  test("leader press enters pending mode", () => {
    const resolution = resolveLeaderKeyEvent(false, DEFAULT_LEADER_KEY, DEFAULT_KEYBINDINGS, {
      name: "l",
      ctrl: true,
      shift: false,
      meta: undefined,
      option: false,
      repeated: false,
      eventType: "press",
      sequence: "",
    } as never)

    expect(resolution).toEqual({ type: "leader_pressed" })
  })

  test("repeated leader press is a no-op", () => {
    const resolution = resolveLeaderKeyEvent(true, DEFAULT_LEADER_KEY, DEFAULT_KEYBINDINGS, {
      name: "l",
      ctrl: true,
      shift: false,
      meta: undefined,
      option: false,
      repeated: false,
      eventType: "press",
      sequence: "",
    } as never)

    expect(resolution).toEqual({ type: "leader_repeat" })
  })

  test("plain key without leader is ignored", () => {
    const resolution = resolveLeaderKeyEvent(false, DEFAULT_LEADER_KEY, DEFAULT_KEYBINDINGS, {
      name: "k",
      ctrl: false,
      shift: false,
      meta: undefined,
      option: false,
      repeated: false,
      eventType: "press",
      sequence: "",
    } as never)

    expect(resolution).toEqual({ type: "ignored" })
  })

  test("matches k for showShortcutHelp after leader", () => {
    const resolution = resolveLeaderKeyEvent(true, DEFAULT_LEADER_KEY, DEFAULT_KEYBINDINGS, {
      name: "k",
      ctrl: false,
      shift: false,
      meta: undefined,
      option: false,
      repeated: false,
      eventType: "press",
      sequence: "",
    } as never)

    expect(resolution).toEqual({ type: "command", command: "showShortcutHelp" })
  })

  test("matches c for createPath after leader", () => {
    const resolution = resolveLeaderKeyEvent(true, DEFAULT_LEADER_KEY, DEFAULT_KEYBINDINGS, {
      name: "c",
      ctrl: false,
      shift: false,
      meta: undefined,
      option: false,
      repeated: false,
      eventType: "press",
      sequence: "",
    } as never)

    expect(resolution).toEqual({ type: "command", command: "createPath" })
  })

  test("matches m for movePath after leader", () => {
    const resolution = resolveLeaderKeyEvent(true, DEFAULT_LEADER_KEY, DEFAULT_KEYBINDINGS, {
      name: "m",
      ctrl: false,
      shift: false,
      meta: undefined,
      option: false,
      repeated: false,
      eventType: "press",
      sequence: "",
    } as never)

    expect(resolution).toEqual({ type: "command", command: "movePath" })
  })

  test("matches e for toggleSidebar after leader", () => {
    const resolution = resolveLeaderKeyEvent(true, DEFAULT_LEADER_KEY, DEFAULT_KEYBINDINGS, {
      name: "e",
      ctrl: false,
      shift: false,
      meta: undefined,
      option: false,
      repeated: false,
      eventType: "press",
      sequence: "",
    } as never)

    expect(resolution).toEqual({ type: "command", command: "toggleSidebar" })
  })

  test("matches l for shiftFocus after leader", () => {
    const resolution = resolveLeaderKeyEvent(true, DEFAULT_LEADER_KEY, DEFAULT_KEYBINDINGS, {
      name: "l",
      ctrl: false,
      shift: false,
      meta: undefined,
      option: false,
      repeated: false,
      eventType: "press",
      sequence: "",
    } as never)

    expect(resolution).toEqual({ type: "command", command: "shiftFocus" })
  })

  test("editor home and end keys use visible line bounds", () => {
    expect(EDITOR_TEXTAREA_KEYBINDINGS).toContainEqual({
      name: "home",
      action: "visual-line-home",
    })
    expect(EDITOR_TEXTAREA_KEYBINDINGS).toContainEqual({
      name: "home",
      shift: true,
      action: "select-visual-line-home",
    })
    expect(EDITOR_TEXTAREA_KEYBINDINGS).toContainEqual({
      name: "end",
      action: "visual-line-end",
    })
    expect(EDITOR_TEXTAREA_KEYBINDINGS).toContainEqual({
      name: "end",
      shift: true,
      action: "select-visual-line-end",
    })
  })

  test("plain tab inserts indentation when editor is focused", () => {
    const shouldInsert = shouldInsertEditorTab(
      {
        focusedPane: "editor",
        modal: null,
      },
      false,
      {
        name: "tab",
        ctrl: false,
        shift: false,
        meta: false,
        option: false,
        repeated: false,
        eventType: "press",
        sequence: "",
      } as never,
    )

    expect(shouldInsert).toBe(true)
  })

  test("tab does not insert indentation while leader is pending", () => {
    const shouldInsert = shouldInsertEditorTab(
      {
        focusedPane: "editor",
        modal: null,
      },
      true,
      {
        name: "tab",
        ctrl: false,
        shift: false,
        meta: false,
        option: false,
        repeated: false,
        eventType: "press",
        sequence: "",
      } as never,
    )

    expect(shouldInsert).toBe(false)
  })
})
