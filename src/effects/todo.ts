import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"

import type { DeveloperTodoItem } from "../core/types"

export const DEVELOPER_TODO_RELATIVE_PATH = join(".seed", "todo.md")

const TODO_CHECKBOX_PATTERN = /^\s*-\s*\[([ xX])\]\s+(.*)$/

export function getDeveloperTodoListPath(rootPath: string): string {
  return join(rootPath, DEVELOPER_TODO_RELATIVE_PATH)
}

export async function loadDeveloperTodoList(rootPath: string): Promise<DeveloperTodoItem[]> {
  const path = getDeveloperTodoListPath(rootPath)
  const file = Bun.file(path)
  if (!(await file.exists())) {
    return []
  }

  const text = await file.text()
  const items: DeveloperTodoItem[] = []

  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      continue
    }

    const checkboxMatch = rawLine.match(TODO_CHECKBOX_PATTERN)
    if (checkboxMatch) {
      const [, marker, itemText] = checkboxMatch
      const normalizedText = itemText.trim()
      if (!normalizedText) {
        continue
      }

      items.push({
        text: normalizedText,
        done: marker.toLowerCase() === "x",
      })
      continue
    }

    items.push({
      text: trimmed,
      done: false,
    })
  }

  return items
}

export async function saveDeveloperTodoList(rootPath: string, items: DeveloperTodoItem[]): Promise<void> {
  const path = getDeveloperTodoListPath(rootPath)
  await mkdir(dirname(path), { recursive: true })

  const content = items.map((item) => `- [${item.done ? "x" : " "}] ${item.text}`).join("\n")
  await Bun.write(path, content ? `${content}\n` : "")
}
