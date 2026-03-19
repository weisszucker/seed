import { describe, expect, test } from "bun:test"

import { reduceEvent } from "../src/core/reducer"
import { createInitialState } from "../src/core/types"

describe("smoke flows", () => {
  test("untitled save flow submits save effect", () => {
    const initial = createInitialState("/tmp")
    const changed = reduceEvent(initial, { type: "EDITOR_TEXT_CHANGED", text: "hello" }).state

    const saveRequest = reduceEvent(changed, { type: "REQUEST_SAVE" })
    expect(saveRequest.state.modal?.kind).toBe("save_as")

    const withPath = reduceEvent(saveRequest.state, {
      type: "SAVE_AS_PATH_UPDATED",
      path: "hello.md",
    }).state

    const submitted = reduceEvent(withPath, { type: "SAVE_AS_SUBMITTED" })
    expect(submitted.effects).toEqual([
      {
        type: "SAVE_FILE",
        path: "/tmp/hello.md",
        text: "hello",
      },
    ])

    const saved = reduceEvent(submitted.state, { type: "FILE_SAVED", path: "/tmp/hello.md" })
    expect(saved.state.document.path).toBe("/tmp/hello.md")
    expect(saved.state.document.isDirty).toBeFalse()
  })

  test("save flow rejects absolute save path input", () => {
    const initial = createInitialState("/tmp/work")
    const changed = reduceEvent(initial, { type: "EDITOR_TEXT_CHANGED", text: "hello" }).state

    const saveRequest = reduceEvent(changed, { type: "REQUEST_SAVE" })
    const withPath = reduceEvent(saveRequest.state, {
      type: "SAVE_AS_PATH_UPDATED",
      path: "/tmp/work/hello.md",
    }).state

    const submitted = reduceEvent(withPath, { type: "SAVE_AS_SUBMITTED" })
    expect(submitted.state.statusMessage).toBe("Path must stay within root")
    expect(submitted.effects).toEqual([])
  })

  test("untitled save flow resolves relative save path against cwd", () => {
    const initial = createInitialState("/tmp/work")
    const changed = reduceEvent(initial, { type: "EDITOR_TEXT_CHANGED", text: "hello" }).state

    const saveRequest = reduceEvent(changed, { type: "REQUEST_SAVE" })
    expect(saveRequest.state.modal?.kind).toBe("save_as")

    const withPath = reduceEvent(saveRequest.state, {
      type: "SAVE_AS_PATH_UPDATED",
      path: "hello.md",
    }).state

    const submitted = reduceEvent(withPath, { type: "SAVE_AS_SUBMITTED" })
    expect(submitted.effects).toEqual([
      {
        type: "SAVE_FILE",
        path: "/tmp/work/hello.md",
        text: "hello",
      },
    ])
  })

  test("dirty new-file request is gated by unsaved prompt", () => {
    const initial = createInitialState("/tmp")
    const changed = reduceEvent(initial, { type: "EDITOR_TEXT_CHANGED", text: "draft" }).state

    const requested = reduceEvent(changed, { type: "REQUEST_NEW_FILE" })
    expect(requested.state.modal?.kind).toBe("unsaved_changes")

    const blockedEdit = reduceEvent(requested.state, { type: "EDITOR_TEXT_CHANGED", text: "ignored" })
    expect(blockedEdit.state.document.text).toBe("draft")

    const discard = reduceEvent(requested.state, { type: "PROMPT_CHOOSE_DONT_SAVE" })
    expect(discard.state.document.text).toBe("")
    expect(discard.state.document.path).toBeNull()
  })

  test("dirty quit with save triggers save then exit", () => {
    const initial = createInitialState("/tmp")
    const loaded = reduceEvent(initial, {
      type: "FILE_LOADED",
      path: "/tmp/file.md",
      text: "old",
    }).state
    const changed = reduceEvent(loaded, { type: "EDITOR_TEXT_CHANGED", text: "new" }).state

    const quitRequested = reduceEvent(changed, { type: "REQUEST_QUIT" })
    expect(quitRequested.state.modal?.kind).toBe("unsaved_changes")

    const chooseSave = reduceEvent(quitRequested.state, { type: "PROMPT_CHOOSE_SAVE" })
    expect(chooseSave.effects).toEqual([
      {
        type: "SAVE_FILE",
        path: "/tmp/file.md",
        text: "new",
      },
    ])

    const afterSaved = reduceEvent(chooseSave.state, { type: "FILE_SAVED", path: "/tmp/file.md" })
    expect(afterSaved.effects).toEqual([{ type: "EXIT_APP" }])
  })

  test("save as request opens save-as modal", () => {
    const initial = createInitialState("/tmp")
    const loaded = reduceEvent(initial, {
      type: "FILE_LOADED",
      path: "/tmp/file.md",
      text: "abc",
    }).state

    const result = reduceEvent(loaded, { type: "REQUEST_SAVE_AS" })
    expect(result.state.modal).toEqual({ kind: "save_as", pathInput: "file.md" })
  })
})
