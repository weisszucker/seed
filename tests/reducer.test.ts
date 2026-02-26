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
})
