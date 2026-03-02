import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

export type CloudMetadata = {
  owner: string
  repo: string
  remote_url: string
  last_sync_at: string
  last_sync_status: string
  retry_count_last_exit: number
}

const METADATA_FILENAME = ".seed-cloud.json"

export class CloudMetadataStore {
  async load(repoPath: string): Promise<CloudMetadata | null> {
    try {
      const content = await readFile(join(repoPath, METADATA_FILENAME), "utf8")
      return JSON.parse(content) as CloudMetadata
    } catch {
      return null
    }
  }

  async save(repoPath: string, metadata: CloudMetadata): Promise<void> {
    const path = join(repoPath, METADATA_FILENAME)
    await writeFile(path, `${JSON.stringify(metadata, null, 2)}\n`, "utf8")
  }
}
