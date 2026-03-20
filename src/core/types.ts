export type PendingAction =
  | { type: "open_file"; path: string }
  | { type: "new_file" }
  | { type: "quit" }

export type ModalState =
  | {
      kind: "unsaved_changes"
      pendingAction: PendingAction
      selectedOption: "save" | "dont_save"
    }
  | {
      kind: "shortcut_help"
    }
  | {
      kind: "delete_confirm"
      path: string
      nodeType: "file" | "directory"
      selectedOption: "cancel" | "delete"
    }
  | {
      kind: "save_as"
      pathInput: string
    }
  | {
      kind: "create_path"
      pathInput: string
    }
  | {
      kind: "move_path"
      sourcePathInput: string
      destinationPathInput: string
      focusedField: "source" | "destination"
    }

export type FileNode = {
  name: string
  path: string
  isDirectory: boolean
  children: FileNode[]
}

export type DocumentState = {
  path: string | null
  text: string
  savedText: string
  isDirty: boolean
}

export type FocusedPane = "editor" | "sidebar"

export type KeybindingMap = {
  quit: string
  save: string
  saveAs: string
  newFile: string
  createPath: string
  movePath: string
  toggleSidebar: string
  shiftFocus: string
  showShortcutHelp: string
}

export type EditorState = {
  cwd: string
  document: DocumentState
  fileTree: FileNode[]
  expandedDirs: Record<string, boolean>
  selectedPath: string | null
  sidebarCursorPath: string | null
  sidebarVisible: boolean
  focusedPane: FocusedPane
  leaderKey: string
  keybindings: KeybindingMap
  modal: ModalState | null
  postSaveAction: PendingAction | null
  statusMessage: string
}

export type AppEffect =
  | { type: "LOAD_CONFIG" }
  | { type: "LOAD_FILE_TREE"; rootPath: string }
  | { type: "LOAD_FILE"; path: string }
  | { type: "SAVE_FILE"; path: string; text: string }
  | { type: "CREATE_PATH"; rootPath: string; path: string; nodeType: "file" | "directory" }
  | { type: "MOVE_PATH"; rootPath: string; sourcePath: string; destinationPath: string }
  | { type: "DELETE_PATH"; path: string; nodeType: "file" | "directory" }
  | { type: "EXIT_APP" }

export type AppEvent =
  | { type: "APP_STARTED" }
  | { type: "REQUEST_REFRESH_FILE_TREE" }
  | { type: "CONFIG_LOADED"; leaderKey?: string; keybindings: Partial<KeybindingMap> }
  | { type: "CONFIG_LOAD_FAILED"; message: string }
  | { type: "FILE_TREE_LOADED"; nodes: FileNode[] }
  | { type: "FILE_TREE_LOAD_FAILED"; message: string }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "TOGGLE_FOCUS_PANE" }
  | { type: "FOCUS_EDITOR" }
  | { type: "FOCUS_SIDEBAR" }
  | { type: "TOGGLE_DIRECTORY"; path: string }
  | { type: "SIDEBAR_SELECT_PREV" }
  | { type: "SIDEBAR_SELECT_NEXT" }
  | { type: "SIDEBAR_ACTIVATE_SELECTION" }
  | { type: "SIDEBAR_EXPAND_SELECTION" }
  | { type: "SIDEBAR_COLLAPSE_SELECTION" }
  | { type: "SIDEBAR_REQUEST_DELETE_SELECTION" }
  | { type: "REQUEST_OPEN_FILE"; path: string }
  | { type: "REQUEST_NEW_FILE" }
  | { type: "REQUEST_QUIT" }
  | { type: "REQUEST_SAVE" }
  | { type: "REQUEST_SAVE_AS" }
  | { type: "REQUEST_CREATE_PATH" }
  | { type: "REQUEST_MOVE_PATH" }
  | { type: "REQUEST_SHOW_SHORTCUT_HELP" }
  | { type: "SAVE_AS_PATH_UPDATED"; path: string }
  | { type: "SAVE_AS_SUBMITTED" }
  | { type: "CREATE_PATH_INPUT_UPDATED"; path: string }
  | { type: "CREATE_PATH_SUBMITTED" }
  | { type: "MOVE_SOURCE_PATH_UPDATED"; path: string }
  | { type: "MOVE_DESTINATION_PATH_UPDATED"; path: string }
  | { type: "MOVE_PATH_FOCUS_CHANGED"; field: "source" | "destination" }
  | { type: "MOVE_PATH_SUBMITTED" }
  | { type: "PROMPT_CHOOSE_SAVE" }
  | { type: "PROMPT_CHOOSE_DONT_SAVE" }
  | { type: "DELETE_CONFIRM_ACCEPT" }
  | { type: "PROMPT_SELECT_PREV" }
  | { type: "PROMPT_SELECT_NEXT" }
  | { type: "PROMPT_CANCEL" }
  | { type: "EDITOR_TEXT_CHANGED"; text: string }
  | { type: "FILE_LOADED"; path: string; text: string }
  | { type: "FILE_LOAD_FAILED"; path: string; message: string }
  | { type: "FILE_SAVED"; path: string }
  | { type: "FILE_SAVE_FAILED"; message: string }
  | { type: "PATH_CREATED"; path: string; nodeType: "file" | "directory" }
  | { type: "PATH_CREATE_FAILED"; message: string }
  | { type: "PATH_MOVED"; sourcePath: string; destinationPath: string }
  | { type: "PATH_MOVE_FAILED"; message: string }
  | { type: "PATH_DELETED"; path: string; nodeType: "file" | "directory" }
  | { type: "PATH_DELETE_FAILED"; message: string }

export const DEFAULT_LEADER_KEY = "ctrl+l"

export const DEFAULT_KEYBINDINGS: KeybindingMap = {
  quit: "q",
  save: "s",
  saveAs: "shift+s",
  newFile: "n",
  createPath: "c",
  movePath: "m",
  toggleSidebar: "e",
  shiftFocus: "l",
  showShortcutHelp: "k",
}

export function createInitialState(cwd: string): EditorState {
  return {
    cwd,
    document: {
      path: null,
      text: "",
      savedText: "",
      isDirty: false,
    },
    fileTree: [],
    expandedDirs: {},
    selectedPath: null,
    sidebarCursorPath: null,
    sidebarVisible: true,
    focusedPane: "editor",
    leaderKey: DEFAULT_LEADER_KEY,
    keybindings: DEFAULT_KEYBINDINGS,
    modal: null,
    postSaveAction: null,
    statusMessage: "Ready",
  }
}
