import type { AppEffect, AppEvent, DeveloperTodoItem, EditorState, ModalState, PendingAction } from "./types"
import { basename, isAbsolute, join, relative, resolve } from "node:path"

type ReduceResult = {
  state: EditorState
  effects: AppEffect[]
}

type VisibleSidebarNode = {
  path: string
  isDirectory: boolean
  parentPath: string | null
}

function withStatus(state: EditorState, statusMessage: string, transient = false): EditorState {
  return {
    ...state,
    statusMessage,
    statusMessageTransient: transient,
  }
}

function isUserInputEvent(event: AppEvent): boolean {
  switch (event.type) {
    case "TOGGLE_SIDEBAR":
    case "TOGGLE_FOCUS_PANE":
    case "FOCUS_EDITOR":
    case "FOCUS_SIDEBAR":
    case "TOGGLE_DIRECTORY":
    case "SIDEBAR_SELECT_PREV":
    case "SIDEBAR_SELECT_NEXT":
    case "SIDEBAR_ACTIVATE_SELECTION":
    case "SIDEBAR_EXPAND_SELECTION":
    case "SIDEBAR_COLLAPSE_SELECTION":
    case "SIDEBAR_REQUEST_DELETE_SELECTION":
    case "REQUEST_OPEN_FILE":
    case "REQUEST_NEW_FILE":
    case "REQUEST_QUIT":
    case "REQUEST_SAVE":
    case "REQUEST_SAVE_AS":
    case "REQUEST_COPY_TEXT":
    case "REQUEST_CREATE_PATH":
    case "REQUEST_MOVE_PATH":
    case "REQUEST_SHOW_DEVELOPER_TODO":
    case "REQUEST_SHOW_SHORTCUT_HELP":
    case "SAVE_AS_PATH_UPDATED":
    case "SAVE_AS_SUBMITTED":
    case "CREATE_PATH_INPUT_UPDATED":
    case "CREATE_PATH_SUBMITTED":
    case "MOVE_SOURCE_PATH_UPDATED":
    case "MOVE_DESTINATION_PATH_UPDATED":
    case "MOVE_PATH_FOCUS_CHANGED":
    case "MOVE_PATH_SUBMITTED":
    case "DEVELOPER_TODO_DRAFT_UPDATED":
    case "DEVELOPER_TODO_SUBMITTED":
    case "DEVELOPER_TODO_SELECT_PREV":
    case "DEVELOPER_TODO_SELECT_NEXT":
    case "DEVELOPER_TODO_FOCUS_CHANGED":
    case "DEVELOPER_TODO_TOGGLE_SELECTED":
    case "PROMPT_CHOOSE_SAVE":
    case "PROMPT_CHOOSE_DONT_SAVE":
    case "DELETE_CONFIRM_ACCEPT":
    case "PROMPT_SELECT_PREV":
    case "PROMPT_SELECT_NEXT":
    case "PROMPT_CANCEL":
    case "EDITOR_TEXT_CHANGED":
      return true

    default:
      return false
  }
}

function prepareStateForEvent(state: EditorState, event: AppEvent): EditorState {
  if (!state.statusMessageTransient) {
    return state
  }

  if (isUserInputEvent(event)) {
    return withStatus(state, "Ready")
  }

  return {
    ...state,
    statusMessageTransient: false,
  }
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

function flattenVisibleSidebarNodes(
  nodes: EditorState["fileTree"],
  expandedDirs: EditorState["expandedDirs"],
  parentPath: string | null = null,
): VisibleSidebarNode[] {
  const visibleNodes: VisibleSidebarNode[] = []

  for (const node of nodes) {
    visibleNodes.push({
      path: node.path,
      isDirectory: node.isDirectory,
      parentPath,
    })

    if (node.isDirectory && (expandedDirs[node.path] ?? false)) {
      visibleNodes.push(...flattenVisibleSidebarNodes(node.children, expandedDirs, node.path))
    }
  }

  return visibleNodes
}

function getVisibleSidebarNodes(state: EditorState): VisibleSidebarNode[] {
  return flattenVisibleSidebarNodes(state.fileTree, state.expandedDirs)
}

function getSidebarCursorPath(state: EditorState): string | null {
  const visibleNodes = getVisibleSidebarNodes(state)
  if (visibleNodes.length === 0) {
    return null
  }

  const visiblePaths = new Set(visibleNodes.map((node) => node.path))
  if (state.sidebarCursorPath && visiblePaths.has(state.sidebarCursorPath)) {
    return state.sidebarCursorPath
  }
  if (state.selectedPath && visiblePaths.has(state.selectedPath)) {
    return state.selectedPath
  }

  return visibleNodes[0]?.path ?? null
}

function findVisibleSidebarNode(state: EditorState, path: string | null): VisibleSidebarNode | null {
  if (!path) {
    return null
  }
  return getVisibleSidebarNodes(state).find((node) => node.path === path) ?? null
}

function moveSidebarSelection(state: EditorState, offset: -1 | 1): EditorState {
  const visibleNodes = getVisibleSidebarNodes(state)
  if (visibleNodes.length === 0) {
    return state
  }

  const currentPath = getSidebarCursorPath(state)
  const currentIndex = visibleNodes.findIndex((node) => node.path === currentPath)
  const nextIndex = currentIndex === -1 ? 0 : Math.min(Math.max(currentIndex + offset, 0), visibleNodes.length - 1)

  return {
    ...state,
    sidebarCursorPath: visibleNodes[nextIndex]?.path ?? currentPath,
  }
}

function focusSidebar(state: EditorState): EditorState {
  return {
    ...state,
    sidebarVisible: true,
    focusedPane: "sidebar",
    sidebarCursorPath: getSidebarCursorPath({
      ...state,
      sidebarVisible: true,
    }),
  }
}

function focusEditor(state: EditorState): EditorState {
  return {
    ...state,
    focusedPane: "editor",
  }
}

function activateSidebarSelection(state: EditorState): ReduceResult {
  const currentNode = findVisibleSidebarNode(state, getSidebarCursorPath(state))
  if (!currentNode) {
    return { state, effects: [] }
  }

  if (currentNode.isDirectory) {
    return {
      state: {
        ...state,
        expandedDirs: {
          ...state.expandedDirs,
          [currentNode.path]: !state.expandedDirs[currentNode.path],
        },
        sidebarCursorPath: currentNode.path,
      },
      effects: [],
    }
  }

  return requestRiskyAction(state, { type: "open_file", path: currentNode.path })
}

function expandSidebarSelection(state: EditorState): ReduceResult {
  const currentNode = findVisibleSidebarNode(state, getSidebarCursorPath(state))
  if (!currentNode) {
    return { state, effects: [] }
  }

  if (!currentNode.isDirectory) {
    return requestRiskyAction(state, { type: "open_file", path: currentNode.path })
  }

  if (state.expandedDirs[currentNode.path]) {
    return { state, effects: [] }
  }

  return {
    state: {
      ...state,
      expandedDirs: {
        ...state.expandedDirs,
        [currentNode.path]: true,
      },
      sidebarCursorPath: currentNode.path,
    },
    effects: [],
  }
}

function collapseSidebarSelection(state: EditorState): ReduceResult {
  const currentNode = findVisibleSidebarNode(state, getSidebarCursorPath(state))
  if (!currentNode) {
    return { state, effects: [] }
  }

  if (currentNode.isDirectory && state.expandedDirs[currentNode.path]) {
    return {
      state: {
        ...state,
        expandedDirs: {
          ...state.expandedDirs,
          [currentNode.path]: false,
        },
        sidebarCursorPath: currentNode.path,
      },
      effects: [],
    }
  }

  if (!currentNode.parentPath) {
    return { state, effects: [] }
  }

  return {
    state: {
      ...state,
      sidebarCursorPath: currentNode.parentPath,
    },
    effects: [],
  }
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
    "DEVELOPER_TODO_LIST_LOADED",
    "DEVELOPER_TODO_LIST_LOAD_FAILED",
    "DEVELOPER_TODO_DRAFT_UPDATED",
    "DEVELOPER_TODO_SUBMITTED",
    "DEVELOPER_TODO_SELECT_PREV",
    "DEVELOPER_TODO_SELECT_NEXT",
    "DEVELOPER_TODO_FOCUS_CHANGED",
    "DEVELOPER_TODO_TOGGLE_SELECTED",
    "DEVELOPER_TODO_LIST_SAVED",
    "DEVELOPER_TODO_LIST_SAVE_FAILED",
    "DELETE_CONFIRM_ACCEPT",
    "FILE_SAVED",
    "FILE_SAVE_FAILED",
    "FILE_LOADED",
    "FILE_LOAD_FAILED",
    "PATH_CREATED",
    "PATH_CREATE_FAILED",
    "PATH_MOVED",
    "PATH_MOVE_FAILED",
    "PATH_DELETED",
    "PATH_DELETE_FAILED",
    "CLIPBOARD_COPY_SUCCEEDED",
    "CLIPBOARD_COPY_FAILED",
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

function toDeleteConfirmModal(path: string, nodeType: "file" | "directory"): ModalState {
  return {
    kind: "delete_confirm",
    path,
    nodeType,
    selectedOption: "cancel",
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

function toDeveloperTodoModal(): ModalState {
  return {
    kind: "developer_todo",
    items: [],
    draftInput: "",
    selectedIndex: null,
    focusedSection: "input",
    loading: true,
  }
}

function getDeveloperTodoSelection(items: DeveloperTodoItem[], selectedIndex: number | null): number | null {
  if (items.length === 0) {
    return null
  }

  if (selectedIndex === null) {
    return 0
  }

  return Math.min(Math.max(selectedIndex, 0), items.length - 1)
}

function orderDeveloperTodoItems(items: DeveloperTodoItem[]): DeveloperTodoItem[] {
  const doneItems: DeveloperTodoItem[] = []
  const openItems: DeveloperTodoItem[] = []

  for (const item of items) {
    if (item.done) {
      doneItems.push(item)
      continue
    }

    openItems.push(item)
  }

  return [...doneItems, ...openItems]
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

function pruneExpandedDirs(expandedDirs: Record<string, boolean>, deletedPath: string): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(expandedDirs).filter(([path]) => !isSameOrDescendantPath(deletedPath, path)),
  )
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
  state = prepareStateForEvent(state, event)

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
          sidebarCursorPath: getSidebarCursorPath({
            ...state,
            fileTree: event.nodes,
          }),
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
          focusedPane: state.sidebarVisible ? "editor" : state.focusedPane,
          sidebarCursorPath: state.sidebarVisible ? state.sidebarCursorPath : getSidebarCursorPath(state),
        },
        effects: [],
      }

    case "TOGGLE_FOCUS_PANE":
      return {
        state: state.focusedPane === "sidebar" ? focusEditor(state) : focusSidebar(state),
        effects: [],
      }

    case "FOCUS_EDITOR":
      return {
        state: focusEditor(state),
        effects: [],
      }

    case "FOCUS_SIDEBAR":
      return {
        state: focusSidebar(state),
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
          sidebarCursorPath: event.path,
        },
        effects: [],
      }
    }

    case "SIDEBAR_SELECT_PREV":
      return {
        state: moveSidebarSelection(state, -1),
        effects: [],
      }

    case "SIDEBAR_SELECT_NEXT":
      return {
        state: moveSidebarSelection(state, 1),
        effects: [],
      }

    case "SIDEBAR_ACTIVATE_SELECTION":
      return activateSidebarSelection(state)

    case "SIDEBAR_EXPAND_SELECTION":
      return expandSidebarSelection(state)

    case "SIDEBAR_COLLAPSE_SELECTION":
      return collapseSidebarSelection(state)

    case "SIDEBAR_REQUEST_DELETE_SELECTION": {
      const currentNode = findVisibleSidebarNode(state, getSidebarCursorPath(state))
      if (!currentNode) {
        return { state, effects: [] }
      }

      return {
        state: {
          ...state,
          modal: toDeleteConfirmModal(currentNode.path, currentNode.isDirectory ? "directory" : "file"),
          statusMessage: `Delete ${formatPathForDisplay(state.cwd, currentNode.path)}?`,
        },
        effects: [],
      }
    }

    case "EDITOR_TEXT_CHANGED":
      return {
        state: withDocumentText(state, event.text),
        effects: [],
      }

    case "REQUEST_COPY_TEXT": {
      if (!event.text) {
        return { state, effects: [] }
      }

      return {
        state: withStatus(state, "Copying selection", true),
        effects: [{ type: "COPY_TO_CLIPBOARD", text: event.text }],
      }
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

    case "REQUEST_SHOW_DEVELOPER_TODO":
      return {
        state: {
          ...state,
          modal: toDeveloperTodoModal(),
          postSaveAction: null,
          statusMessage: "Loading developer todo list",
        },
        effects: [{ type: "LOAD_DEVELOPER_TODO_LIST", rootPath: state.cwd }],
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

    case "DELETE_CONFIRM_ACCEPT": {
      if (!state.modal || state.modal.kind !== "delete_confirm") {
        return { state, effects: [] }
      }

      return {
        state: {
          ...state,
          modal: null,
          statusMessage: `Deleting ${formatPathForDisplay(state.cwd, state.modal.path)}`,
        },
        effects: [
          {
            type: "DELETE_PATH",
            path: state.modal.path,
            nodeType: state.modal.nodeType,
          },
        ],
      }
    }

    case "PROMPT_SELECT_PREV": {
      if (!state.modal || (state.modal.kind !== "unsaved_changes" && state.modal.kind !== "delete_confirm")) {
        return { state, effects: [] }
      }

      if (state.modal.kind === "delete_confirm") {
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
      if (!state.modal || (state.modal.kind !== "unsaved_changes" && state.modal.kind !== "delete_confirm")) {
        return { state, effects: [] }
      }

      if (state.modal.kind === "delete_confirm") {
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
          statusMessage:
            state.modal?.kind === "shortcut_help" || state.modal?.kind === "developer_todo" ? "Ready" : "Canceled",
        },
        effects: [],
      }

    case "DEVELOPER_TODO_LIST_LOADED": {
      if (!state.modal || state.modal.kind !== "developer_todo") {
        return { state, effects: [] }
      }

      const items = orderDeveloperTodoItems(event.items)

      return {
        state: {
          ...state,
          modal: {
            ...state.modal,
            items,
            selectedIndex: getDeveloperTodoSelection(items, items.length - 1),
            focusedSection: "input",
            loading: false,
          },
          statusMessage: "Developer todo list",
        },
        effects: [],
      }
    }

    case "DEVELOPER_TODO_LIST_LOAD_FAILED": {
      if (!state.modal || state.modal.kind !== "developer_todo") {
        return {
          state: {
            ...state,
            statusMessage: event.message,
          },
          effects: [],
        }
      }

      return {
        state: {
          ...state,
          modal: {
            ...state.modal,
            loading: false,
          },
          statusMessage: event.message,
        },
        effects: [],
      }
    }

    case "DEVELOPER_TODO_DRAFT_UPDATED": {
      if (!state.modal || state.modal.kind !== "developer_todo") {
        return { state, effects: [] }
      }

      return {
        state: {
          ...state,
          modal: {
            ...state.modal,
            draftInput: event.text,
          },
        },
        effects: [],
      }
    }

    case "DEVELOPER_TODO_SELECT_PREV": {
      if (!state.modal || state.modal.kind !== "developer_todo" || state.modal.focusedSection !== "list") {
        return { state, effects: [] }
      }

      const currentIndex = getDeveloperTodoSelection(state.modal.items, state.modal.selectedIndex)
      if (currentIndex === null) {
        return { state, effects: [] }
      }

      return {
        state: {
          ...state,
          modal: {
            ...state.modal,
            selectedIndex: Math.max(currentIndex - 1, 0),
          },
        },
        effects: [],
      }
    }

    case "DEVELOPER_TODO_SELECT_NEXT": {
      if (!state.modal || state.modal.kind !== "developer_todo" || state.modal.focusedSection !== "list") {
        return { state, effects: [] }
      }

      const currentIndex = getDeveloperTodoSelection(state.modal.items, state.modal.selectedIndex)
      if (currentIndex === null) {
        return { state, effects: [] }
      }

      return {
        state: {
          ...state,
          modal: {
            ...state.modal,
            selectedIndex: Math.min(currentIndex + 1, state.modal.items.length - 1),
          },
        },
        effects: [],
      }
    }

    case "DEVELOPER_TODO_FOCUS_CHANGED": {
      if (!state.modal || state.modal.kind !== "developer_todo") {
        return { state, effects: [] }
      }

      return {
        state: {
          ...state,
          modal: {
            ...state.modal,
            focusedSection: event.section === "list" && state.modal.items.length > 0 ? "list" : "input",
            selectedIndex: getDeveloperTodoSelection(state.modal.items, state.modal.selectedIndex),
          },
        },
        effects: [],
      }
    }

    case "DEVELOPER_TODO_SUBMITTED": {
      if (!state.modal || state.modal.kind !== "developer_todo") {
        return { state, effects: [] }
      }

      const text = state.modal.draftInput.trim()
      if (!text) {
        return {
          state: {
            ...state,
            statusMessage: "Todo entry cannot be empty",
          },
          effects: [],
        }
      }

      const items = orderDeveloperTodoItems([...state.modal.items, { text, done: false }])
      return {
        state: {
          ...state,
          modal: {
            ...state.modal,
            items,
            draftInput: "",
            selectedIndex: items.length - 1,
            focusedSection: "input",
          },
          statusMessage: "Saving developer todo list",
        },
        effects: [{ type: "SAVE_DEVELOPER_TODO_LIST", rootPath: state.cwd, items }],
      }
    }

    case "DEVELOPER_TODO_TOGGLE_SELECTED": {
      if (!state.modal || state.modal.kind !== "developer_todo") {
        return { state, effects: [] }
      }

      const selectedIndex = getDeveloperTodoSelection(state.modal.items, state.modal.selectedIndex)
      if (selectedIndex === null) {
        return { state, effects: [] }
      }

      const items = state.modal.items.map((item, index) =>
        index === selectedIndex ? { ...item, done: !item.done } : item,
      )
      const orderedItems = orderDeveloperTodoItems(items)
      const toggledItem = items[selectedIndex]
      const nextSelectedIndex = orderedItems.findIndex((item) => item === toggledItem)

      return {
        state: {
          ...state,
          modal: {
            ...state.modal,
            items: orderedItems,
            selectedIndex: getDeveloperTodoSelection(orderedItems, nextSelectedIndex),
            focusedSection: "list",
          },
          statusMessage: "Saving developer todo list",
        },
        effects: [{ type: "SAVE_DEVELOPER_TODO_LIST", rootPath: state.cwd, items: orderedItems }],
      }
    }

    case "DEVELOPER_TODO_LIST_SAVED":
      return {
        state: {
          ...state,
          statusMessage: "Developer todo list updated",
        },
        effects: [],
      }

    case "DEVELOPER_TODO_LIST_SAVE_FAILED":
      return {
        state: {
          ...state,
          statusMessage: event.message,
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
          sidebarCursorPath: event.path,
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
          sidebarCursorPath: remapMovedPath(state.sidebarCursorPath, event.sourcePath, event.destinationPath),
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

    case "PATH_DELETED":
      return {
        state: {
          ...state,
          modal: null,
          selectedPath:
            state.selectedPath && isSameOrDescendantPath(event.path, state.selectedPath) ? null : state.selectedPath,
          sidebarCursorPath:
            state.sidebarCursorPath && isSameOrDescendantPath(event.path, state.sidebarCursorPath)
              ? null
              : state.sidebarCursorPath,
          expandedDirs: pruneExpandedDirs(state.expandedDirs, event.path),
          document:
            state.document.path && isSameOrDescendantPath(event.path, state.document.path)
              ? {
                  path: null,
                  text: "",
                  savedText: "",
                  isDirty: false,
                }
              : state.document,
          statusMessage: `${event.nodeType === "directory" ? "Deleted folder" : "Deleted file"} ${formatPathForDisplay(state.cwd, event.path)}`,
        },
        effects: [{ type: "LOAD_FILE_TREE", rootPath: state.cwd }],
      }

    case "PATH_DELETE_FAILED":
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
          focusedPane: "editor",
          selectedPath: event.path,
          sidebarCursorPath: event.path,
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
        sidebarCursorPath: event.path,
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

    case "CLIPBOARD_COPY_SUCCEEDED":
      return {
        state: withStatus(state, "Copied selection", true),
        effects: [],
      }

    case "CLIPBOARD_COPY_FAILED":
      return {
        state: withStatus(state, event.message, true),
        effects: [],
      }

    default:
      return { state, effects: [] }
  }
}
