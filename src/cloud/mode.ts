import { startSeedApp } from "../app/start"
import { createSeedLogger, type Logger } from "../logging/logger"
import { AuthService } from "./auth"
import { RepoBootstrapper } from "./bootstrap"
import { createGithubAuthenticatedRunner, NodeCommandRunner, type CommandRunner } from "./command"
import { createCredentialStore, type CredentialStore } from "./credentials"
import type { DeviceAuthorizationClient } from "./device-flow"
import { ExitCommitService } from "./exit-commit"
import { GithubClient } from "./github"
import { CloudLifecycleManager, createCloudEffectRunner } from "./lifecycle"
import { CloudMetadataStore } from "./metadata"
import { PushRetryCoordinator, type RetryPrompt } from "./push-retry"
import { StartupSync } from "./startup-sync"

type CloudModeOptions = {
  commandRunner?: CommandRunner
  credentialStore?: CredentialStore
  githubClient?: GithubClient
  deviceAuthClient?: DeviceAuthorizationClient
  retryPrompt?: RetryPrompt
  logger?: Logger
}

export async function runCloudMode(owner: string, repo: string, options: CloudModeOptions = {}): Promise<void> {
  const logger =
    options.logger ??
    (await createSeedLogger({
      component: "cloud.mode",
      owner,
      repo: `${owner}/${repo}`,
    }))
  const baseRunner = options.commandRunner ?? new NodeCommandRunner(logger.child({ component: "cloud.command" }))
  const githubClient = options.githubClient ?? new GithubClient(undefined, logger.child({ component: "cloud.github" }))
  const credentialStore =
    options.credentialStore ??
    (await createCredentialStore(baseRunner, process.platform, logger.child({ component: "cloud.credentials" })))

  const auth = new AuthService(
    credentialStore,
    githubClient,
    options.deviceAuthClient,
    logger.child({ component: "cloud.auth" }),
  )
  const session = await auth.ensureAuthenticated(owner)
  const runner = createGithubAuthenticatedRunner(baseRunner, session.token)

  const bootstrapper = new RepoBootstrapper(
    runner,
    githubClient,
    undefined,
    logger.child({ component: "cloud.bootstrap" }),
  )
  const repoContext = await bootstrapper.ensureReady(owner, repo, session.token, session.userLogin)

  const cloudLogger = logger.child({
    component: "cloud.runtime",
    owner,
    repo: `${owner}/${repo}`,
  })
  const commitService = new ExitCommitService(runner, undefined, cloudLogger.child({ component: "cloud.exit_commit" }))
  const pushCoordinator = new PushRetryCoordinator(
    runner,
    options.retryPrompt,
    cloudLogger.child({ component: "cloud.push_retry" }),
  )
  const lifecycle = new CloudLifecycleManager(
    repoContext,
    commitService,
    pushCoordinator,
    new CloudMetadataStore(),
    cloudLogger.child({ component: "cloud.lifecycle" }),
  )
  const startupSync = new StartupSync(runner, cloudLogger.child({ component: "cloud.startup_sync" }))

  try {
    try {
      await startupSync.run(repoContext.localPath)
      await lifecycle.markStartupSuccess()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown startup sync failure"
      await lifecycle.markStartupFailure(message)
      throw new Error(`Cloud startup sync failed: ${message}`)
    }

    cloudLogger.info("cloud_mode_ready", { local_path: repoContext.localPath })
    await startSeedApp({
      cwd: repoContext.localPath,
      effectRunner: createCloudEffectRunner(lifecycle),
    })
  } catch (error) {
    cloudLogger.error("cloud_mode_failed", error)
    throw error
  } finally {
    await logger.close()
  }
}
