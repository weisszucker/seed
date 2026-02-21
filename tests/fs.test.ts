import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, test } from "bun:test"

import { loadFileTree } from "../src/effects/fs"

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
})
