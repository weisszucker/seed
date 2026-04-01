import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

type WorkspaceFixtureOptions = {
  files?: Record<string, string>
  config?: Record<string, unknown>
}

export type WorkspaceFixture = {
  rootPath: string
  path: string
  configPath: string
  eventLogPath: string
  cleanup: () => Promise<void>
}

export async function createWorkspaceFixture(options: WorkspaceFixtureOptions = {}): Promise<WorkspaceFixture> {
  const rootPath = await mkdtemp(join(tmpdir(), "seed-e2e-"))
  const workspacePath = join(rootPath, "workspace")
  const configPath = join(rootPath, "setting.json")
  const eventLogPath = join(rootPath, "events.jsonl")

  await mkdir(workspacePath, { recursive: true })

  const files = options.files ?? {}
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(workspacePath, relativePath)
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, content)
  }

  await writeFile(configPath, JSON.stringify(options.config ?? {}, null, 2))

  return {
    rootPath,
    path: workspacePath,
    configPath,
    eventLogPath,
    cleanup: async () => {
      await rm(rootPath, { recursive: true, force: true })
    },
  }
}

