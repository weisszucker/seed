import type { KeyEvent } from "@opentui/core"

import type { KeybindingMap } from "../core/types"

type CommandName = keyof KeybindingMap

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

function toNormalizedEvent(keyEvent: KeyEvent): ParsedBinding {
  const rawName = keyEvent.name ?? ""
  const inferredShift = rawName.length === 1 && rawName !== rawName.toLowerCase()
  return {
    ctrl: Boolean(keyEvent.ctrl),
    shift: Boolean(keyEvent.shift) || inferredShift,
    meta: Boolean(keyEvent.meta) || Boolean((keyEvent as { option?: boolean }).option),
    key: rawName.toLowerCase(),
  }
}

export function matchesBinding(binding: string, keyEvent: KeyEvent): boolean {
  const parsed = parseBinding(binding)
  const normalizedEvent = toNormalizedEvent(keyEvent)
  return (
    parsed.key === normalizedEvent.key &&
    parsed.ctrl === normalizedEvent.ctrl &&
    parsed.shift === normalizedEvent.shift &&
    parsed.meta === normalizedEvent.meta
  )
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
