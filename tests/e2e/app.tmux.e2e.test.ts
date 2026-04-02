import { afterEach, describe, expect, test } from "bun:test"
import { join } from "node:path"

import { clickText } from "./harness/mouse"
import { press } from "./harness/input"
import { createWorkspaceFixture, type WorkspaceFixture } from "./harness/fixtures"
import { findText } from "./harness/terminalBuffer"
import { withLatestSessionDiagnostics } from "./harness/testFailure"
import { TmuxSession } from "./harness/tmuxSession"

const fixtureStack: WorkspaceFixture[] = []
const sessionStack: TmuxSession[] = []

afterEach(async () => {
  while (sessionStack.length > 0) {
    await sessionStack.pop()?.stop()
  }

  while (fixtureStack.length > 0) {
    await fixtureStack.pop()?.cleanup()
  }
})

async function startSession(files: Record<string, string>): Promise<TmuxSession> {
  const fixture = await createWorkspaceFixture({
    files,
    config: {
      leaderKey: "ctrl+l",
    },
  })
  fixtureStack.push(fixture)

  const session = new TmuxSession({
    cwd: fixture.path,
    configPath: fixture.configPath,
    eventLogPath: fixture.eventLogPath,
    socketPath: join(fixture.rootPath, "tmux.sock"),
  })
  sessionStack.push(session)

  await session.start()
  await session.waitForHook((event) => event.type === "initial_render_complete", 10000)
  return session
}

describe("tmux e2e", () => {
  test("forwards focused keyboard navigation through tmux", async () => {
    await withLatestSessionDiagnostics(sessionStack, async () => {
      const session = await startSession({
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
  }, 30000)

  test("forwards mouse file opens through tmux", async () => {
    await withLatestSessionDiagnostics(sessionStack, async () => {
      const session = await startSession({
        "a.md": "# a\n",
        "b.md": "# b\n",
      })

      await session.waitForOutput(
        (screen) => screen.mouseModes.sgr && findText(screen, "a.md") && findText(screen, "b.md"),
        10000,
      )

      const afterSeq = session.getLatestHookSeq()
      await session.write(clickText(session.getScreen(), "b.md"))
      await session.waitForHook(
        (event) => event.type === "runtime_idle" && event.seq > afterSeq,
        10000,
      )
      await session.waitForOutput((screen) => findText(screen, "# b"), 10000)

      expect(findText(session.getScreen(), "# b")).toBeTrue()

      await session.write(press("ctrl+l"))
      await session.write(press("q"))
      await session.waitForHook((event) => event.type === "app_exit", 10000)
    })
  }, 30000)
})
