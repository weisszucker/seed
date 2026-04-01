import { afterEach, describe, expect, test } from "bun:test"
import { uiLayout } from "../../src/theme"

import { clickCell, clickText, mouseDownLeft } from "./harness/mouse"
import { press, typeText } from "./harness/input"
import { DirectPtySession } from "./harness/directPtySession"
import { createWorkspaceFixture, type WorkspaceFixture } from "./harness/fixtures"
import { findText, findTextCells, findUniqueTextCell } from "./harness/terminalBuffer"
import type { ScreenState } from "./harness/types"

const fixtureStack: WorkspaceFixture[] = []
const sessionStack: DirectPtySession[] = []

afterEach(async () => {
  while (sessionStack.length > 0) {
    await sessionStack.pop()?.stop()
  }

  while (fixtureStack.length > 0) {
    await fixtureStack.pop()?.cleanup()
  }
})

async function startSession(files: Record<string, string>): Promise<DirectPtySession> {
  const fixture = await createWorkspaceFixture({
    files,
    config: {
      leaderKey: "ctrl+l",
    },
  })
  fixtureStack.push(fixture)

  const session = new DirectPtySession({
    cwd: fixture.path,
    configPath: fixture.configPath,
    eventLogPath: fixture.eventLogPath,
    term: "xterm-256color",
  })
  sessionStack.push(session)

  await session.start()
  await session.waitForHook((event) => event.type === "initial_render_complete", 10000)
  await session.waitForOutput((screen) => screen.mouseModes.sgr, 10000)
  return session
}

async function waitForRuntimeIdle(session: DirectPtySession, afterSeq: number): Promise<void> {
  await session.waitForHook(
    (event) => event.type === "runtime_idle" && event.seq > afterSeq,
    10000,
  )
}

function findDontSaveCell(screen: ScreenState): { x: number; y: number } {
  const titleCell = findTextCells(screen, "Unsaved changes")
    .sort((left, right) => left.y - right.y || left.x - right.x)[0]

  if (!titleCell) {
    throw new Error('Text "Unsaved changes" is not visible on the current screen')
  }

  return {
    x: titleCell.x + uiLayout.modalWidth - 10,
    y: titleCell.y + uiLayout.modalHeaderBodyGap + 1,
  }
}

describe("mouse e2e", () => {
  test("clicks sidebar files to open them", { timeout: 20000 }, async () => {
    const session = await startSession({
      "a.md": "# a\n",
      "b.md": "# b\n",
    })

    await session.waitForOutput((screen) => findText(screen, "a.md") && findText(screen, "b.md"), 10000)

    const afterSeq = session.getLatestHookSeq()
    await session.write(clickText(session.getScreen(), "b.md"))
    await waitForRuntimeIdle(session, afterSeq)
    await session.waitForOutput((screen) => findText(screen, "# b"), 10000)

    expect(findText(session.getScreen(), "# b")).toBeTrue()

    await session.write(press("ctrl+l"))
    await session.write(press("q"))
    await session.waitForHook((event) => event.type === "app_exit", 10000)
  })

  test("clicks sidebar directories to toggle expansion", { timeout: 20000 }, async () => {
    const session = await startSession({
      "docs/note.md": "# note\n",
    })

    await session.waitForOutput((screen) => findText(screen, "docs") && !findText(screen, "note.md"), 10000)

    await session.write(clickText(session.getScreen(), "docs"))
    await session.waitForOutput((screen) => findText(screen, "note.md"), 10000)

    await session.write(clickText(session.getScreen(), "docs"))
    await session.waitForOutput((screen) => !findText(screen, "note.md"), 10000)

    await session.write(press("ctrl+l"))
    await session.write(press("q"))
    await session.waitForHook((event) => event.type === "app_exit", 10000)
  })

  test("clicking the editor returns focus from the sidebar", { timeout: 20000 }, async () => {
    const session = await startSession({
      "note.md": "# note\n",
    })

    await session.waitForOutput((screen) => findText(screen, "Start typing markdown..."), 10000)

    await session.write(press("ctrl+l"))
    await session.write(press("l"))
    await session.waitForHook(
      (event) => event.type === "focus_changed" && event.pane === "sidebar",
      10000,
    )

    const editorCell = findUniqueTextCell(session.getScreen(), "Start typing markdown...")
    await session.write(clickCell(editorCell.x, editorCell.y))
    const editorFocused = await session.waitForHook(
      (event) => event.type === "focus_changed" && event.pane === "editor",
      10000,
    )

    await session.write(typeText("j"))
    await waitForRuntimeIdle(session, editorFocused.seq)
    await session.waitForOutput((screen) => findText(screen, "j"), 10000)

    expect(
      session.getRecentHookEvents(50).some(
        (event) => event.type === "document_changed" && event.seq > editorFocused.seq && event.isDirty,
      ),
    ).toBeTrue()

    await session.write(press("ctrl+l"))
    await session.write(press("q"))
    await session.waitForOutput((screen) => findText(screen, "Unsaved changes"), 10000)
    const dontSaveCell = findDontSaveCell(session.getScreen())
    await session.write(mouseDownLeft(dontSaveCell.x, dontSaveCell.y))
    await session.waitForHook((event) => event.type === "app_exit", 10000)
  })

  test("clicks modal actions", { timeout: 20000 }, async () => {
    const session = await startSession({})

    const afterSeq = session.getLatestHookSeq()
    await session.write(typeText("draft"))
    await waitForRuntimeIdle(session, afterSeq)

    await session.write(press("ctrl+l"))
    await session.write(press("q"))
    await session.waitForOutput((screen) => findText(screen, "Unsaved changes"), 10000)

    const dontSaveCell = findDontSaveCell(session.getScreen())
    await session.write(mouseDownLeft(dontSaveCell.x, dontSaveCell.y))
    await session.waitForHook((event) => event.type === "app_exit", 10000)
  })
})
