import { readdir } from "node:fs/promises"
import { basename, join } from "node:path"

function splitTranscriptLines(transcript: string): string[] {
  return transcript
    .split(/\r?\n/u)
    .map((line) => line.replace(/\r/gu, ""))
    .filter((line, index, lines) => line.length > 0 || index < lines.length - 1)
}

export function formatTranscriptTail(transcript: string, lineLimit = 80): string {
  const lines = splitTranscriptLines(transcript)
  if (lines.length === 0) {
    return "[empty]"
  }

  return lines.slice(-lineLimit).join("\n")
}

export async function collectWorkspaceTree(rootPath: string): Promise<string> {
  const lines = [`${basename(rootPath) || rootPath}/`]

  async function visit(directoryPath: string, prefix: string): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true })
    entries.sort((left, right) => {
      if (left.isDirectory() && !right.isDirectory()) {
        return -1
      }
      if (!left.isDirectory() && right.isDirectory()) {
        return 1
      }
      return left.name.localeCompare(right.name)
    })

    for (const entry of entries) {
      const label = `${prefix}${entry.name}${entry.isDirectory() ? "/" : ""}`
      lines.push(label)

      if (entry.isDirectory()) {
        await visit(join(directoryPath, entry.name), `${prefix}  `)
      }
    }
  }

  try {
    await visit(rootPath, "  ")
  } catch (error) {
    return `[workspace tree unavailable] ${error instanceof Error ? error.message : String(error)}`
  }

  return lines.join("\n")
}

export function formatDiagnosticsSection(title: string, body: string): string {
  return `=== ${title} ===\n${body || "[empty]"}`
}
