import { basename, isAbsolute, relative, resolve, sep } from "node:path"

import type { AppEffect, AppEvent, EditorState, FileNode, ModalState, PendingAction } from "./types"

type ReduceResult = {
  state: EditorState
  effects: AppEffect[]
}

type VisibleTreeNode = {
  path: string
  name: string
  isDirectory: boolean
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

function flattenVisibleNodes(nodes: FileNode[], expandedDirs: Record<string, boolean>): VisibleTreeNode[] {
  const visible: VisibleTreeNode[] = []

  function visit(node: FileNode): void {
    visible.push({
      path: node.path,
      name: node.name,
      isDirectory: node.isDirectory,
    })
    if (node.isDirectory && (expandedDirs[node.path] ?? false)) {
      for (const child of node.children) {
        visit(child)
      }
    }
  }

  for (const node of nodes) {
    visit(node)
  }

  return visible
}

function isPathOrDescendant(path: string, parentPath: string): boolean {
  return path === parentPath || path.startsWith(`${parentPath}${sep}`)
}

function isPathWithinRoot(path: string, root: string): boolean {
  const rel = relative(root, path)
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
}

function resolveSidebarCursorPath(
  nodes: FileNode[],
  expandedDirs: Record<string, boolean>,
  cursorPath: string | null,
  selectedPath: string | null,
): string | null {
  const visible = flattenVisibleNodes(nodes, expandedDirs)
  if (visible.length === 0) {
    return null
  }

  if (cursorPath && visible.some((node) => node.path === cursorPath)) {
    return cursorPath
  }

  if (selectedPath && visible.some((node) => node.path === selectedPath)) {
    return selectedPath
  }

  return visible[0].path
}

function currentSidebarNode(state: EditorState): VisibleTreeNode | null {
  const visible = flattenVisibleNodes(state.fileTree, state.expandedDirs)
  if (visible.length === 0) {
    return null
  }
  const cursorPath = resolveSidebarCursorPath(
    state.fileTree,
    state.expandedDirs,
    state.sidebarCursorPath,
    state.selectedPath,
  )
  if (!cursorPath) {
    return null
  }
  return visible.find((node) => node.path === cursorPath) ?? null
}

function moveSidebarCursor(state: EditorState, delta: -1 | 1): EditorState {
  const visible = flattenVisibleNodes(state.fileTree, state.expandedDirs)
  if (visible.length === 0) {
    return state
  }

  const cursorPath = resolveSidebarCursorPath(
    state.fileTree,
    state.expandedDirs,
    state.sidebarCursorPath,
    state.selectedPath,
  )
  const currentIndex = Math.max(
    0,
    visible.findIndex((node) => node.path === cursorPath),
  )
  const nextIndex = Math.min(visible.length - 1, Math.max(0, currentIndex + delta))
  return {
    ...state,
    sidebarCursorPath: visible[nextIndex].path,
  }
}

function toggleDirectory(state: EditorState, path: string): EditorState {
  const isExpanded = state.expandedDirs[path] ?? false
  const expandedDirs = {
    ...state.expandedDirs,
    [path]: !isExpanded,
  }

  let sidebarCursorPath = state.sidebarCursorPath
  if (isExpanded && sidebarCursorPath && isPathOrDescendant(sidebarCursorPath, path) && sidebarCursorPath !== path) {
    sidebarCursorPath = path
  }

  return {
    ...state,
    expandedDirs,
    sidebarCursorPath: resolveSidebarCursorPath(state.fileTree, expandedDirs, sidebarCursorPath, state.selectedPath),
  }
}

function clearExpandedDirsForDeletedPath(expandedDirs: Record<string, boolean>, deletedPath: string): Record<string, boolean> {
  const next: Record<string, boolean> = {}
  for (const [path, isExpanded] of Object.entries(expandedDirs)) {
    if (!isPathOrDescendant(path, deletedPath)) {
      next[path] = isExpanded
    }
  }
  return next
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
    "DELETE_PROMPT_SELECT_PREV",
    "DELETE_PROMPT_SELECT_NEXT",
    "DELETE_PROMPT_CONFIRM",
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
    "PATH_DELETED",
    "PATH_DELETE_FAILED",
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
          sidebarCursorPath: resolveSidebarCursorPath(
            event.nodes,
            state.expandedDirs,
            state.sidebarCursorPath,
            state.selectedPath,
          ),
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

    case "TOGGLE_SIDEBAR": {
      const sidebarVisible = !state.sidebarVisible
      return {
        state: {
          ...state,
          sidebarVisible,
          focusTarget: sidebarVisible ? state.focusTarget : "editor",
        },
        effects: [],
      }
    }

    case "TOGGLE_FOCUS_TARGET": {
      if (!state.sidebarVisible) {
        return {
          state: {
            ...state,
            focusTarget: "editor",
            statusMessage: "Sidebar hidden",
          },
          effects: [],
        }
      }

      if (state.focusTarget === "editor") {
        return {
          state: {
            ...state,
            focusTarget: "sidebar",
            sidebarCursorPath: resolveSidebarCursorPath(
              state.fileTree,
              state.expandedDirs,
              state.sidebarCursorPath,
              state.selectedPath,
            ),
            statusMessage: "Sidebar focused",
          },
          effects: [],
        }
      }

      return {
        state: {
          ...state,
          focusTarget: "editor",
          statusMessage: "Editor focused",
        },
        effects: [],
      }
    }

    case "TOGGLE_DIRECTORY":
      return {
        state: toggleDirectory(state, event.path),
        effects: [],
      }

    case "SIDEBAR_SET_CURSOR":
      return {
        state: {
          ...state,
          sidebarCursorPath: event.path,
        },
        effects: [],
      }

    case "SIDEBAR_MOVE_UP":
      return {
        state: moveSidebarCursor(state, -1),
        effects: [],
      }

    case "SIDEBAR_MOVE_DOWN":
      return {
        state: moveSidebarCursor(state, 1),
        effects: [],
      }

    case "SIDEBAR_ACTIVATE": {
      const node = currentSidebarNode(state)
      if (!node) {
        return { state, effects: [] }
      }

      if (node.isDirectory) {
        return {
          state: toggleDirectory(
            {
              ...state,
              sidebarCursorPath: node.path,
            },
            node.path,
          ),
          effects: [],
        }
      }

      return requestRiskyAction(
        {
          ...state,
          sidebarCursorPath: node.path,
        },
        { type: "open_file", path: node.path },
      )
    }

    case "SIDEBAR_REQUEST_DELETE": {
      const node = currentSidebarNode(state)
      if (!node) {
        return { state, effects: [] }
      }

      if (!isPathWithinRoot(node.path, state.cwd)) {
        return {
          state: {
            ...state,
            statusMessage: "Cannot delete outside current folder",
          },
          effects: [],
        }
      }

      return {
        state: {
          ...state,
          modal: {
            kind: "delete_confirm",
            targetPath: node.path,
            targetName: basename(node.path),
            targetType: node.isDirectory ? "folder" : "file",
            selectedOption: "cancel",
          },
          statusMessage: `Confirm delete ${node.path}`,
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
      return requestRiskyAction(
        {
          ...state,
          sidebarCursorPath: event.path,
        },
        { type: "open_file", path: event.path },
      )

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

    case "DELETE_PROMPT_SELECT_PREV": {
      if (!state.modal || state.modal.kind !== "delete_confirm") {
        return { state, effects: [] }
      }
      return {
        state: {
          ...state,
          modal: {
            ...state.modal,
            selectedOption: state.modal.selectedOption === "cancel" ? "delete" : "cancel",
          },
        },
        effects: [],
      }
    }

    case "DELETE_PROMPT_SELECT_NEXT": {
      if (!state.modal || state.modal.kind !== "delete_confirm") {
        return { state, effects: [] }
      }
      return {
        state: {
          ...state,
          modal: {
            ...state.modal,
            selectedOption: state.modal.selectedOption === "cancel" ? "delete" : "cancel",
          },
        },
        effects: [],
      }
    }

    case "DELETE_PROMPT_CONFIRM": {
      if (!state.modal || state.modal.kind !== "delete_confirm") {
        return { state, effects: [] }
      }

      return {
        state: {
          ...state,
          modal: null,
          statusMessage: `Deleting ${state.modal.targetPath}`,
        },
        effects: [
          {
            type: "DELETE_PATH",
            path: state.modal.targetPath,
            cwd: state.cwd,
          },
        ],
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
          sidebarCursorPath: event.path,
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
        sidebarCursorPath: event.path,
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

    case "PATH_DELETED": {
      const selectedPath =
        state.selectedPath && isPathOrDescendant(state.selectedPath, event.path)
          ? null
          : state.selectedPath

      const shouldClearDocument =
        state.document.path !== null && isPathOrDescendant(state.document.path, event.path)

      const nextState: EditorState = {
        ...state,
        selectedPath,
        sidebarCursorPath: null,
        expandedDirs: clearExpandedDirsForDeletedPath(state.expandedDirs, event.path),
        document: shouldClearDocument
          ? {
              path: null,
              text: "",
              savedText: "",
              isDirty: false,
            }
          : state.document,
        statusMessage: `Deleted ${event.path}`,
      }

      return {
        state: nextState,
        effects: [{ type: "LOAD_FILE_TREE", rootPath: state.cwd }],
      }
    }

    case "PATH_DELETE_FAILED":
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
