import type { KeyEvent } from "@opentui/core"

import type { KeybindingMap } from "../core/types"

export type CommandName = keyof KeybindingMap

type ParsedBinding = {
  ctrl: boolean
  shift: boolean
  meta: boolean
  key: string
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

export function formatLeaderKeybinding(binding: string): string {
  return `<leader> ${binding}`
}
