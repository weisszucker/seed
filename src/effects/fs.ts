import { readdir, rm } from "node:fs/promises"
import type { Dirent } from "node:fs"
import { isAbsolute, join, relative, resolve, sep } from "node:path"

import type { FileNode } from "../core/types"

function isHidden(name: string): boolean {
  return name.startsWith(".")
}

function sortEntries(a: Dirent, b: Dirent): number {
  if (a.isDirectory() && !b.isDirectory()) {
    return -1
  }
  if (!a.isDirectory() && b.isDirectory()) {
    return 1
  }
  return a.name.localeCompare(b.name)
}

export async function loadFileTree(rootPath: string): Promise<FileNode[]> {
  return readDirectoryNodes(rootPath)
}

async function readDirectoryNodes(directoryPath: string): Promise<FileNode[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const visible = entries.filter((entry) => !isHidden(entry.name)).sort(sortEntries)

  const nodes: FileNode[] = []
  for (const entry of visible) {
    const path = join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path,
        isDirectory: true,
        children: await readDirectoryNodes(path),
      })
    } else {
      nodes.push({
        name: entry.name,
        path,
        isDirectory: false,
        children: [],
      })
    }
  }

  return nodes
}

function isPathWithinRoot(path: string, rootPath: string): boolean {
  const resolvedRoot = resolve(rootPath)
  const resolvedPath = resolve(path)
  const rel = relative(resolvedRoot, resolvedPath)
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
}

export async function readTextFile(path: string): Promise<string> {
  return Bun.file(path).text()
}

export async function writeTextFile(path: string, text: string): Promise<void> {
  await Bun.write(path, text)
}

export async function deletePath(path: string, rootPath: string): Promise<void> {
  if (!isPathWithinRoot(path, rootPath)) {
    throw new Error("Refusing to delete path outside root")
  }
  await rm(path, { recursive: true, force: false })
}
