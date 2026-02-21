import { homedir } from "node:os"
import { join } from "node:path"

import type { KeybindingMap } from "../core/types"

type UserConfig = {
  keybindings?: Partial<KeybindingMap>
}

export function getUserConfigPath(): string {
  return join(homedir(), ".seed", "setting.json")
}

export async function loadUserKeybindings(): Promise<Partial<KeybindingMap>> {
  const path = getUserConfigPath()
  const file = Bun.file(path)
  if (!(await file.exists())) {
    return {}
  }

  const raw = await file.text()
  const parsed = JSON.parse(raw) as UserConfig
  if (!parsed.keybindings) {
    return {}
  }
  return parsed.keybindings
}
