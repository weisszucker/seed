import type { AppEffect, AppEvent, EditorState, ModalState, PendingAction } from "./types"
import { basename, isAbsolute, join, relative, resolve } from "node:path"

type ReduceResult = {
  state: EditorState
  effects: AppEffect[]
}

function withDocumentText(state: EditorState, text: string): EditorState {
  const isDirty = text !== state.document.savedText
  return {
    ...state,
    document: {
      ...state.document,
      text,
      isDirty,
    },
  }
}

function formatPathForDisplay(rootPath: string, targetPath: string): string {
  return toWorkspaceRelativePath(rootPath, targetPath) ?? targetPath
}

function executePendingAction(state: EditorState, action: PendingAction): ReduceResult {
  if (action.type === "open_file") {
    return {
      state: {
        ...state,
        modal: null,
        statusMessage: `Opening ${formatPathForDisplay(state.cwd, action.path)}`,
      },
      effects: [{ type: "LOAD_FILE", path: action.path }],
    }
  }

  if (action.type === "new_file") {
    return {
      state: {
        ...state,
        modal: null,
        selectedPath: null,
        document: {
          path: null,
          text: "",
          savedText: "",
          isDirty: false,
        },
        statusMessage: "New untitled file",
      },
      effects: [],
    }
  }

  return {
    state: {
      ...state,
      modal: null,
      statusMessage: "Quitting",
    },
    effects: [{ type: "EXIT_APP" }],
  }
}

function shouldOpenUnsavedPrompt(state: EditorState): boolean {
  return state.document.isDirty
}

function requestRiskyAction(state: EditorState, action: PendingAction): ReduceResult {
  if (!shouldOpenUnsavedPrompt(state)) {
    return executePendingAction(state, action)
  }

  const modal: ModalState = {
    kind: "unsaved_changes",
    pendingAction: action,
    selectedOption: "save",
  }
  return {
    state: {
      ...state,
      modal,
      statusMessage: "Unsaved changes",
    },
    effects: [],
  }
}

function isBlockedByModal(state: EditorState, event: AppEvent): boolean {
  if (!state.modal) {
    return false
  }

  const allowed = new Set<AppEvent["type"]>([
    "PROMPT_CHOOSE_SAVE",
    "PROMPT_CHOOSE_DONT_SAVE",
    "PROMPT_SELECT_PREV",
    "PROMPT_SELECT_NEXT",
    "PROMPT_CANCEL",
    "SAVE_AS_PATH_UPDATED",
    "SAVE_AS_SUBMITTED",
    "CREATE_PATH_INPUT_UPDATED",
    "CREATE_PATH_SUBMITTED",
    "MOVE_SOURCE_PATH_UPDATED",
    "MOVE_DESTINATION_PATH_UPDATED",
    "MOVE_PATH_FOCUS_CHANGED",
    "MOVE_PATH_SUBMITTED",
    "FILE_SAVED",
    "FILE_SAVE_FAILED",
    "FILE_LOADED",
    "FILE_LOAD_FAILED",
    "PATH_CREATED",
    "PATH_CREATE_FAILED",
    "PATH_MOVED",
    "PATH_MOVE_FAILED",
    "CONFIG_LOADED",
    "CONFIG_LOAD_FAILED",
    "FILE_TREE_LOADED",
    "FILE_TREE_LOAD_FAILED",
  ])

  return !allowed.has(event.type)
}

function toSaveAsModal(rootPath: string, currentPath: string | null): ModalState {
  return {
    kind: "save_as",
    pathInput: toWorkspaceRelativePath(rootPath, currentPath) ?? "",
  }
}

function toShortcutHelpModal(): ModalState {
  return {
    kind: "shortcut_help",
  }
}

function toCreatePathModal(rootPath: string, currentPath: string | null): ModalState {
  return {
    kind: "create_path",
    pathInput: toWorkspaceRelativePath(rootPath, currentPath) ?? "",
  }
}

function toMovePathModal(rootPath: string, currentPath: string | null): ModalState {
  return {
    kind: "move_path",
    sourcePathInput: toWorkspaceRelativePath(rootPath, currentPath) ?? "",
    destinationPathInput: "",
    focusedField: "source",
  }
}

function isPathWithinRoot(rootPath: string, targetPath: string): boolean {
  const pathFromRoot = relative(rootPath, targetPath)
  if (pathFromRoot === "") {
    return false
  }
  return !pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot)
}

function toWorkspaceRelativePath(rootPath: string, targetPath: string | null): string | null {
  if (!targetPath) {
    return null
  }

  if (!rootPath) {
    return targetPath
  }

  if (!isPathWithinRoot(rootPath, targetPath)) {
    return null
  }

  return relative(rootPath, targetPath)
}

function resolveWorkspacePath(rootPath: string, inputPath: string): string | null {
  if (isAbsolute(inputPath)) {
    return null
  }

  const resolvedPath = resolve(rootPath, inputPath)
  return isPathWithinRoot(rootPath, resolvedPath) ? resolvedPath : null
}

function isSameOrDescendantPath(parentPath: string, targetPath: string): boolean {
  const pathFromParent = relative(parentPath, targetPath)
  return pathFromParent === "" || (!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent))
}

function remapMovedPath(currentPath: string | null, sourcePath: string, destinationPath: string): string | null {
  if (!currentPath || !isSameOrDescendantPath(sourcePath, currentPath)) {
    return currentPath
  }

  const suffix = relative(sourcePath, currentPath)
  if (!suffix) {
    return destinationPath
  }

  return join(destinationPath, suffix)
}

function remapExpandedDirs(
  expandedDirs: Record<string, boolean>,
  sourcePath: string,
  destinationPath: string,
): Record<string, boolean> {
  const nextEntries: Array<[string, boolean]> = []
  for (const [path, expanded] of Object.entries(expandedDirs)) {
    nextEntries.push([remapMovedPath(path, sourcePath, destinationPath) ?? path, expanded])
  }
  return Object.fromEntries(nextEntries)
}

function supportsBackslashSeparator(): boolean {
  return process.platform === "win32"
}

function hasDirectorySuffix(inputPath: string): boolean {
  return supportsBackslashSeparator()
    ? inputPath.endsWith("/") || inputPath.endsWith("\\")
    : inputPath.endsWith("/")
}

function stripTrailingSeparators(inputPath: string): string {
  let normalized = inputPath
  while (normalized.endsWith("/") || (supportsBackslashSeparator() && normalized.endsWith("\\"))) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

export function reduceEvent(state: EditorState, event: AppEvent): ReduceResult {
  if (isBlockedByModal(state, event)) {
    return { state, effects: [] }
  }

  switch (event.type) {
    case "APP_STARTED":
      return {
        state,
        effects: [
          { type: "LOAD_CONFIG" },
          { type: "LOAD_FILE_TREE", rootPath: state.cwd },
        ],
      }

    case "REQUEST_REFRESH_FILE_TREE":
      return {
        state: {
          ...state,
          statusMessage: `Refreshing ${state.cwd}`,
        },
        effects: [{ type: "LOAD_FILE_TREE", rootPath: state.cwd }],
      }

    case "CONFIG_LOADED":
      return {
        state: {
          ...state,
          leaderKey: event.leaderKey ?? state.leaderKey,
          keybindings: {
            ...state.keybindings,
            ...event.keybindings,
          },
          statusMessage: "Config loaded",
          postSaveAction: state.postSaveAction,
        },
        effects: [],
      }

    case "CONFIG_LOAD_FAILED":
      return {
        state: {
          ...state,
          statusMessage: event.message,
        },
        effects: [],
      }

    case "FILE_TREE_LOADED":
      return {
        state: {
          ...state,
          fileTree: event.nodes,
          statusMessage: "File tree loaded",
        },
        effects: [],
      }

    case "FILE_TREE_LOAD_FAILED":
      return {
        state: {
          ...state,
          statusMessage: event.message,
        },
        effects: [],
      }

    case "TOGGLE_SIDEBAR":
      return {
        state: {
          ...state,
          sidebarVisible: !state.sidebarVisible,
        },
        effects: [],
      }

    case "TOGGLE_DIRECTORY": {
      return {
        state: {
          ...state,
          expandedDirs: {
            ...state.expandedDirs,
            [event.path]: !state.expandedDirs[event.path],
          },
        },
        effects: [],
      }
    }

    case "EDITOR_TEXT_CHANGED":
      return {
        state: withDocumentText(state, event.text),
        effects: [],
      }

    case "REQUEST_OPEN_FILE":
      return requestRiskyAction(state, { type: "open_file", path: event.path })

    case "REQUEST_NEW_FILE":
      return requestRiskyAction(state, { type: "new_file" })

    case "REQUEST_QUIT":
      return requestRiskyAction(state, { type: "quit" })

    case "REQUEST_SAVE": {
      if (!state.document.isDirty && state.document.path) {
        return {
          state: {
            ...state,
            statusMessage: "No changes to save",
            postSaveAction: null,
          },
          effects: [],
        }
      }

      if (!state.document.path) {
        return {
          state: {
            ...state,
            modal: toSaveAsModal(state.cwd, state.document.path),
            postSaveAction: null,
            statusMessage: "Enter path to save",
          },
          effects: [],
        }
      }

      return {
        state: {
          ...state,
          statusMessage: `Saving ${formatPathForDisplay(state.cwd, state.document.path)}`,
          postSaveAction: null,
        },
        effects: [
          {
            type: "SAVE_FILE",
            path: state.document.path,
            text: state.document.text,
          },
        ],
      }
    }

    case "REQUEST_SAVE_AS":
      return {
        state: {
          ...state,
          modal: toSaveAsModal(state.cwd, state.document.path),
          postSaveAction: null,
          statusMessage: "Save as",
        },
        effects: [],
      }

    case "REQUEST_CREATE_PATH":
      return {
        state: {
          ...state,
          modal: toCreatePathModal(state.cwd, state.document.path),
          postSaveAction: null,
          statusMessage: "Create file or folder",
        },
        effects: [],
      }

    case "REQUEST_MOVE_PATH":
      return {
        state: {
          ...state,
          modal: toMovePathModal(state.cwd, state.document.path),
          postSaveAction: null,
          statusMessage: "Move file or folder",
        },
        effects: [],
      }

    case "REQUEST_SHOW_SHORTCUT_HELP":
      return {
        state: {
          ...state,
          modal: toShortcutHelpModal(),
          postSaveAction: null,
          statusMessage: "Shortcut help",
        },
        effects: [],
      }

    case "PROMPT_CHOOSE_DONT_SAVE": {
      if (!state.modal || state.modal.kind !== "unsaved_changes") {
        return { state, effects: [] }
      }
      return executePendingAction(
        {
          ...state,
          modal: null,
        },
        state.modal.pendingAction,
      )
    }

    case "PROMPT_SELECT_PREV": {
      if (!state.modal || state.modal.kind !== "unsaved_changes") {
        return { state, effects: [] }
      }
      return {
        state: {
          ...state,
          modal: {
            ...state.modal,
            selectedOption: state.modal.selectedOption === "save" ? "dont_save" : "save",
          },
        },
        effects: [],
      }
    }

    case "PROMPT_SELECT_NEXT": {
      if (!state.modal || state.modal.kind !== "unsaved_changes") {
        return { state, effects: [] }
      }
      return {
        state: {
          ...state,
          modal: {
            ...state.modal,
            selectedOption: state.modal.selectedOption === "save" ? "dont_save" : "save",
          },
        },
        effects: [],
      }
    }

    case "PROMPT_CHOOSE_SAVE": {
      if (!state.modal || state.modal.kind !== "unsaved_changes") {
        return { state, effects: [] }
      }

      if (!state.document.path) {
        return {
          state: {
            ...state,
            modal: toSaveAsModal(state.cwd, state.document.path),
            postSaveAction: state.modal.pendingAction,
            statusMessage: "Enter path before continuing",
          },
          effects: [],
        }
      }

      return {
        state: {
          ...state,
          modal: null,
          postSaveAction: state.modal.pendingAction,
          statusMessage: "Saving before pending action",
        },
        effects: [
          {
            type: "SAVE_FILE",
            path: state.document.path,
            text: state.document.text,
          },
        ],
      }
    }

    case "PROMPT_CANCEL":
      return {
        state: {
          ...state,
          modal: null,
          postSaveAction: null,
          statusMessage: state.modal?.kind === "shortcut_help" ? "Ready" : "Canceled",
        },
        effects: [],
      }

    case "CREATE_PATH_INPUT_UPDATED": {
      if (!state.modal || state.modal.kind !== "create_path") {
        return { state, effects: [] }
      }
      return {
        state: {
          ...state,
          modal: {
            ...state.modal,
            pathInput: event.path,
          },
        },
        effects: [],
      }
    }

    case "CREATE_PATH_SUBMITTED": {
      if (!state.modal || state.modal.kind !== "create_path") {
        return { state, effects: [] }
      }

      const rawPath = state.modal.pathInput.trim()
      if (!rawPath) {
        return {
          state: {
            ...state,
            statusMessage: "Path cannot be empty",
          },
          effects: [],
        }
      }

      const nodeType = hasDirectorySuffix(rawPath) ? "directory" : "file"
      const normalizedInput = stripTrailingSeparators(rawPath)
      if (!normalizedInput) {
        return {
          state: {
            ...state,
            statusMessage: "Path must stay within root",
          },
          effects: [],
        }
      }

      const resolvedPath = resolveWorkspacePath(state.cwd, normalizedInput)
      if (!resolvedPath) {
        return {
          state: {
            ...state,
            statusMessage: "Path must stay within root",
          },
          effects: [],
        }
      }

      return {
        state: {
          ...state,
          statusMessage: `Creating ${formatPathForDisplay(state.cwd, resolvedPath)}`,
        },
        effects: [
          {
            type: "CREATE_PATH",
            rootPath: state.cwd,
            path: resolvedPath,
            nodeType,
          },
        ],
      }
    }

    case "MOVE_SOURCE_PATH_UPDATED": {
      if (!state.modal || state.modal.kind !== "move_path") {
        return { state, effects: [] }
      }
      return {
        state: {
          ...state,
          modal: {
            ...state.modal,
            sourcePathInput: event.path,
          },
        },
        effects: [],
      }
    }

    case "MOVE_DESTINATION_PATH_UPDATED": {
      if (!state.modal || state.modal.kind !== "move_path") {
        return { state, effects: [] }
      }
      return {
        state: {
          ...state,
          modal: {
            ...state.modal,
            destinationPathInput: event.path,
          },
        },
        effects: [],
      }
    }

    case "MOVE_PATH_FOCUS_CHANGED": {
      if (!state.modal || state.modal.kind !== "move_path") {
        return { state, effects: [] }
      }
      return {
        state: {
          ...state,
          modal: {
            ...state.modal,
            focusedField: event.field,
          },
        },
        effects: [],
      }
    }

    case "MOVE_PATH_SUBMITTED": {
      if (!state.modal || state.modal.kind !== "move_path") {
        return { state, effects: [] }
      }

      const rawSourcePath = state.modal.sourcePathInput.trim()
      const rawDestinationPath = state.modal.destinationPathInput.trim()
      if (!rawSourcePath || !rawDestinationPath) {
        return {
          state: {
            ...state,
            statusMessage: "Source and destination are required",
          },
          effects: [],
        }
      }

      const normalizedSourceInput = stripTrailingSeparators(rawSourcePath)
      const destinationIsDirectory = hasDirectorySuffix(rawDestinationPath)
      const normalizedDestinationInput = stripTrailingSeparators(rawDestinationPath)
      if (!normalizedSourceInput || !normalizedDestinationInput) {
        return {
          state: {
            ...state,
            statusMessage: "Path must stay within root",
          },
          effects: [],
        }
      }

      const sourcePath = resolveWorkspacePath(state.cwd, normalizedSourceInput)
      if (!sourcePath) {
        return {
          state: {
            ...state,
            statusMessage: "Path must stay within root",
          },
          effects: [],
        }
      }

      const resolvedDestination = resolveWorkspacePath(state.cwd, normalizedDestinationInput)
      if (!resolvedDestination) {
        return {
          state: {
            ...state,
            statusMessage: "Path must stay within root",
          },
          effects: [],
        }
      }

      const destinationPath = destinationIsDirectory
        ? join(resolvedDestination, basename(sourcePath))
        : resolvedDestination

      if (!isPathWithinRoot(state.cwd, destinationPath)) {
        return {
          state: {
            ...state,
            statusMessage: "Path must stay within root",
          },
          effects: [],
        }
      }

      if (sourcePath === destinationPath) {
        return {
          state: {
            ...state,
            statusMessage: "Source and destination must differ",
          },
          effects: [],
        }
      }

      return {
        state: {
          ...state,
          statusMessage: `Moving ${formatPathForDisplay(state.cwd, sourcePath)}`,
        },
        effects: [
          {
            type: "MOVE_PATH",
            rootPath: state.cwd,
            sourcePath,
            destinationPath,
          },
        ],
      }
    }

    case "SAVE_AS_PATH_UPDATED": {
      if (!state.modal || state.modal.kind !== "save_as") {
        return { state, effects: [] }
      }
      return {
        state: {
          ...state,
          modal: {
            ...state.modal,
            pathInput: event.path,
          },
        },
        effects: [],
      }
    }

    case "SAVE_AS_SUBMITTED": {
      if (!state.modal || state.modal.kind !== "save_as") {
        return { state, effects: [] }
      }

      const normalized = state.modal.pathInput.trim()
      if (!normalized) {
        return {
          state: {
            ...state,
            statusMessage: "Path cannot be empty",
          },
          effects: [],
        }
      }

      const resolvedPath = resolveWorkspacePath(state.cwd, normalized)
      if (!resolvedPath) {
        return {
          state: {
            ...state,
            statusMessage: "Path must stay within root",
          },
          effects: [],
        }
      }

      return {
        state: {
          ...state,
          statusMessage: `Saving ${formatPathForDisplay(state.cwd, resolvedPath)}`,
        },
        effects: [
          {
            type: "SAVE_FILE",
            path: resolvedPath,
            text: state.document.text,
          },
        ],
      }
    }

    case "PATH_CREATED":
      return {
        state: {
          ...state,
          modal: null,
          statusMessage: `${event.nodeType === "directory" ? "Created folder" : "Created file"} ${formatPathForDisplay(state.cwd, event.path)}`,
        },
        effects: [{ type: "LOAD_FILE_TREE", rootPath: state.cwd }],
      }

    case "PATH_CREATE_FAILED":
      return {
        state: {
          ...state,
          statusMessage: event.message,
        },
        effects: [],
      }

    case "PATH_MOVED":
      return {
        state: {
          ...state,
          modal: null,
          selectedPath: remapMovedPath(state.selectedPath, event.sourcePath, event.destinationPath),
          expandedDirs: remapExpandedDirs(state.expandedDirs, event.sourcePath, event.destinationPath),
          document: {
            ...state.document,
            path: remapMovedPath(state.document.path, event.sourcePath, event.destinationPath),
          },
          statusMessage: `Moved ${formatPathForDisplay(state.cwd, event.sourcePath)} to ${formatPathForDisplay(state.cwd, event.destinationPath)}`,
        },
        effects: [{ type: "LOAD_FILE_TREE", rootPath: state.cwd }],
      }

    case "PATH_MOVE_FAILED":
      return {
        state: {
          ...state,
          statusMessage: event.message,
        },
        effects: [],
      }

    case "FILE_LOADED":
      return {
        state: {
          ...state,
          modal: null,
          selectedPath: event.path,
          document: {
            path: event.path,
            text: event.text,
            savedText: event.text,
            isDirty: false,
          },
          statusMessage: `Loaded ${formatPathForDisplay(state.cwd, event.path)}`,
        },
        effects: [],
      }

    case "FILE_LOAD_FAILED":
      return {
        state: {
          ...state,
          statusMessage: event.message,
        },
        effects: [],
      }

    case "FILE_SAVED": {
      const stateAfterSave: EditorState = {
        ...state,
        document: {
          ...state.document,
          path: event.path,
          savedText: state.document.text,
          isDirty: false,
        },
        selectedPath: event.path,
        statusMessage: `Saved ${formatPathForDisplay(state.cwd, event.path)}`,
        modal: null,
        postSaveAction: null,
      }

      if (state.postSaveAction) {
        return executePendingAction(stateAfterSave, state.postSaveAction)
      }

      return {
        state: stateAfterSave,
        effects: [{ type: "LOAD_FILE_TREE", rootPath: state.cwd }],
      }
    }

    case "FILE_SAVE_FAILED":
      return {
        state: {
          ...state,
          statusMessage: event.message,
        },
        effects: [],
      }

    default:
      return { state, effects: [] }
  }
}
