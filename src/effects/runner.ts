import type { CliRenderer } from "@opentui/core"

import type { AppEffect, AppEvent } from "../core/types"
import { logDiagnosticError } from "../diagnostics/logging"
import { loadUserKeybindings } from "./config"
import { deletePath, loadFileTree, readTextFile, writeTextFile } from "./fs"

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

      case "DELETE_PATH": {
        await deletePath(effect.path, effect.cwd)
        return [{ type: "PATH_DELETED", path: effect.path }]
      }

      case "EXIT_APP":
        renderer.destroy()
        return []

      default:
        return []
    }
  } catch (error) {
    logDiagnosticError("effects.run_failed", error, {
      effect: effect.type,
      path: effect.type === "LOAD_FILE" || effect.type === "SAVE_FILE" || effect.type === "DELETE_PATH" ? effect.path : undefined,
      root_path: effect.type === "LOAD_FILE_TREE" ? effect.rootPath : undefined,
    })
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
    if (effect.type === "DELETE_PATH") {
      return [{ type: "PATH_DELETE_FAILED", path: effect.path, message: `Failed to delete path: ${message}` }]
    }

    return []
  }
}
