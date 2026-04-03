import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { getDeveloperTodoListPath, loadDeveloperTodoList, saveDeveloperTodoList } from "../src/effects/todo"

const roots: string[] = []

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop()
    if (root) {
      await rm(root, { recursive: true, force: true })
    }
  }
})

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "seed-todo-"))
  roots.push(root)
  return root
}

describe("developer todo storage", () => {
  test("loads checkbox markdown and plain lines as todo items", async () => {
    const root = await createRoot()
    const path = getDeveloperTodoListPath(root)
    await mkdir(join(root, ".seed"), { recursive: true })
    await Bun.write(
      path,
      ["- [ ] Ship feature", "- [x] Fix flaky test", "Investigate crash", ""].join("\n"),
    )

    const items = await loadDeveloperTodoList(root)

    expect(items).toEqual([
      { text: "Ship feature", done: false },
      { text: "Fix flaky test", done: true },
      { text: "Investigate crash", done: false },
    ])
  })

  test("saves todo items into the hidden project file", async () => {
    const root = await createRoot()

    await saveDeveloperTodoList(root, [
      { text: "Ship feature", done: false },
      { text: "Fix flaky test", done: true },
    ])

    const path = getDeveloperTodoListPath(root)
    expect(await Bun.file(path).text()).toBe("- [ ] Ship feature\n- [x] Fix flaky test\n")
  })

  test("returns an empty list when the todo file does not exist", async () => {
    const root = await createRoot()

    const items = await loadDeveloperTodoList(root)

    expect(items).toEqual([])
  })
})
