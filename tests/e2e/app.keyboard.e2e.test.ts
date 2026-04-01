import { afterEach, describe, expect, test } from "bun:test"

import { press, typeText } from "./harness/input"
import { DirectPtySession } from "./harness/directPtySession"
import { createWorkspaceFixture, type WorkspaceFixture } from "./harness/fixtures"
import { findText } from "./harness/terminalBuffer"

const TERMS = ["vt100", "xterm-256color"] as const

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

async function startSession(
  term: (typeof TERMS)[number],
  files: Record<string, string>,
): Promise<DirectPtySession> {
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
    term,
  })
  sessionStack.push(session)

  await session.start()
  await session.waitForHook((event) => event.type === "initial_render_complete", 10000)
  return session
}

async function quitWithoutSaving(session: DirectPtySession): Promise<void> {
  await session.write(press("ctrl+l"))
  await session.write(press("q"))
  await session.waitForOutput((screen) => findText(screen, "Unsaved changes"), 10000)
  await session.write(press("right"))
  await session.write(press("enter"))
  await session.waitForHook((event) => event.type === "app_exit", 10000)
}

describe("keyboard e2e", () => {
  for (const term of TERMS) {
    test(`toggles the sidebar via leader shortcut in ${term}`, { timeout: 20000 }, async () => {
      const session = await startSession(term, {
        "note.md": "# note\n",
      })

      await session.waitForOutput((screen) => findText(screen, "note.md"), 10000)

      await session.write(press("ctrl+l"))
      await session.write(press("e"))
      await session.waitForOutput((screen) => !findText(screen, "note.md"), 10000)
      expect(findText(session.getScreen(), "note.md")).toBeFalse()

      await session.write(press("ctrl+l"))
      await session.write(press("e"))
      await session.waitForOutput((screen) => findText(screen, "note.md"), 10000)
      expect(findText(session.getScreen(), "note.md")).toBeTrue()

      await session.write(press("ctrl+l"))
      await session.write(press("q"))
      await session.waitForHook((event) => event.type === "app_exit", 10000)
    })

    test(`opens the selected sidebar file with keyboard navigation in ${term}`, { timeout: 20000 }, async () => {
      const session = await startSession(term, {
        "a.md": "# a\n",
        "b.md": "# b\n",
      })

      await session.waitForOutput((screen) => findText(screen, "a.md") && findText(screen, "b.md"), 10000)

      await session.write(press("ctrl+l"))
      await session.write(press("l"))
      await session.write(press("down"))
      await session.write(press("enter"))

      await session.waitForOutput((screen) => findText(screen, "b.md") && findText(screen, "# b"), 10000)
      expect(findText(session.getScreen(), "# b")).toBeTrue()

      await session.write(press("ctrl+l"))
      await session.write(press("q"))
      await session.waitForHook((event) => event.type === "app_exit", 10000)
    })

    test(`routes vim-style navigation keys to the sidebar when it is focused in ${term}`, { timeout: 20000 }, async () => {
      const session = await startSession(term, {
        "a.md": "# a\n",
        "b.md": "# b\n",
      })

      await session.waitForOutput((screen) => findText(screen, "a.md") && findText(screen, "b.md"), 10000)

      await session.write(press("ctrl+l"))
      await session.write(press("l"))
      const sidebarFocused = await session.waitForHook(
        (event) => event.type === "focus_changed" && event.pane === "sidebar",
        10000,
      )

      await session.write(press("j"))
      const afterMove = await session.waitForHook(
        (event) => event.type === "runtime_idle" && event.seq > sidebarFocused.seq,
        10000,
      )

      expect(
        session.getRecentHookEvents(50).some(
          (event) => event.type === "document_changed" && event.seq > sidebarFocused.seq && event.seq <= afterMove.seq,
        ),
      ).toBeFalse()

      await session.write(press("enter"))
      await session.waitForOutput((screen) => findText(screen, "b.md") && findText(screen, "# b"), 10000)
      expect(findText(session.getScreen(), "# b")).toBeTrue()

      await session.write(press("ctrl+l"))
      await session.write(press("q"))
      await session.waitForHook((event) => event.type === "app_exit", 10000)
    })

    test(`returns typing to the editor after leaving sidebar focus in ${term}`, { timeout: 20000 }, async () => {
      const session = await startSession(term, {
        "note.md": "# note\n",
      })

      await session.waitForOutput((screen) => findText(screen, "note.md"), 10000)

      await session.write(press("ctrl+l"))
      await session.write(press("l"))
      await session.waitForHook(
        (event) => event.type === "focus_changed" && event.pane === "sidebar",
        10000,
      )

      await session.write(press("escape"))
      const editorFocused = await session.waitForHook(
        (event) => event.type === "focus_changed" && event.pane === "editor",
        10000,
      )

      await session.write(press("j"))
      await session.waitForHook(
        (event) => event.type === "runtime_idle" && event.seq > editorFocused.seq,
        10000,
      )
      await session.waitForOutput((screen) => findText(screen, "j"), 10000)

      expect(
        session.getRecentHookEvents(50).some(
          (event) => event.type === "document_changed" && event.seq > editorFocused.seq && event.isDirty,
        ),
      ).toBeTrue()
      expect(findText(session.getScreen(), "j")).toBeTrue()

      await quitWithoutSaving(session)
    })

    test(`cancels the unsaved-quit prompt with escape in ${term}`, { timeout: 20000 }, async () => {
      const session = await startSession(term, {
        "note.md": "# note\n",
      })

      const afterSeq = session.getLatestHookSeq()
      await session.write(typeText("draft"))
      await session.waitForHook(
        (event) => event.type === "runtime_idle" && event.seq > afterSeq,
        10000,
      )
      await session.waitForOutput((screen) => findText(screen, "draft"), 10000)

      await session.write(press("ctrl+l"))
      await session.write(press("q"))
      await session.waitForOutput((screen) => findText(screen, "Unsaved changes"), 10000)

      await session.write(press("escape"))
      await session.waitForOutput(
        (screen) => !findText(screen, "Unsaved changes") && findText(screen, "draft"),
        10000,
      )
      expect(findText(session.getScreen(), "draft")).toBeTrue()

      await quitWithoutSaving(session)
    })
  }
})
