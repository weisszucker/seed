import { describe, expect, test } from "bun:test"

import { reduceEvent } from "../src/core/reducer"
import { createInitialState } from "../src/core/types"

function dirtyState() {
  const base = createInitialState("/tmp")
  return {
    ...base,
    document: {
      path: "/tmp/file.md",
      text: "updated",
      savedText: "old",
      isDirty: true,
    },
  }
}

describe("unsaved-change prompt gating", () => {
  test("config load updates leader key and bindings", () => {
    const state = createInitialState("/tmp")
    const result = reduceEvent(state, {
      type: "CONFIG_LOADED",
      leaderKey: "ctrl+b",
      keybindings: { save: "w" },
    })

    expect(result.state.leaderKey).toBe("ctrl+b")
    expect(result.state.keybindings.save).toBe("w")
    expect(result.state.statusMessage).toBe("Config loaded")
  })

  test("refresh request triggers file-tree reload effect", () => {
    const state = createInitialState("/tmp")
    const result = reduceEvent(state, { type: "REQUEST_REFRESH_FILE_TREE" })

    expect(result.effects).toEqual([{ type: "LOAD_FILE_TREE", rootPath: "/tmp" }])
  })

  test("open file while dirty opens prompt and defers action", () => {
    const state = dirtyState()
    const result = reduceEvent(state, { type: "REQUEST_OPEN_FILE", path: "/tmp/next.md" })

    expect(result.state.modal?.kind).toBe("unsaved_changes")
    if (result.state.modal?.kind === "unsaved_changes") {
      expect(result.state.modal.pendingAction).toEqual({ type: "open_file", path: "/tmp/next.md" })
    }
    expect(result.effects).toEqual([])
  })

  test("prompt blocks editor actions while visible", () => {
    const state = dirtyState()
    const prompted = reduceEvent(state, { type: "REQUEST_QUIT" }).state

    const blocked = reduceEvent(prompted, { type: "REQUEST_NEW_FILE" })
    expect(blocked.state.modal?.kind).toBe("unsaved_changes")
    expect(blocked.effects).toEqual([])
  })

  test("dont save executes pending action", () => {
    const state = dirtyState()
    const prompted = reduceEvent(state, { type: "REQUEST_OPEN_FILE", path: "/tmp/next.md" }).state

    const result = reduceEvent(prompted, { type: "PROMPT_CHOOSE_DONT_SAVE" })
    expect(result.effects).toEqual([{ type: "LOAD_FILE", path: "/tmp/next.md" }])
    expect(result.state.modal).toBeNull()
  })

  test("save executes save effect and continues pending action", () => {
    const state = dirtyState()
    const prompted = reduceEvent(state, { type: "REQUEST_OPEN_FILE", path: "/tmp/next.md" }).state
    const saveChosen = reduceEvent(prompted, { type: "PROMPT_CHOOSE_SAVE" })

    expect(saveChosen.effects).toEqual([
      {
        type: "SAVE_FILE",
        path: "/tmp/file.md",
        text: "updated",
      },
    ])

    const afterSaved = reduceEvent(saveChosen.state, { type: "FILE_SAVED", path: "/tmp/file.md" })
    expect(afterSaved.effects).toEqual([{ type: "LOAD_FILE", path: "/tmp/next.md" }])
  })

  test("escape cancels prompt", () => {
    const state = dirtyState()
    const prompted = reduceEvent(state, { type: "REQUEST_NEW_FILE" }).state
    const canceled = reduceEvent(prompted, { type: "PROMPT_CANCEL" })

    expect(canceled.state.modal).toBeNull()
    expect(canceled.effects).toEqual([])
  })

  test("shortcut help opens as a static modal", () => {
    const state = createInitialState("/tmp")
    const result = reduceEvent(state, { type: "REQUEST_SHOW_SHORTCUT_HELP" })

    expect(result.state.modal).toEqual({ kind: "shortcut_help" })
    expect(result.state.statusMessage).toBe("Shortcut help")
    expect(result.effects).toEqual([])
  })

  test("escape closes shortcut help back to ready", () => {
    const state = reduceEvent(createInitialState("/tmp"), { type: "REQUEST_SHOW_SHORTCUT_HELP" }).state
    const result = reduceEvent(state, { type: "PROMPT_CANCEL" })

    expect(result.state.modal).toBeNull()
    expect(result.state.statusMessage).toBe("Ready")
    expect(result.effects).toEqual([])
  })

  test("create path request opens create modal", () => {
    const state = reduceEvent(createInitialState("/tmp"), {
      type: "FILE_LOADED",
      path: "/tmp/current.md",
      text: "hello",
    }).state
    const result = reduceEvent(state, { type: "REQUEST_CREATE_PATH" })

    expect(result.state.modal).toEqual({ kind: "create_path", pathInput: "current.md" })
    expect(result.state.statusMessage).toBe("Create file or folder")
  })

  test("create path submission rejects paths outside root", () => {
    const state = reduceEvent(createInitialState("/tmp/work"), { type: "REQUEST_CREATE_PATH" }).state
    const updated = reduceEvent(state, {
      type: "CREATE_PATH_INPUT_UPDATED",
      path: "../outside.md",
    }).state

    const result = reduceEvent(updated, { type: "CREATE_PATH_SUBMITTED" })
    expect(result.state.statusMessage).toBe("Path must stay within root")
    expect(result.effects).toEqual([])
  })

  test("move path submission resolves trailing slash as destination folder", () => {
    const initial = reduceEvent(createInitialState("/tmp/work"), {
      type: "FILE_LOADED",
      path: "/tmp/work/docs/note.md",
      text: "hello",
    }).state
    const state = reduceEvent(initial, { type: "REQUEST_MOVE_PATH" }).state
    expect(state.modal).toEqual({
      kind: "move_path",
      sourcePathInput: "docs/note.md",
      destinationPathInput: "",
      focusedField: "source",
    })

    const withSource = reduceEvent(state, {
      type: "MOVE_SOURCE_PATH_UPDATED",
      path: "docs/note.md",
    }).state
    const withDestination = reduceEvent(withSource, {
      type: "MOVE_DESTINATION_PATH_UPDATED",
      path: "archive/",
    }).state

    const result = reduceEvent(withDestination, { type: "MOVE_PATH_SUBMITTED" })
    expect(result.effects).toEqual([
      {
        type: "MOVE_PATH",
        rootPath: "/tmp/work",
        sourcePath: "/tmp/work/docs/note.md",
        destinationPath: "/tmp/work/archive/note.md",
      },
    ])
  })

  test("moved open document path is remapped", () => {
    const initial = createInitialState("/tmp/work")
    const loaded = reduceEvent(initial, {
      type: "FILE_LOADED",
      path: "/tmp/work/docs/note.md",
      text: "hello",
    }).state

    const result = reduceEvent(loaded, {
      type: "PATH_MOVED",
      sourcePath: "/tmp/work/docs",
      destinationPath: "/tmp/work/archive/docs",
    })

    expect(result.state.document.path).toBe("/tmp/work/archive/docs/note.md")
    expect(result.state.selectedPath).toBe("/tmp/work/archive/docs/note.md")
  })
})
