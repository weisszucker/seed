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
      kind: "save_as"
      pathInput: string
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

export type KeybindingMap = {
  quit: string
  save: string
  saveAs: string
  newFile: string
  toggleSidebar: string
}

export type EditorState = {
  cwd: string
  document: DocumentState
  fileTree: FileNode[]
  expandedDirs: Record<string, boolean>
  selectedPath: string | null
  sidebarVisible: boolean
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
  | { type: "EXIT_APP" }

export type AppEvent =
  | { type: "APP_STARTED" }
  | { type: "REQUEST_REFRESH_FILE_TREE" }
  | { type: "CONFIG_LOADED"; keybindings: Partial<KeybindingMap> }
  | { type: "CONFIG_LOAD_FAILED"; message: string }
  | { type: "FILE_TREE_LOADED"; nodes: FileNode[] }
  | { type: "FILE_TREE_LOAD_FAILED"; message: string }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "TOGGLE_DIRECTORY"; path: string }
  | { type: "REQUEST_OPEN_FILE"; path: string }
  | { type: "REQUEST_NEW_FILE" }
  | { type: "REQUEST_QUIT" }
  | { type: "REQUEST_SAVE" }
  | { type: "REQUEST_SAVE_AS" }
  | { type: "SAVE_AS_PATH_UPDATED"; path: string }
  | { type: "SAVE_AS_SUBMITTED" }
  | { type: "PROMPT_CHOOSE_SAVE" }
  | { type: "PROMPT_CHOOSE_DONT_SAVE" }
  | { type: "PROMPT_SELECT_PREV" }
  | { type: "PROMPT_SELECT_NEXT" }
  | { type: "PROMPT_CANCEL" }
  | { type: "EDITOR_TEXT_CHANGED"; text: string }
  | { type: "FILE_LOADED"; path: string; text: string }
  | { type: "FILE_LOAD_FAILED"; path: string; message: string }
  | { type: "FILE_SAVED"; path: string }
  | { type: "FILE_SAVE_FAILED"; message: string }

export const DEFAULT_KEYBINDINGS: KeybindingMap = {
  quit: "ctrl+q",
  save: "ctrl+s",
  saveAs: "ctrl+shift+s",
  newFile: "ctrl+n",
  toggleSidebar: "ctrl+l",
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
    sidebarVisible: true,
    keybindings: DEFAULT_KEYBINDINGS,
    modal: null,
    postSaveAction: null,
    statusMessage: "Ready",
  }
}
