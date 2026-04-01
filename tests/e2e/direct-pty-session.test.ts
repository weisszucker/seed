import { afterEach, describe, expect, test } from "bun:test"

import { press, typeText } from "./harness/input"
import { DirectPtySession } from "./harness/directPtySession"
import { createWorkspaceFixture, type WorkspaceFixture } from "./harness/fixtures"
import { dumpVisibleText, findText } from "./harness/terminalBuffer"

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

describe("DirectPtySession", () => {
  test("launches the real app, exposes visible text, and exits through leader quit", { timeout: 20000 }, async () => {
    const fixture = await createWorkspaceFixture({
      files: {
        "note.md": "# note\n",
      },
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
    await session.waitForOutput((screen) => findText(screen, "untitled") && findText(screen, "note.md"), 10000)

    expect(findText(session.getScreen(), "untitled")).toBeTrue()
    expect(findText(session.getScreen(), "note.md")).toBeTrue()

    const afterSeq = session.getLatestHookSeq()
    await session.write(typeText("hello"))
    await session.waitForHook(
      (event) => event.type === "runtime_idle" && event.seq > afterSeq,
      10000,
    )
    await session.waitForOutput((screen) => findText(screen, "hello"), 10000)

    expect(dumpVisibleText(session.getScreen())).toContain("hello")
    expect(
      session.getRecentHookEvents().some(
        (event) => event.type === "document_changed" && event.isDirty,
      ),
    ).toBeTrue()

    await session.write(press("ctrl+l"))
    await session.write(press("q"))
    await session.waitForOutput((screen) => findText(screen, "Unsaved changes"), 10000)
    await session.write(press("right"))
    await session.write(press("enter"))
    await session.waitForHook((event) => event.type === "app_exit", 10000)

    const transcript = session.getTranscript()
    expect(transcript).toContain("untitled")
  })
})
