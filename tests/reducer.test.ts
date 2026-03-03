import { describe, expect, test } from "bun:test"

import { reduceEvent } from "../src/core/reducer"
import { createInitialState, type FileNode } from "../src/core/types"

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

function sidebarTree(): FileNode[] {
  return [
    {
      name: "docs",
      path: "/tmp/docs",
      isDirectory: true,
      children: [
        {
          name: "guide.md",
          path: "/tmp/docs/guide.md",
          isDirectory: false,
          children: [],
        },
      ],
    },
    {
      name: "readme.md",
      path: "/tmp/readme.md",
      isDirectory: false,
      children: [],
    },
  ]
}

describe("sidebar keyboard flow", () => {
  test("ctrl+t focus toggle switches to sidebar and seeds cursor", () => {
    const state = createInitialState("/tmp")
    const loaded = reduceEvent(state, { type: "FILE_TREE_LOADED", nodes: sidebarTree() }).state

    const result = reduceEvent(loaded, { type: "TOGGLE_FOCUS_TARGET" })
    expect(result.state.focusTarget).toBe("sidebar")
    expect(result.state.sidebarCursorPath).toBe("/tmp/docs")
  })

  test("arrow navigation moves cursor in visible tree", () => {
    const state = createInitialState("/tmp")
    const loaded = reduceEvent(state, { type: "FILE_TREE_LOADED", nodes: sidebarTree() }).state
    const focused = reduceEvent(loaded, { type: "TOGGLE_FOCUS_TARGET" }).state

    const down1 = reduceEvent(focused, { type: "SIDEBAR_MOVE_DOWN" }).state
    expect(down1.sidebarCursorPath).toBe("/tmp/readme.md")

    const up1 = reduceEvent(down1, { type: "SIDEBAR_MOVE_UP" }).state
    expect(up1.sidebarCursorPath).toBe("/tmp/docs")
  })

  test("enter on folder toggles expand and enter on file opens file", () => {
    const state = createInitialState("/tmp")
    const loaded = reduceEvent(state, { type: "FILE_TREE_LOADED", nodes: sidebarTree() }).state

    const expanded = reduceEvent(
      {
        ...loaded,
        sidebarCursorPath: "/tmp/docs",
      },
      { type: "SIDEBAR_ACTIVATE" },
    ).state
    expect(expanded.expandedDirs["/tmp/docs"]).toBeTrue()

    const selectChild = reduceEvent(expanded, { type: "SIDEBAR_MOVE_DOWN" }).state
    expect(selectChild.sidebarCursorPath).toBe("/tmp/docs/guide.md")

    const openResult = reduceEvent(selectChild, { type: "SIDEBAR_ACTIVATE" })
    expect(openResult.effects).toEqual([{ type: "LOAD_FILE", path: "/tmp/docs/guide.md" }])
  })
})

describe("sidebar delete prompt", () => {
  test("delete request opens confirm modal", () => {
    const state = createInitialState("/tmp")
    const loaded = reduceEvent(state, { type: "FILE_TREE_LOADED", nodes: sidebarTree() }).state
    const withCursor = { ...loaded, sidebarCursorPath: "/tmp/readme.md" }

    const result = reduceEvent(withCursor, { type: "SIDEBAR_REQUEST_DELETE" })
    expect(result.state.modal?.kind).toBe("delete_confirm")
    if (result.state.modal?.kind === "delete_confirm") {
      expect(result.state.modal.targetPath).toBe("/tmp/readme.md")
      expect(result.state.modal.targetType).toBe("file")
      expect(result.state.modal.selectedOption).toBe("cancel")
    }
  })

  test("confirm delete dispatches delete effect", () => {
    const state = createInitialState("/tmp")
    const modalState = {
      ...state,
      modal: {
        kind: "delete_confirm" as const,
        targetPath: "/tmp/readme.md",
        targetName: "readme.md",
        targetType: "file" as const,
        selectedOption: "delete" as const,
      },
    }

    const result = reduceEvent(modalState, { type: "DELETE_PROMPT_CONFIRM" })
    expect(result.effects).toEqual([
      {
        type: "DELETE_PATH",
        path: "/tmp/readme.md",
        cwd: "/tmp",
      },
    ])
  })

  test("path deleted triggers file tree reload", () => {
    const state = createInitialState("/tmp")
    const loadedDoc = reduceEvent(state, {
      type: "FILE_LOADED",
      path: "/tmp/readme.md",
      text: "hello",
    }).state

    const result = reduceEvent(loadedDoc, { type: "PATH_DELETED", path: "/tmp/readme.md" })
    expect(result.state.document.path).toBeNull()
    expect(result.effects).toEqual([{ type: "LOAD_FILE_TREE", rootPath: "/tmp" }])
  })
})
