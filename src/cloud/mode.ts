import { startSeedApp } from "../app/start"
import { AuthService } from "./auth"
import { RepoBootstrapper } from "./bootstrap"
import { NodeCommandRunner, type CommandRunner } from "./command"
import { createCredentialStore, type CredentialStore } from "./credentials"
import type { DeviceAuthorizationClient } from "./device-flow"
import { ExitCommitService } from "./exit-commit"
import { GithubClient } from "./github"
import { CloudLifecycleManager, createCloudEffectRunner } from "./lifecycle"
import { logCloudEvent } from "./logging"
import { CloudMetadataStore } from "./metadata"
import { PushRetryCoordinator, type RetryPrompt } from "./push-retry"
import { StartupSync } from "./startup-sync"
import { logDiagnosticError } from "../diagnostics/logging"

type CloudModeOptions = {
  commandRunner?: CommandRunner
  credentialStore?: CredentialStore
  githubClient?: GithubClient
  deviceAuthClient?: DeviceAuthorizationClient
  retryPrompt?: RetryPrompt
}

export async function runCloudMode(owner: string, repo: string, options: CloudModeOptions = {}): Promise<void> {
  const repoSlug = `${owner}/${repo}`
  logCloudEvent("mode_start", { repo: repoSlug })

  const runner = options.commandRunner ?? new NodeCommandRunner()
  const githubClient = options.githubClient ?? new GithubClient()
  const credentialStore = options.credentialStore ?? (await createCredentialStore(runner))

  const auth = new AuthService(credentialStore, githubClient, options.deviceAuthClient)
  let session: Awaited<ReturnType<AuthService["ensureAuthenticated"]>>
  try {
    logCloudEvent("auth_start", { repo: repoSlug, owner })
    session = await auth.ensureAuthenticated(owner)
  } catch (error) {
    logDiagnosticError("cloud.auth_failed", error, { repo: repoSlug, owner, phase: "auth" })
    throw error
  }

  const bootstrapper = new RepoBootstrapper(runner, githubClient)
  let repoContext: Awaited<ReturnType<RepoBootstrapper["ensureReady"]>>
  try {
    logCloudEvent("bootstrap_start", { repo: repoSlug, owner, authenticated_login: session.userLogin })
    repoContext = await bootstrapper.ensureReady(owner, repo, session.token, session.userLogin)
  } catch (error) {
    logDiagnosticError("cloud.bootstrap_failed", error, {
      repo: repoSlug,
      owner,
      authenticated_login: session.userLogin,
      phase: "bootstrap",
    })
    throw error
  }

  const commitService = new ExitCommitService(runner)
  const pushCoordinator = new PushRetryCoordinator(runner, options.retryPrompt)
  const lifecycle = new CloudLifecycleManager(repoContext, commitService, pushCoordinator, new CloudMetadataStore())
  const startupSync = new StartupSync(runner)

  try {
    logCloudEvent("startup_sync_start", { repo: repoSlug, local_path: repoContext.localPath })
    await startupSync.run(repoContext.localPath)
    await lifecycle.markStartupSuccess()
  } catch (error) {
    logDiagnosticError("cloud.startup_sync_failed", error, {
      repo: repoSlug,
      owner,
      local_path: repoContext.localPath,
      phase: "startup_sync",
    })
    const message = error instanceof Error ? error.message : "Unknown startup sync failure"
    await lifecycle.markStartupFailure(message)
    throw new Error(`Cloud startup sync failed: ${message}`)
  }

  logCloudEvent("cloud_mode_ready", { repo: repoSlug, local_path: repoContext.localPath })
  await startSeedApp({
    cwd: repoContext.localPath,
    effectRunner: createCloudEffectRunner(lifecycle),
  })
}
