import type { KeyEvent } from "@opentui/core"

import type { EditorState, KeybindingMap } from "../core/types"

export type CommandName = keyof KeybindingMap

type ParsedBinding = {
  ctrl: boolean
  shift: boolean
  meta: boolean
  key: string
}

type EditorTextareaKeyBinding = {
  name: string
  action:
    | "visual-line-home"
    | "visual-line-end"
    | "select-visual-line-home"
    | "select-visual-line-end"
  ctrl?: boolean
  shift?: boolean
  meta?: boolean
  super?: boolean
}

function parseBinding(binding: string): ParsedBinding {
  const normalized = binding.toLowerCase().trim()
  const parts = normalized.split("+").map((part) => part.trim())
  const key = parts[parts.length - 1] ?? ""
  return {
    ctrl: parts.includes("ctrl"),
    shift: parts.includes("shift"),
    meta: parts.includes("meta") || parts.includes("alt"),
    key,
  }
}

export function matchesBinding(binding: string, keyEvent: KeyEvent): boolean {
  const parsed = parseBinding(binding)
  const eventKey = keyEvent.name.toLowerCase()
  const eventCtrl = Boolean(keyEvent.ctrl)
  const eventShift = Boolean(keyEvent.shift)
  const eventMeta = Boolean(keyEvent.meta)
  return (
    parsed.key === eventKey &&
    parsed.ctrl === eventCtrl &&
    parsed.shift === eventShift &&
    parsed.meta === eventMeta
  )
}

export function isLeaderKey(leaderKey: string, keyEvent: KeyEvent): boolean {
  return matchesBinding(leaderKey, keyEvent)
}

export function commandFromKeyEvent(
  keybindings: KeybindingMap,
  keyEvent: KeyEvent,
): CommandName | null {
  const commands = Object.keys(keybindings) as CommandName[]
  for (const command of commands) {
    if (matchesBinding(keybindings[command], keyEvent)) {
      return command
    }
  }
  return null
}

export type LeaderKeyResolution =
  | { type: "ignored" }
  | { type: "leader_pressed" }
  | { type: "leader_repeat" }
  | { type: "unmatched" }
  | { type: "command"; command: CommandName }

export function resolveLeaderKeyEvent(
  leaderPending: boolean,
  leaderKey: string,
  keybindings: KeybindingMap,
  keyEvent: KeyEvent,
): LeaderKeyResolution {
  if (isLeaderKey(leaderKey, keyEvent)) {
    return leaderPending ? { type: "leader_repeat" } : { type: "leader_pressed" }
  }

  if (!leaderPending) {
    return { type: "ignored" }
  }

  const command = commandFromKeyEvent(keybindings, keyEvent)
  if (!command) {
    return { type: "unmatched" }
  }

  return { type: "command", command }
}

export function formatKeybinding(leaderKey: string, binding: string): string {
  return `${leaderKey} ${binding}`
}

export const EDITOR_TEXTAREA_KEYBINDINGS: EditorTextareaKeyBinding[] = [
  { name: "home", action: "visual-line-home" },
  { name: "home", shift: true, action: "select-visual-line-home" },
  { name: "end", action: "visual-line-end" },
  { name: "end", shift: true, action: "select-visual-line-end" },
]

export function shouldInsertEditorTab(
  state: Pick<EditorState, "focusedPane" | "modal">,
  leaderPending: boolean,
  keyEvent: KeyEvent,
): boolean {
  return (
    state.focusedPane === "editor" &&
    state.modal === null &&
    !leaderPending &&
    keyEvent.name === "tab" &&
    !keyEvent.ctrl &&
    !keyEvent.meta &&
    !keyEvent.shift
  )
}
