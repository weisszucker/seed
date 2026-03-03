import type { RuntimeEffectRunner } from "../app/runtime"
import { runEffect } from "../effects/runner"
import type { AppEffect } from "../core/types"
import type { RepoContext } from "./bootstrap"
import type { ExitCommitService } from "./exit-commit"
import { CloudMetadataStore, type CloudMetadata } from "./metadata"
import type { PushRetryCoordinator } from "./push-retry"
import { logCloudEvent } from "./logging"

export class CloudLifecycleManager {
  private readonly metadataStore: CloudMetadataStore

  constructor(
    private readonly repo: RepoContext,
    private readonly commitService: ExitCommitService,
    private readonly pushCoordinator: PushRetryCoordinator,
    metadataStore?: CloudMetadataStore,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.metadataStore = metadataStore ?? new CloudMetadataStore()
  }

  async markStartupSuccess(): Promise<void> {
    logCloudEvent("startup_sync_success", { repo: `${this.repo.owner}/${this.repo.repo}` })
    await this.saveMetadata("startup_synced", 0)
  }

  async markStartupFailure(message: string): Promise<void> {
    logCloudEvent("startup_sync_failed", {
      repo: `${this.repo.owner}/${this.repo.repo}`,
      error: message,
    }, "error")
    await this.saveMetadata("startup_failed", 0)
  }

  async handleNormalExit(): Promise<void> {
    logCloudEvent("exit_sync_start", { repo: `${this.repo.owner}/${this.repo.repo}` })

    const commit = await this.commitService.commitIfChanged(this.repo.localPath)
    if (!commit.committed) {
      logCloudEvent("exit_sync_no_changes")
      await this.saveMetadata("no_changes", 0)
      return
    }

    logCloudEvent("exit_sync_committed", { message: commit.message })

    const push = await this.pushCoordinator.pushWithManualRetry(this.repo.localPath)
    if (push.status === "pushed") {
      logCloudEvent("exit_sync_pushed", { retry_count: push.retryCount })
      await this.saveMetadata("pushed", push.retryCount)
      return
    }

    logCloudEvent("exit_sync_discarded", { retry_count: push.retryCount })
    await this.saveMetadata("discarded", push.retryCount)
  }

  private async saveMetadata(lastStatus: string, retryCount: number): Promise<void> {
    const metadata: CloudMetadata = {
      owner: this.repo.owner,
      repo: this.repo.repo,
      remote_url: this.repo.remoteUrl,
      last_sync_at: this.now().toISOString(),
      last_sync_status: lastStatus,
      retry_count_last_exit: retryCount,
    }
    await this.metadataStore.save(this.repo.localPath, metadata)
  }
}

export function createCloudEffectRunner(lifecycle: CloudLifecycleManager): RuntimeEffectRunner {
  return async (effect, renderer) => {
    if (effect.type !== "EXIT_APP") {
      return runEffect(effect, renderer)
    }

    renderer.destroy()
    try {
      await lifecycle.handleNormalExit()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown exit sync failure"
      logCloudEvent("exit_sync_failed", { error: message }, "error")
      console.error(`Exit sync failed: ${message}`)
      process.exitCode = 1
    }
    return []
  }
}

export function isExitEffect(effect: AppEffect): boolean {
  return effect.type === "EXIT_APP"
}
