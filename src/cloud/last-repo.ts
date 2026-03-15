import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export type CloudRepoRef = {
  owner: string
  repo: string
}

const LAST_CLOUD_REPO_PATH = join(homedir(), ".seed", "last-cloud-repo.json")
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const REPO_RE = /^[A-Za-z0-9._-]+$/

function isValidRepoRef(value: unknown): value is CloudRepoRef {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<CloudRepoRef>
  return (
    typeof candidate.owner === "string" &&
    typeof candidate.repo === "string" &&
    OWNER_RE.test(candidate.owner) &&
    REPO_RE.test(candidate.repo)
  )
}

export class LastCloudRepoStore {
  constructor(private readonly path = LAST_CLOUD_REPO_PATH) {}

  async load(): Promise<CloudRepoRef | null> {
    try {
      const content = await readFile(this.path, "utf8")
      const parsed = JSON.parse(content) as unknown
      return isValidRepoRef(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  async save(repo: CloudRepoRef): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path, `${JSON.stringify(repo, null, 2)}\n`, "utf8")
  }
}
