import { startSeedApp } from "../app/start"
import { AuthService } from "./auth"
import { RepoBootstrapper } from "./bootstrap"
import { createGithubAuthenticatedRunner, NodeCommandRunner, type CommandRunner } from "./command"
import { createCredentialStore, type CredentialStore } from "./credentials"
import type { DeviceAuthorizationClient } from "./device-flow"
import { ExitCommitService } from "./exit-commit"
import { GithubClient } from "./github"
import { CloudLifecycleManager, createCloudEffectRunner } from "./lifecycle"
import { logCloudEvent } from "./logging"
import { CloudMetadataStore } from "./metadata"
import { PushRetryCoordinator, type RetryPrompt } from "./push-retry"
import { StartupSync } from "./startup-sync"

type CloudModeOptions = {
  commandRunner?: CommandRunner
  credentialStore?: CredentialStore
  githubClient?: GithubClient
  deviceAuthClient?: DeviceAuthorizationClient
  retryPrompt?: RetryPrompt
}

export async function runCloudMode(owner: string, repo: string, options: CloudModeOptions = {}): Promise<void> {
  const baseRunner = options.commandRunner ?? new NodeCommandRunner()
  const githubClient = options.githubClient ?? new GithubClient()
  const credentialStore = options.credentialStore ?? (await createCredentialStore(baseRunner))

  const auth = new AuthService(credentialStore, githubClient, options.deviceAuthClient)
  const session = await auth.ensureAuthenticated(owner)
  const runner = createGithubAuthenticatedRunner(baseRunner, session.token)

  const bootstrapper = new RepoBootstrapper(runner, githubClient)
  const repoContext = await bootstrapper.ensureReady(owner, repo, session.token, session.userLogin)

  const commitService = new ExitCommitService(runner)
  const pushCoordinator = new PushRetryCoordinator(runner, options.retryPrompt)
  const lifecycle = new CloudLifecycleManager(repoContext, commitService, pushCoordinator, new CloudMetadataStore())
  const startupSync = new StartupSync(runner)

  try {
    await startupSync.run(repoContext.localPath)
    await lifecycle.markStartupSuccess()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown startup sync failure"
    await lifecycle.markStartupFailure(message)
    throw new Error(`Cloud startup sync failed: ${message}`)
  }

  console.error("Cloud mode ready")
  logCloudEvent("cloud_mode_ready", { repo: `${owner}/${repo}`, local_path: repoContext.localPath })
  await startSeedApp({
    cwd: repoContext.localPath,
    effectRunner: createCloudEffectRunner(lifecycle),
  })
}
