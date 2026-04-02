import type { CliRenderer } from "@opentui/core"

import type { AppEffect, AppEvent } from "../core/types"
import { copyTextToClipboard } from "./clipboard"
import { loadUserConfig } from "./config"
import { createPath, deletePath, loadFileTree, movePath, readTextFile, writeTextFile } from "./fs"

type EffectRunnerDependencies = {
  copyTextToClipboard?: typeof copyTextToClipboard
}

export async function runEffect(
  effect: AppEffect,
  renderer: CliRenderer,
  deps: EffectRunnerDependencies = {},
): Promise<AppEvent[]> {
  try {
    switch (effect.type) {
      case "LOAD_CONFIG": {
        const config = await loadUserConfig()
        return [{ type: "CONFIG_LOADED", leaderKey: config.leaderKey, keybindings: config.keybindings ?? {} }]
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

      case "COPY_TO_CLIPBOARD": {
        const didCopy = await (deps.copyTextToClipboard ?? copyTextToClipboard)(effect.text, renderer)
        if (didCopy) {
          return [{ type: "CLIPBOARD_COPY_SUCCEEDED" }]
        }

        return [
          {
            type: "CLIPBOARD_COPY_FAILED",
            message: "Clipboard copy is not supported in this terminal",
          },
        ]
      }

      case "CREATE_PATH": {
        await createPath(effect.path, effect.nodeType)
        return [{ type: "PATH_CREATED", path: effect.path, nodeType: effect.nodeType }]
      }

      case "MOVE_PATH": {
        await movePath(effect.sourcePath, effect.destinationPath)
        return [{ type: "PATH_MOVED", sourcePath: effect.sourcePath, destinationPath: effect.destinationPath }]
      }

      case "DELETE_PATH": {
        await deletePath(effect.path)
        return [{ type: "PATH_DELETED", path: effect.path, nodeType: effect.nodeType }]
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
    if (effect.type === "CREATE_PATH") {
      return [{ type: "PATH_CREATE_FAILED", message: `Failed to create path: ${message}` }]
    }
    if (effect.type === "MOVE_PATH") {
      return [{ type: "PATH_MOVE_FAILED", message: `Failed to move path: ${message}` }]
    }
    if (effect.type === "DELETE_PATH") {
      return [{ type: "PATH_DELETE_FAILED", message: `Failed to delete path: ${message}` }]
    }

    return []
  }
}
