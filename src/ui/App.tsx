import { useEffect, useRef, useState } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import type { KeyEvent, TextareaRenderable } from "@opentui/core"
import { basename } from "node:path"

import { SeedRuntime, type RuntimeEffectRunner } from "../app/runtime"
import type { AppEvent, EditorState } from "../core/types"
import { EditorPane } from "./components/EditorPane"
import { SaveAsModal } from "./components/SaveAsModal"
import { SidebarPane } from "./components/SidebarPane"
import { ShortcutHelpModal } from "./components/ShortcutHelpModal"
import { StatusBar } from "./components/StatusBar"
import { UnsavedChangesModal } from "./components/UnsavedChangesModal"
import { formatKeybinding, resolveLeaderKeyEvent, type CommandName } from "./keybindings"
import { getContentMaxWidth, uiColors, uiLayout } from "../theme"

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
}

const commandMap: Record<CommandName, AppEvent> = {
  quit: { type: "REQUEST_QUIT" },
  save: { type: "REQUEST_SAVE" },
  saveAs: { type: "REQUEST_SAVE_AS" },
  newFile: { type: "REQUEST_NEW_FILE" },
  toggleSidebar: { type: "TOGGLE_SIDEBAR" },
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

  if (state.modal?.kind === "save_as") {
    return "pass_through"
  }

  if (state.modal?.kind === "shortcut_help") {
    return "consume"
  }

  return "none"
}

export function App({ cwd = process.cwd(), effectRunner }: AppProps) {
  const renderer = useRenderer()
  const runtimeRef = useRef<SeedRuntime | null>(null)

  if (!runtimeRef.current) {
    runtimeRef.current = new SeedRuntime(cwd, renderer, effectRunner)
  }

  const runtime = runtimeRef.current
  const [state, setState] = useState(runtime.getState())
  const [leaderPending, setLeaderPending] = useState(false)
  const textareaRef = useRef<TextareaRenderable | null>(null)
  const leaderPendingRef = useRef(false)
  const leaderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => runtime.subscribe(setState), [runtime])

  useEffect(() => {
    runtime.dispatch({ type: "APP_STARTED" })
  }, [runtime])

  useEffect(() => {
    leaderPendingRef.current = leaderPending
  }, [leaderPending])

  useEffect(() => {
    return () => {
      if (leaderTimeoutRef.current) {
        clearTimeout(leaderTimeoutRef.current)
      }
    }
  }, [])

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
      clearLeaderPending()
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
  const saveAsModal = state.modal?.kind === "save_as" ? state.modal : null
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
          locked={locked}
          onTextChanged={(text) => runtime.dispatch({ type: "EDITOR_TEXT_CHANGED", text })}
        />
        <SidebarPane
          visible={state.sidebarVisible}
          cwd={state.cwd}
          fileTree={state.fileTree}
          expandedDirs={state.expandedDirs}
          selectedPath={state.selectedPath}
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

      {saveAsModal ? (
        <SaveAsModal
          pathInput={saveAsModal.pathInput}
          onPathChange={(path) => runtime.dispatch({ type: "SAVE_AS_PATH_UPDATED", path })}
          onSubmit={() => runtime.dispatch({ type: "SAVE_AS_SUBMITTED" })}
          onCancel={() => runtime.dispatch({ type: "PROMPT_CANCEL" })}
        />
      ) : null}

      {shortcutHelpModal ? (
        <ShortcutHelpModal
          keybindings={state.keybindings}
          onClose={() => runtime.dispatch({ type: "PROMPT_CANCEL" })}
        />
      ) : null}
    </box>
  )
}
