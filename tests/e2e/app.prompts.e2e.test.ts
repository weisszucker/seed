import { afterEach, describe, expect, test } from "bun:test"
import { join } from "node:path"

import { press, typeText } from "./harness/input"
import { DirectPtySession } from "./harness/directPtySession"
import { createWorkspaceFixture, type WorkspaceFixture } from "./harness/fixtures"
import { findText } from "./harness/terminalBuffer"
import { withLatestSessionDiagnostics } from "./harness/testFailure"
import { observeFor } from "./harness/waits"

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
): Promise<{ fixture: WorkspaceFixture; session: DirectPtySession }> {
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
  return { fixture, session }
}

async function runLeaderCommand(session: DirectPtySession, key: string): Promise<void> {
  await session.write(press("ctrl+l"))
  await session.write(press(key))
}

async function waitForRuntimeIdle(session: DirectPtySession, afterSeq: number): Promise<void> {
  await session.waitForHook(
    (event) => event.type === "runtime_idle" && event.seq > afterSeq,
    10000,
  )
}

async function quitWithoutSaving(session: DirectPtySession): Promise<void> {
  await runLeaderCommand(session, "q")
  await session.waitForOutput((screen) => findText(screen, "Unsaved changes"), 10000)
  await session.write(press("right"))
  await session.write(press("enter"))
  await session.waitForHook((event) => event.type === "app_exit", 10000)
}

describe("prompt and file-flow e2e", () => {
  for (const term of TERMS) {
    test(`blocks editor input while the unsaved prompt is visible in ${term}`, async () => {
      await withLatestSessionDiagnostics(sessionStack, async () => {
        const { session } = await startSession(term, {})

        const draftSeq = session.getLatestHookSeq()
        await session.write(typeText("draft"))
        await waitForRuntimeIdle(session, draftSeq)
        await session.waitForOutput((screen) => findText(screen, "draft"), 10000)

        await runLeaderCommand(session, "n")
        const promptOpened = await session.waitForHook(
          (event) => event.type === "modal_changed" && event.modal === "unsaved_changes",
          10000,
        )
        await session.waitForOutput((screen) => findText(screen, "Unsaved changes"), 10000)

        await session.write(typeText("blocked"))
        await observeFor(100, async () => {
          await session.refreshHookEvents()
        })

        expect(
          session.getRecentHookEvents(100).some(
            (event) => event.type === "document_changed" && event.seq > promptOpened.seq,
          ),
        ).toBeFalse()

        await session.write(press("escape"))
        await session.waitForHook(
          (event) => event.type === "modal_changed" && event.modal === null && event.seq > promptOpened.seq,
          10000,
        )
        await session.waitForOutput(
          (screen) => !findText(screen, "Unsaved changes") && findText(screen, "draft"),
          10000,
        )

        expect(findText(session.getScreen(), "draft")).toBeTrue()
        expect(findText(session.getScreen(), "draftblocked")).toBeFalse()

        await quitWithoutSaving(session)
      })
    }, 20000)

    test(`opens the pending file after choosing Don't Save in ${term}`, async () => {
      await withLatestSessionDiagnostics(sessionStack, async () => {
        const { fixture, session } = await startSession(term, {
          "a.md": "# a\n",
          "b.md": "# b\n",
        })

        const openASeq = session.getLatestHookSeq()
        await runLeaderCommand(session, "l")
        await session.write(press("enter"))
        await waitForRuntimeIdle(session, openASeq)
        await session.waitForOutput((screen) => findText(screen, "# a"), 10000)

        const dirtySeq = session.getLatestHookSeq()
        await session.write(typeText("edited"))
        await waitForRuntimeIdle(session, dirtySeq)
        await session.waitForOutput((screen) => findText(screen, "edited"), 10000)

        await runLeaderCommand(session, "l")
        await session.write(press("down"))
        await session.write(press("enter"))

        const promptOpened = await session.waitForHook(
          (event) => event.type === "modal_changed" && event.modal === "unsaved_changes",
          10000,
        )
        await session.waitForOutput((screen) => findText(screen, "Unsaved changes"), 10000)

        await session.write(press("right"))
        await session.write(press("enter"))
        await waitForRuntimeIdle(session, promptOpened.seq)
        await session.waitForOutput(
          (screen) => findText(screen, "# b") && findText(screen, "Loaded b.md"),
          10000,
        )

        expect(await Bun.file(join(fixture.path, "a.md")).text()).toBe("# a\n")
        expect(findText(session.getScreen(), "# b")).toBeTrue()
        expect(findText(session.getScreen(), "Loaded b.md")).toBeTrue()

        await runLeaderCommand(session, "q")
        await session.waitForHook((event) => event.type === "app_exit", 10000)
      })
    }, 20000)

    test(`saves an untitled buffer through Save As before continuing in ${term}`, async () => {
      await withLatestSessionDiagnostics(sessionStack, async () => {
        const { fixture, session } = await startSession(term, {})

        const draftSeq = session.getLatestHookSeq()
        await session.write(typeText("draft"))
        await waitForRuntimeIdle(session, draftSeq)
        await session.waitForOutput((screen) => findText(screen, "draft"), 10000)

        await runLeaderCommand(session, "n")
        const promptOpened = await session.waitForHook(
          (event) => event.type === "modal_changed" && event.modal === "unsaved_changes",
          10000,
        )
        await session.waitForOutput((screen) => findText(screen, "Unsaved changes"), 10000)

        await session.write(press("enter"))
        const saveAsOpened = await session.waitForHook(
          (event) => event.type === "modal_changed" && event.modal === "save_as" && event.seq > promptOpened.seq,
          10000,
        )
        await session.waitForOutput((screen) => findText(screen, "Save As"), 10000)

        await session.write(typeText("saved.md"))
        const submitSeq = session.getLatestHookSeq()
        await session.write(press("enter"))

        await waitForRuntimeIdle(session, submitSeq)
        await session.waitForOutput(
          (screen) =>
            !findText(screen, "Save As") &&
            findText(screen, "[untitled] | clean | New untitled file"),
          10000,
        )

        expect(saveAsOpened.seq).toBeGreaterThan(promptOpened.seq)
        expect(await Bun.file(join(fixture.path, "saved.md")).text()).toBe("draft")
        expect(findText(session.getScreen(), "untitled")).toBeTrue()
        expect(findText(session.getScreen(), "New untitled file")).toBeTrue()

        await runLeaderCommand(session, "q")
        await session.waitForHook((event) => event.type === "app_exit", 10000)
      })
    }, 20000)
  }
})
