import { useEffect, useRef, useState } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import type { KeyEvent, TextareaRenderable } from "@opentui/core"
import { basename } from "node:path"

import { SeedRuntime } from "../app/runtime"
import type { AppEvent, EditorState } from "../core/types"
import { EditorPane } from "./components/EditorPane"
import { SaveAsModal } from "./components/SaveAsModal"
import { SidebarPane } from "./components/SidebarPane"
import { StatusBar } from "./components/StatusBar"
import { UnsavedChangesModal } from "./components/UnsavedChangesModal"
import { commandFromKeyEvent } from "./keybindings"

const EDITOR_MAX_WIDTH = 100
const SIDEBAR_TO_EDITOR_RATIO = 34 / 66
const MAX_LAYOUT_WIDTH_WITH_SIDEBAR = Math.round(EDITOR_MAX_WIDTH * (1 + SIDEBAR_TO_EDITOR_RATIO))

function formatTitle(path: string | null): string {
  if (!path) {
    return "untitled"
  }
  return basename(path)
}

function handleKeyboardEvent(state: EditorState, dispatch: (event: AppEvent) => void, key: KeyEvent): void {
  if (key.name === "escape" && state.modal) {
    dispatch({ type: "PROMPT_CANCEL" })
    return
  }

  if (state.modal?.kind === "unsaved_changes") {
    if (key.name === "left" || key.name === "up") {
      dispatch({ type: "PROMPT_SELECT_PREV" })
      return
    }
    if (key.name === "right" || key.name === "down" || key.name === "tab") {
      dispatch({ type: "PROMPT_SELECT_NEXT" })
      return
    }
    if (key.name === "enter" || key.name === "return") {
      if (state.modal.selectedOption === "save") {
        dispatch({ type: "PROMPT_CHOOSE_SAVE" })
      } else {
        dispatch({ type: "PROMPT_CHOOSE_DONT_SAVE" })
      }
      return
    }
    return
  }

  if (state.modal?.kind === "save_as") {
    return
  }

  const command = commandFromKeyEvent(state.keybindings, key)
  if (!command) {
    return
  }

  const commandMap: Record<typeof command, AppEvent> = {
    quit: { type: "REQUEST_QUIT" },
    save: { type: "REQUEST_SAVE" },
    saveAs: { type: "REQUEST_SAVE_AS" },
    newFile: { type: "REQUEST_NEW_FILE" },
    toggleSidebar: { type: "TOGGLE_SIDEBAR" },
  }
  dispatch(commandMap[command])
}

export function App() {
  const renderer = useRenderer()
  const runtimeRef = useRef<SeedRuntime | null>(null)

  if (!runtimeRef.current) {
    runtimeRef.current = new SeedRuntime(process.cwd(), renderer)
  }

  const runtime = runtimeRef.current
  const [state, setState] = useState(runtime.getState())
  const textareaRef = useRef<TextareaRenderable | null>(null)

  useEffect(() => runtime.subscribe(setState), [runtime])

  useEffect(() => {
    runtime.dispatch({ type: "APP_STARTED" })
  }, [runtime])

  useKeyboard((key) => {
    handleKeyboardEvent(runtime.getState(), runtime.dispatch.bind(runtime), key)
  })

  const locked = state.modal !== null
  const unsavedChangesModal = state.modal?.kind === "unsaved_changes" ? state.modal : null
  const saveAsModal = state.modal?.kind === "save_as" ? state.modal : null
  const contentMaxWidth = state.sidebarVisible ? MAX_LAYOUT_WIDTH_WITH_SIDEBAR : EDITOR_MAX_WIDTH

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor="#0f1318" padding={1}>
      <box
        flexDirection="row"
        flexGrow={1}
        width="100%"
        maxWidth={contentMaxWidth}
        alignSelf="center"
        justifyContent="flex-start"
        gap={state.sidebarVisible ? 1 : 0}
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
        gap={state.sidebarVisible ? 1 : 0}
        marginTop={1}
      >
        <box width={state.sidebarVisible ? "66%" : "100%"} marginLeft={1} marginRight={1}>
          <StatusBar path={state.document.path} isDirty={state.document.isDirty} />
        </box>
        {state.sidebarVisible ? <box width="34%" /> : null}
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
    </box>
  )
}
