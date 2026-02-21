import type { CliRenderer } from "@opentui/core"

import type { AppEffect, AppEvent } from "../core/types"
import { loadUserKeybindings } from "./config"
import { loadFileTree, readTextFile, writeTextFile } from "./fs"

export async function runEffect(effect: AppEffect, renderer: CliRenderer): Promise<AppEvent[]> {
  try {
    switch (effect.type) {
      case "LOAD_CONFIG": {
        const keybindings = await loadUserKeybindings()
        return [{ type: "CONFIG_LOADED", keybindings }]
      }

      case "LOAD_FILE_TREE": {
        const nodes = await loadFileTree(effect.rootPath)
        return [{ type: "FILE_TREE_LOADED", nodes }]
      }

      case "LOAD_FILE": {
        const text = await readTextFile(effect.path)
        return [{ type: "FILE_LOADED", path: effect.path, text }]
      }

      case "SAVE_FILE": {
        await writeTextFile(effect.path, effect.text)
        return [{ type: "FILE_SAVED", path: effect.path }]
      }

      case "EXIT_APP":
        renderer.destroy()
        return []

      default:
        return []
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"

    if (effect.type === "LOAD_CONFIG") {
      return [{ type: "CONFIG_LOAD_FAILED", message: `Failed to load config: ${message}` }]
    }
    if (effect.type === "LOAD_FILE_TREE") {
      return [{ type: "FILE_TREE_LOAD_FAILED", message: `Failed to load file tree: ${message}` }]
    }
    if (effect.type === "LOAD_FILE") {
      return [{ type: "FILE_LOAD_FAILED", path: effect.path, message: `Failed to open file: ${message}` }]
    }
    if (effect.type === "SAVE_FILE") {
      return [{ type: "FILE_SAVE_FAILED", message: `Failed to save file: ${message}` }]
    }

    return []
  }
}
