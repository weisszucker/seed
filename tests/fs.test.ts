import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, test } from "bun:test"

import { createPath, loadFileTree, movePath } from "../src/effects/fs"

describe("file tree loading", () => {
  test("hides hidden files and directories by default", async () => {
    const root = await mkdtemp(join(tmpdir(), "seed-tree-"))
    try {
      await mkdir(join(root, "visible-dir"), { recursive: true })
      await mkdir(join(root, ".hidden-dir"), { recursive: true })
      await writeFile(join(root, "visible.md"), "ok")
      await writeFile(join(root, ".hidden.md"), "no")

      const tree = await loadFileTree(root)
      const names = tree.map((node) => node.name)

      expect(names.includes("visible-dir")).toBeTrue()
      expect(names.includes("visible.md")).toBeTrue()
      expect(names.includes(".hidden-dir")).toBeFalse()
      expect(names.includes(".hidden.md")).toBeFalse()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("creates nested files and folders recursively", async () => {
    const root = await mkdtemp(join(tmpdir(), "seed-fs-"))
    try {
      await createPath(join(root, "nested", "child", "note.md"), "file")
      await createPath(join(root, "nested", "folder"), "directory")

      expect(await readFile(join(root, "nested", "child", "note.md"), "utf8")).toBe("")

      const tree = await loadFileTree(root)
      expect(tree[0]?.name).toBe("nested")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("moves paths after creating destination parents", async () => {
    const root = await mkdtemp(join(tmpdir(), "seed-move-"))
    try {
      const sourcePath = join(root, "docs", "note.md")
      const destinationPath = join(root, "archive", "2026", "note.md")
      await mkdir(join(root, "docs"), { recursive: true })
      await writeFile(sourcePath, "hello")

      await movePath(sourcePath, destinationPath)

      expect(await readFile(destinationPath, "utf8")).toBe("hello")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
