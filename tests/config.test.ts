import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { getUserConfigPath, loadUserConfig } from "../src/effects/config"

const ORIGINAL_SEED_CONFIG_PATH = process.env.SEED_CONFIG_PATH

function restoreSeedConfigPath(): void {
  if (typeof ORIGINAL_SEED_CONFIG_PATH === "string") {
    process.env.SEED_CONFIG_PATH = ORIGINAL_SEED_CONFIG_PATH
    return
  }

  delete process.env.SEED_CONFIG_PATH
}

describe("config loading", () => {
  test("uses the default config path when no override is set", () => {
    try {
      delete process.env.SEED_CONFIG_PATH
      expect(getUserConfigPath()).toEndWith("/.seed/setting.json")
    } finally {
      restoreSeedConfigPath()
    }
  })

  test("uses SEED_CONFIG_PATH when provided", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "seed-config-"))

    try {
      const configPath = join(tempRoot, "e2e-setting.json")
      await writeFile(
        configPath,
        JSON.stringify({
          leaderKey: "ctrl+b",
          keybindings: {
            save: "w",
          },
        }),
      )

      process.env.SEED_CONFIG_PATH = configPath

      expect(getUserConfigPath()).toBe(configPath)
      await expect(loadUserConfig()).resolves.toEqual({
        leaderKey: "ctrl+b",
        keybindings: {
          save: "w",
        },
      })
    } finally {
      restoreSeedConfigPath()
      await rm(tempRoot, { recursive: true, force: true })
    }
  })
})
