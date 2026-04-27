import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { CliRenderer } from "@opentui/core"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { CloudLifecycleManager, createCloudEffectRunner } from "../src/cloud/lifecycle"
import type { RepoContext } from "../src/cloud/bootstrap"
import type { ExitCommitService } from "../src/cloud/exit-commit"
import type { PushRetryCoordinator } from "../src/cloud/push-retry"
import { CloudMetadataStore } from "../src/cloud/metadata"

class FakeExitCommitService {
  calls: string[] = []
  result: Awaited<ReturnType<ExitCommitService["commitIfChanged"]>> = {
    committed: false,
  }

  async commitIfChanged(repoPath: string): Promise<Awaited<ReturnType<ExitCommitService["commitIfChanged"]>>> {
    this.calls.push(repoPath)
    return this.result
  }
}

class FakePushRetryCoordinator {
  calls: string[] = []

  async pushWithManualRetry(repoPath: string): Promise<Awaited<ReturnType<PushRetryCoordinator["pushWithManualRetry"]>>> {
    this.calls.push(repoPath)
    return { status: "pushed", retryCount: 0 }
  }
}

class RecordingMetadataStore extends CloudMetadataStore {
  saveCalls: string[] = []

  override async save(repoPath: string): Promise<void> {
    this.saveCalls.push(repoPath)
  }
}

function createRenderer(): CliRenderer {
  return {
    destroy() {},
  } as CliRenderer
}

describe("cloud lifecycle", () => {
  let rootDir: string
  let repoPath: string
  let repo: RepoContext

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "seed-cloud-lifecycle-"))
    repoPath = join(rootDir, "alice", "notes")
    await mkdir(repoPath, { recursive: true })
    repo = {
      owner: "alice",
      repo: "notes",
      remoteUrl: "https://github.com/alice/notes.git",
      localPath: repoPath,
    }
  })

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true })
  })

  test("skips Git and metadata writes on exit when no workspace mutation succeeded", async () => {
    const commitService = new FakeExitCommitService()
    const pushCoordinator = new FakePushRetryCoordinator()
    const metadataStore = new RecordingMetadataStore()
    const lifecycle = new CloudLifecycleManager(
      repo,
      commitService as unknown as ExitCommitService,
      pushCoordinator as unknown as PushRetryCoordinator,
      metadataStore,
    )
    const runner = createCloudEffectRunner(lifecycle)

    await runner({ type: "LOAD_DEVELOPER_TODO_LIST", rootPath: repoPath }, createRenderer())
    await runner({ type: "EXIT_APP" }, createRenderer())

    expect(commitService.calls).toEqual([])
    expect(pushCoordinator.calls).toEqual([])
    expect(metadataStore.saveCalls).toEqual([])
  })

  test("does not treat developer todo saves as cloud workspace mutations", async () => {
    const commitService = new FakeExitCommitService()
    const pushCoordinator = new FakePushRetryCoordinator()
    const lifecycle = new CloudLifecycleManager(
      repo,
      commitService as unknown as ExitCommitService,
      pushCoordinator as unknown as PushRetryCoordinator,
      new RecordingMetadataStore(),
    )
    const runner = createCloudEffectRunner(lifecycle)

    await runner(
      { type: "SAVE_DEVELOPER_TODO_LIST", rootPath: repoPath, items: [{ text: "ship", done: false }] },
      createRenderer(),
    )
    await runner({ type: "EXIT_APP" }, createRenderer())

    expect(commitService.calls).toEqual([])
    expect(pushCoordinator.calls).toEqual([])
  })

  test("runs normal exit sync after a successful file save", async () => {
    const commitService = new FakeExitCommitService()
    commitService.result = { committed: true, message: "2026-02-26T18:05:12Z" }
    const pushCoordinator = new FakePushRetryCoordinator()
    const metadataStore = new RecordingMetadataStore()
    const lifecycle = new CloudLifecycleManager(
      repo,
      commitService as unknown as ExitCommitService,
      pushCoordinator as unknown as PushRetryCoordinator,
      metadataStore,
    )
    const runner = createCloudEffectRunner(lifecycle)

    await runner({ type: "SAVE_FILE", path: join(rootDir, "note.md"), text: "hello" }, createRenderer())
    await runner({ type: "EXIT_APP" }, createRenderer())

    expect(commitService.calls).toEqual([repoPath])
    expect(pushCoordinator.calls).toEqual([repoPath])
    expect(metadataStore.saveCalls).toEqual([repoPath])
  })
})
