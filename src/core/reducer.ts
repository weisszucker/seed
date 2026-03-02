import type { AppEffect, AppEvent, EditorState, ModalState, PendingAction } from "./types"
import { isAbsolute, resolve } from "node:path"

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

function executePendingAction(state: EditorState, action: PendingAction): ReduceResult {
  if (action.type === "open_file") {
    return {
      state: {
        ...state,
        modal: null,
        statusMessage: `Opening ${action.path}`,
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
    "FILE_SAVED",
    "FILE_SAVE_FAILED",
    "FILE_LOADED",
    "FILE_LOAD_FAILED",
    "CONFIG_LOADED",
    "CONFIG_LOAD_FAILED",
    "FILE_TREE_LOADED",
    "FILE_TREE_LOAD_FAILED",
  ])

  return !allowed.has(event.type)
}

function toSaveAsModal(currentPath: string | null): ModalState {
  return {
    kind: "save_as",
    pathInput: currentPath ?? "",
  }
}

function resolveDocumentPath(cwd: string, inputPath: string): string {
  if (isAbsolute(inputPath)) {
    return inputPath
  }
  return resolve(cwd, inputPath)
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
          modal: toSaveAsModal(state.document.path),
          postSaveAction: null,
          statusMessage: "Enter path to save",
        },
        effects: [],
        }
      }

      return {
        state: {
          ...state,
          statusMessage: `Saving ${state.document.path}`,
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
          modal: toSaveAsModal(state.document.path),
          postSaveAction: null,
          statusMessage: "Save as",
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
            modal: toSaveAsModal(state.document.path),
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
          statusMessage: "Canceled",
        },
        effects: [],
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

      const resolvedPath = resolveDocumentPath(state.cwd, normalized)

      return {
        state: {
          ...state,
          statusMessage: `Saving ${resolvedPath}`,
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
          statusMessage: `Loaded ${event.path}`,
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
        statusMessage: `Saved ${event.path}`,
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
