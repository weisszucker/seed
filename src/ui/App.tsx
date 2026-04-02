import { useEffect, useRef, useState } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import {
  type InputRenderable,
  type KeyEvent,
  type Selection,
  type SyntaxStyle,
  type TextareaRenderable,
  type TreeSitterClient,
} from "@opentui/core"
import { basename } from "node:path"

import { SeedRuntime, type RuntimeEffectRunner } from "../app/runtime"
import type { AppEvent, EditorState } from "../core/types"
import type { E2eHookSink } from "../e2e/hooks"
import { EditorPane } from "./components/EditorPane"
import { DeleteConfirmModal } from "./components/DeleteConfirmModal"
import { MovePathModal } from "./components/MovePathModal"
import { SaveAsModal } from "./components/SaveAsModal"
import { SidebarPane } from "./components/SidebarPane"
import { ShortcutHelpModal } from "./components/ShortcutHelpModal"
import { StatusBar } from "./components/StatusBar"
import { UnsavedChangesModal } from "./components/UnsavedChangesModal"
import {
  formatKeybinding,
  matchesEditableUndoShortcut,
  resolveLeaderKeyEvent,
  shouldInsertEditorTab,
  type CommandName,
} from "./keybindings"
import { getContentMaxWidth, uiColors, uiLayout } from "../theme"
import { createEditorHighlightClient, createEditorSyntaxStyle } from "./editorHighlighting"

const LEADER_TIMEOUT_MS = 1500
function formatTitle(path: string | null): string {
  if (!path) {
    return "untitled"
  }
  return basename(path)
}

type AppProps = {
  cwd?: string
  effectRunner?: RuntimeEffectRunner
  e2eHookSink?: E2eHookSink | null
}

const commandMap: Record<CommandName, AppEvent> = {
  quit: { type: "REQUEST_QUIT" },
  save: { type: "REQUEST_SAVE" },
  saveAs: { type: "REQUEST_SAVE_AS" },
  newFile: { type: "REQUEST_NEW_FILE" },
  createPath: { type: "REQUEST_CREATE_PATH" },
  movePath: { type: "REQUEST_MOVE_PATH" },
  toggleSidebar: { type: "TOGGLE_SIDEBAR" },
  shiftFocus: { type: "TOGGLE_FOCUS_PANE" },
  showShortcutHelp: { type: "REQUEST_SHOW_SHORTCUT_HELP" },
}

function dispatchCommand(dispatch: (event: AppEvent) => void, command: CommandName): void {
  dispatch(commandMap[command])
}

function handleModalKeyboardEvent(
  state: EditorState,
  dispatch: (event: AppEvent) => void,
  key: KeyEvent,
): "none" | "consume" | "pass_through" {
  if (key.name === "escape" && state.modal) {
    dispatch({ type: "PROMPT_CANCEL" })
    return "consume"
  }

  if (state.modal?.kind === "unsaved_changes") {
    if (key.name === "left" || key.name === "up") {
      dispatch({ type: "PROMPT_SELECT_PREV" })
      return "consume"
    }
    if (key.name === "right" || key.name === "down" || key.name === "tab") {
      dispatch({ type: "PROMPT_SELECT_NEXT" })
      return "consume"
    }
    if (key.name === "enter" || key.name === "return") {
      if (state.modal.selectedOption === "save") {
        dispatch({ type: "PROMPT_CHOOSE_SAVE" })
      } else {
        dispatch({ type: "PROMPT_CHOOSE_DONT_SAVE" })
      }
      return "consume"
    }
    return "consume"
  }

  if (state.modal?.kind === "delete_confirm") {
    if (key.name === "left" || key.name === "up") {
      dispatch({ type: "PROMPT_SELECT_PREV" })
      return "consume"
    }
    if (key.name === "right" || key.name === "down" || key.name === "tab") {
      dispatch({ type: "PROMPT_SELECT_NEXT" })
      return "consume"
    }
    if (key.name === "enter" || key.name === "return") {
      if (state.modal.selectedOption === "delete") {
        dispatch({ type: "DELETE_CONFIRM_ACCEPT" })
      } else {
        dispatch({ type: "PROMPT_CANCEL" })
      }
      return "consume"
    }
    return "consume"
  }

  if (state.modal?.kind === "save_as") {
    return "pass_through"
  }

  if (state.modal?.kind === "create_path") {
    return "pass_through"
  }

  if (state.modal?.kind === "move_path") {
    if (key.name === "tab" || key.name === "up" || key.name === "down") {
      dispatch({
        type: "MOVE_PATH_FOCUS_CHANGED",
        field: state.modal.focusedField === "source" ? "destination" : "source",
      })
      return "consume"
    }
    return "pass_through"
  }

  if (state.modal?.kind === "shortcut_help") {
    return "consume"
  }

  return "none"
}

function handleSidebarKeyboardEvent(
  state: EditorState,
  dispatch: (event: AppEvent) => void,
  key: KeyEvent,
  leaderPending: boolean,
): boolean {
  if (state.focusedPane !== "sidebar") {
    return false
  }

  if (leaderPending) {
    return false
  }

  const hasModifier = Boolean(key.ctrl) || Boolean(key.meta) || Boolean(key.shift)

  if (key.name === "escape") {
    dispatch({ type: "FOCUS_EDITOR" })
    return true
  }

  if (hasModifier) {
    return false
  }

  if (key.name === "up") {
    dispatch({ type: "SIDEBAR_SELECT_PREV" })
    return true
  }

  if (key.name === "w" || key.name === "k") {
    dispatch({ type: "SIDEBAR_SELECT_PREV" })
    return true
  }

  if (key.name === "down") {
    dispatch({ type: "SIDEBAR_SELECT_NEXT" })
    return true
  }

  if (key.name === "s" || key.name === "j") {
    dispatch({ type: "SIDEBAR_SELECT_NEXT" })
    return true
  }

  if (key.name === "left") {
    dispatch({ type: "SIDEBAR_COLLAPSE_SELECTION" })
    return true
  }

  if (key.name === "a" || key.name === "h") {
    dispatch({ type: "SIDEBAR_COLLAPSE_SELECTION" })
    return true
  }

  if (key.name === "right") {
    dispatch({ type: "SIDEBAR_EXPAND_SELECTION" })
    return true
  }

  if (key.name === "d" || key.name === "l") {
    dispatch({ type: "SIDEBAR_EXPAND_SELECTION" })
    return true
  }

  if (key.name === "enter" || key.name === "return" || key.name === "space") {
    dispatch({ type: "SIDEBAR_ACTIVATE_SELECTION" })
    return true
  }

  if (key.name === "backspace" || key.name === "delete") {
    dispatch({ type: "SIDEBAR_REQUEST_DELETE_SELECTION" })
    return true
  }

  return false
}

type UndoableRenderable = {
  undo: () => boolean
}

export function App({ cwd = process.cwd(), effectRunner, e2eHookSink = null }: AppProps) {
  const renderer = useRenderer()
  const runtimeRef = useRef<SeedRuntime | null>(null)

  if (!runtimeRef.current) {
    runtimeRef.current = new SeedRuntime(cwd, renderer, effectRunner, e2eHookSink)
  }

  const runtime = runtimeRef.current
  const [state, setState] = useState(runtime.getState())
  const [leaderPending, setLeaderPending] = useState(false)
  const textareaRef = useRef<TextareaRenderable | null>(null)
  const saveAsInputRef = useRef<InputRenderable | null>(null)
  const createPathInputRef = useRef<InputRenderable | null>(null)
  const moveSourceInputRef = useRef<InputRenderable | null>(null)
  const moveDestinationInputRef = useRef<InputRenderable | null>(null)
  const leaderPendingRef = useRef(false)
  const leaderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const treeSitterClientRef = useRef<TreeSitterClient | null>(null)
  const syntaxStyleRef = useRef<SyntaxStyle | null>(null)

  if (!treeSitterClientRef.current) {
    treeSitterClientRef.current = createEditorHighlightClient(cwd)
  }

  if (!syntaxStyleRef.current) {
    syntaxStyleRef.current = createEditorSyntaxStyle()
  }

  const treeSitterClient = treeSitterClientRef.current
  const syntaxStyle = syntaxStyleRef.current

  useEffect(() => runtime.subscribe(setState), [runtime])

  useEffect(() => {
    runtime.dispatch({ type: "APP_STARTED" })
  }, [runtime])

  useEffect(() => {
    void treeSitterClient.preloadParser("markdown")

    return () => {
      void treeSitterClient.destroy()
      syntaxStyle.destroy()
    }
  }, [syntaxStyle, treeSitterClient])

  useEffect(() => {
    leaderPendingRef.current = leaderPending
  }, [leaderPending])

  useEffect(() => {
    return () => {
      if (leaderTimeoutRef.current) {
        clearTimeout(leaderTimeoutRef.current)
      }

      runtime.emitAppExit()
    }
  }, [])

  useEffect(() => {
    if (!textareaRef.current) {
      return
    }

    if (state.modal || state.focusedPane === "sidebar") {
      textareaRef.current.blur()
      return
    }

    textareaRef.current.focus()
  }, [state.document.path, state.focusedPane, state.modal])

  useEffect(() => {
    function handleSelection(selection: Selection): void {
      const text = selection.getSelectedText()
      if (!text) {
        return
      }

      runtime.dispatch({ type: "REQUEST_COPY_TEXT", text })
    }

    renderer.on("selection", handleSelection)

    return () => {
      renderer.off("selection", handleSelection)
    }
  }, [renderer, runtime])

  function clearLeaderTimeout(): void {
    if (!leaderTimeoutRef.current) {
      return
    }
    clearTimeout(leaderTimeoutRef.current)
    leaderTimeoutRef.current = null
  }

  function setLeaderPendingState(nextValue: boolean): void {
    leaderPendingRef.current = nextValue
    setLeaderPending(nextValue)
  }

  function clearLeaderPending(): void {
    clearLeaderTimeout()
    setLeaderPendingState(false)
  }

  function armLeaderTimeout(): void {
    clearLeaderTimeout()
    leaderTimeoutRef.current = setTimeout(() => {
      leaderTimeoutRef.current = null
      setLeaderPendingState(false)
    }, LEADER_TIMEOUT_MS)
  }

  function getActiveUndoTarget(currentState: EditorState): UndoableRenderable | null {
    if (currentState.modal?.kind === "save_as") {
      return saveAsInputRef.current
    }

    if (currentState.modal?.kind === "create_path") {
      return createPathInputRef.current
    }

    if (currentState.modal?.kind === "move_path") {
      return currentState.modal.focusedField === "source" ? moveSourceInputRef.current : moveDestinationInputRef.current
    }

    if (currentState.modal || currentState.focusedPane !== "editor") {
      return null
    }

    return textareaRef.current
  }

  function tryHandleEditableUndo(currentState: EditorState, key: KeyEvent): boolean {
    if (!matchesEditableUndoShortcut(process.platform, key)) {
      return false
    }

    const target = getActiveUndoTarget(currentState)
    if (!target) {
      return false
    }

    key.preventDefault()
    key.stopPropagation()
    target.undo()
    clearLeaderPending()
    return true
  }

  useKeyboard((key) => {
    const currentState = runtime.getState()
    const dispatch = (event: AppEvent) => runtime.dispatch(event)

    const modalResult = handleModalKeyboardEvent(currentState, dispatch, key)
    if (modalResult === "consume") {
      key.preventDefault()
      key.stopPropagation()
      clearLeaderPending()
      return
    }
    if (modalResult === "pass_through") {
      if (tryHandleEditableUndo(currentState, key)) {
        return
      }

      clearLeaderPending()
      return
    }

    if (handleSidebarKeyboardEvent(currentState, dispatch, key, leaderPendingRef.current)) {
      key.preventDefault()
      key.stopPropagation()
      clearLeaderPending()
      return
    }

    if (shouldInsertEditorTab(currentState, leaderPendingRef.current, key)) {
      key.preventDefault()
      key.stopPropagation()
      textareaRef.current?.insertText("\t")
      return
    }

    if (leaderPendingRef.current) {
      const resolution = resolveLeaderKeyEvent(
        leaderPendingRef.current,
        currentState.leaderKey,
        currentState.keybindings,
        key,
      )

      key.preventDefault()
      key.stopPropagation()
      clearLeaderPending()

      if (resolution.type === "command") {
        dispatchCommand(dispatch, resolution.command)
      }
      return
    }

    if (tryHandleEditableUndo(currentState, key)) {
      return
    }

    const resolution = resolveLeaderKeyEvent(
      leaderPendingRef.current,
      currentState.leaderKey,
      currentState.keybindings,
      key,
    )

    if (resolution.type === "ignored") {
      return
    }

    key.preventDefault()
    key.stopPropagation()

    if (resolution.type === "leader_pressed") {
      setLeaderPendingState(true)
      armLeaderTimeout()
      return
    }

    if (resolution.type === "leader_repeat") {
      return
    }

    clearLeaderPending()

    if (resolution.type === "command") {
      dispatchCommand(dispatch, resolution.command)
    }
  })

  const locked = state.modal !== null
  const unsavedChangesModal = state.modal?.kind === "unsaved_changes" ? state.modal : null
  const deleteConfirmModal = state.modal?.kind === "delete_confirm" ? state.modal : null
  const saveAsModal = state.modal?.kind === "save_as" ? state.modal : null
  const createPathModal = state.modal?.kind === "create_path" ? state.modal : null
  const movePathModal = state.modal?.kind === "move_path" ? state.modal : null
  const shortcutHelpModal = state.modal?.kind === "shortcut_help" ? state.modal : null
  const contentMaxWidth = getContentMaxWidth(state.sidebarVisible)
  const leaderHint = leaderPending ? `Leader: ${formatKeybinding(state.leaderKey, "[key]")}` : null

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={uiColors.appBackground} padding={uiLayout.appPadding}>
      <box
        flexDirection="row"
        flexGrow={1}
        width="100%"
        maxWidth={contentMaxWidth}
        alignSelf="center"
        justifyContent="flex-start"
        gap={state.sidebarVisible ? uiLayout.rowGap : 0}
      >
        <EditorPane
          sidebarVisible={state.sidebarVisible}
          title={formatTitle(state.document.path)}
          documentPath={state.document.path}
          text={state.document.text}
          textareaRef={textareaRef}
          treeSitterClient={treeSitterClient}
          syntaxStyle={syntaxStyle}
          focused={!locked && state.focusedPane === "editor"}
          canRequestFocus={!locked}
          onRequestFocus={() => runtime.dispatch({ type: "FOCUS_EDITOR" })}
          onTextChanged={(text) => runtime.dispatch({ type: "EDITOR_TEXT_CHANGED", text })}
        />
        <SidebarPane
          visible={state.sidebarVisible}
          cwd={state.cwd}
          fileTree={state.fileTree}
          expandedDirs={state.expandedDirs}
          selectedPath={state.selectedPath}
          cursorPath={state.sidebarCursorPath}
          focused={state.focusedPane === "sidebar"}
          locked={locked}
          dispatch={(event) => runtime.dispatch(event)}
        />
      </box>

      <box
        flexDirection="row"
        width="100%"
        maxWidth={contentMaxWidth}
        alignSelf="center"
        justifyContent="flex-start"
        gap={state.sidebarVisible ? uiLayout.rowGap : 0}
        marginTop={uiLayout.statusMarginTop}
      >
        <box width={state.sidebarVisible ? uiLayout.editorWidthPercent : "100%"} marginLeft={uiLayout.panelOuterMarginX} marginRight={uiLayout.panelOuterMarginX}>
          <StatusBar
            cwd={state.cwd}
            path={state.document.path}
            isDirty={state.document.isDirty}
            statusMessage={state.statusMessage}
            leaderHint={leaderHint}
          />
        </box>
        {state.sidebarVisible ? <box width={uiLayout.sidebarWidthPercent} /> : null}
      </box>

      {unsavedChangesModal ? (
        <UnsavedChangesModal
          selectedOption={unsavedChangesModal.selectedOption}
          onChooseSave={() => runtime.dispatch({ type: "PROMPT_CHOOSE_SAVE" })}
          onChooseDontSave={() => runtime.dispatch({ type: "PROMPT_CHOOSE_DONT_SAVE" })}
          onCancel={() => runtime.dispatch({ type: "PROMPT_CANCEL" })}
        />
      ) : null}

      {deleteConfirmModal ? (
        <DeleteConfirmModal
          path={deleteConfirmModal.path}
          nodeType={deleteConfirmModal.nodeType}
          selectedOption={deleteConfirmModal.selectedOption}
          onConfirm={() => runtime.dispatch({ type: "DELETE_CONFIRM_ACCEPT" })}
          onCancel={() => runtime.dispatch({ type: "PROMPT_CANCEL" })}
        />
      ) : null}

      {saveAsModal ? (
        <SaveAsModal
          title="Save As"
          pathInput={saveAsModal.pathInput}
          placeholder="Enter path from workspace root"
          inputRef={saveAsInputRef}
          onPathChange={(path) => runtime.dispatch({ type: "SAVE_AS_PATH_UPDATED", path })}
          onSubmit={() => runtime.dispatch({ type: "SAVE_AS_SUBMITTED" })}
          onCancel={() => runtime.dispatch({ type: "PROMPT_CANCEL" })}
        />
      ) : null}

      {createPathModal ? (
        <SaveAsModal
          title="Create"
          pathInput={createPathModal.pathInput}
          placeholder="Enter path from workspace root"
          inputRef={createPathInputRef}
          onPathChange={(path) => runtime.dispatch({ type: "CREATE_PATH_INPUT_UPDATED", path })}
          onSubmit={() => runtime.dispatch({ type: "CREATE_PATH_SUBMITTED" })}
          onCancel={() => runtime.dispatch({ type: "PROMPT_CANCEL" })}
        />
      ) : null}

      {movePathModal ? (
        <MovePathModal
          sourcePathInput={movePathModal.sourcePathInput}
          destinationPathInput={movePathModal.destinationPathInput}
          focusedField={movePathModal.focusedField}
          sourceInputRef={moveSourceInputRef}
          destinationInputRef={moveDestinationInputRef}
          onSourcePathChange={(path) => runtime.dispatch({ type: "MOVE_SOURCE_PATH_UPDATED", path })}
          onDestinationPathChange={(path) => runtime.dispatch({ type: "MOVE_DESTINATION_PATH_UPDATED", path })}
          onFocusChange={(field) => runtime.dispatch({ type: "MOVE_PATH_FOCUS_CHANGED", field })}
          onSubmit={() => runtime.dispatch({ type: "MOVE_PATH_SUBMITTED" })}
          onCancel={() => runtime.dispatch({ type: "PROMPT_CANCEL" })}
        />
      ) : null}

      {shortcutHelpModal ? (
        <ShortcutHelpModal
          leaderKey={state.leaderKey}
          keybindings={state.keybindings}
          onClose={() => runtime.dispatch({ type: "PROMPT_CANCEL" })}
        />
      ) : null}
    </box>
  )
}
