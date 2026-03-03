import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, test } from "bun:test"

import { deletePath, loadFileTree } from "../src/effects/fs"

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

  test("deletePath removes files and directories under root", async () => {
    const root = await mkdtemp(join(tmpdir(), "seed-delete-"))
    try {
      const nestedDir = join(root, "nested")
      const nestedFile = join(nestedDir, "note.md")
      const topFile = join(root, "top.md")

      await mkdir(nestedDir, { recursive: true })
      await writeFile(nestedFile, "ok")
      await writeFile(topFile, "ok")

      await deletePath(topFile, root)
      await deletePath(nestedDir, root)

      const tree = await loadFileTree(root)
      expect(tree.length).toBe(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("deletePath rejects paths outside root", async () => {
    const root = await mkdtemp(join(tmpdir(), "seed-delete-root-"))
    const outside = await mkdtemp(join(tmpdir(), "seed-delete-outside-"))
    try {
      const outsideFile = join(outside, "danger.md")
      await writeFile(outsideFile, "do-not-delete")

      await expect(deletePath(outsideFile, root)).rejects.toThrow("outside root")
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})
