import { homedir } from "node:os"
import { join } from "node:path"

import type { KeybindingMap } from "../core/types"

export type UserConfig = {
  leaderKey?: string
  keybindings?: Partial<KeybindingMap>
}

export function getUserConfigPath(): string {
  return join(homedir(), ".seed", "setting.json")
}

export async function loadUserConfig(): Promise<UserConfig> {
  const path = getUserConfigPath()
  const file = Bun.file(path)
  if (!(await file.exists())) {
    return {}
  }

  const raw = await file.text()
  const parsed = JSON.parse(raw) as UserConfig
  return {
    leaderKey: parsed.leaderKey,
    keybindings: parsed.keybindings ?? {},
  }
}
