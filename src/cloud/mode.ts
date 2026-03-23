import { startSeedApp } from "../app/start"
import { createSeedLogger, type Logger } from "../logging/logger"
import { AuthService, type AuthSession } from "./auth"
import { RepoBootstrapper, type RepoContext } from "./bootstrap"
import {
  createGithubAuthenticatedRunner,
  isAuthenticationFailure,
  NodeCommandRunner,
  type CommandRunner,
} from "./command"
import { createCredentialStore, type CredentialStore } from "./credentials"
import type { DeviceAuthorizationClient } from "./device-flow"
import { ExitCommitService } from "./exit-commit"
import { GithubClient } from "./github"
import { CloudLifecycleManager, createCloudEffectRunner } from "./lifecycle"
import { CloudMetadataStore } from "./metadata"
import { PushRetryCoordinator, type RetryPrompt } from "./push-retry"
import { StartupSync } from "./startup-sync"
import { homedir } from "node:os"
import { join } from "node:path"

type CloudModeOptions = {
  commandRunner?: CommandRunner
  credentialStore?: CredentialStore
  githubClient?: GithubClient
  deviceAuthClient?: DeviceAuthorizationClient
  retryPrompt?: RetryPrompt
  logger?: Logger
  startApp?: typeof startSeedApp
  rootDir?: string
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
  const startApp = options.startApp ?? startSeedApp
  const rootDir = options.rootDir ?? join(homedir(), ".seed")

  const auth = new AuthService(
    credentialStore,
    githubClient,
    options.deviceAuthClient,
    logger.child({ component: "cloud.auth" }),
  )
  const bootstrapLogger = logger.child({ component: "cloud.bootstrap" })
  let validatedSession: AuthSession | null = null
  let cachedToken = await auth.tryReuseCachedToken(owner)

  const createBootstrapper = (runner: CommandRunner) => new RepoBootstrapper(runner, githubClient, rootDir, bootstrapLogger)

  const syncAndLaunch = async (
    runner: CommandRunner,
    repoContext: RepoContext,
    launchOptions: { startupAlreadySynced?: boolean } = {},
  ): Promise<void> => {
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
        if (launchOptions.startupAlreadySynced) {
          await lifecycle.markStartupSuccess()
        } else {
          await startupSync.run(repoContext.localPath)
          await lifecycle.markStartupSuccess()
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown startup sync failure"
        await lifecycle.markStartupFailure(message)
        throw new Error(`Cloud startup sync failed: ${message}`)
      }

      cloudLogger.info("cloud_mode_ready", { local_path: repoContext.localPath })
      await startApp({
        cwd: repoContext.localPath,
        effectRunner: createCloudEffectRunner(lifecycle),
      })
    } catch (error) {
      cloudLogger.error("cloud_mode_failed", error)
      throw error
    }
  }

  const validateSession = async (): Promise<AuthSession> => {
    validatedSession = await auth.ensureAuthenticated(owner)
    cachedToken = validatedSession.token
    return validatedSession
  }

  const startViaBootstrap = async (token: string, session?: AuthSession): Promise<void> => {
    const runner = createGithubAuthenticatedRunner(baseRunner, token)
    const repoContext = await createBootstrapper(runner).ensureReady(owner, repo, token, session?.userLogin)
    await syncAndLaunch(runner, repoContext)
  }

  try {
    if (cachedToken) {
      const runner = createGithubAuthenticatedRunner(baseRunner, cachedToken)
      const fastRepoContext = await createBootstrapper(runner).tryResolveLocalRepo(owner, repo)

      if (fastRepoContext) {
        const startupSync = new StartupSync(runner, logger.child({ component: "cloud.startup_sync" }))
        try {
          await startupSync.run(fastRepoContext.localPath)
          await syncAndLaunch(runner, fastRepoContext, { startupAlreadySynced: true })
          return
        } catch (error) {
          logger.warn("cloud.fast_path_failed", {
            local_path: fastRepoContext.localPath,
            reason: error instanceof Error ? error.message : String(error),
          })
          if (isAuthenticationFailure(error)) {
            await validateSession()
          }
        }
      }
    }

    if (!cachedToken) {
      await validateSession()
    }

    try {
      await startViaBootstrap(cachedToken!, validatedSession ?? undefined)
    } catch (error) {
      if (!validatedSession && cachedToken && isAuthenticationFailure(error)) {
        const session = await validateSession()
        await startViaBootstrap(session.token, session)
        return
      }
      throw error
    }
  } finally {
    await logger.close()
  }
}
