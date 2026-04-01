import { homedir } from "node:os"
import { join } from "node:path"

import type { KeybindingMap } from "../core/types"

export type UserConfig = {
  leaderKey?: string
  keybindings?: Partial<KeybindingMap>
}

const SEED_CONFIG_PATH_ENV = "SEED_CONFIG_PATH"

export function getUserConfigPath(): string {
  const overridePath = process.env[SEED_CONFIG_PATH_ENV]?.trim()
  if (overridePath) {
    return overridePath
  }

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
