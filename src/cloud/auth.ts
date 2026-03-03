import type { CredentialStore } from "./credentials"
import { credentialKeyForOwner } from "./credentials"
import { GithubDeviceAuthorizationClient, type DeviceAuthorizationClient } from "./device-flow"
import type { GithubUser } from "./github"
import { logDiagnostic } from "../diagnostics/logging"

export type AuthSession = {
  token: string
  userLogin: string
}

export interface GithubIdentityProvider {
  getAuthenticatedUser(token: string): Promise<GithubUser>
}

export function resolveGithubOauthClientIdFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const clientId = env.SEED_GITHUB_OAUTH_CLIENT_ID ?? env.GITHUB_OAUTH_CLIENT_ID
  if (!clientId || clientId.trim().length === 0) {
    throw new Error(
      [
        "Missing GitHub OAuth client ID.",
        "Set SEED_GITHUB_OAUTH_CLIENT_ID (or GITHUB_OAUTH_CLIENT_ID) and retry.",
      ].join(" "),
    )
  }
  return clientId.trim()
}

export class AuthService {
  private deviceAuthClient: DeviceAuthorizationClient | null

  constructor(
    private readonly credentialStore: CredentialStore,
    private readonly githubClient: GithubIdentityProvider,
    deviceAuthClient?: DeviceAuthorizationClient,
  ) {
    this.deviceAuthClient = deviceAuthClient ?? null
  }

  async ensureAuthenticated(owner: string): Promise<AuthSession> {
    if (!this.credentialStore.isAvailable()) {
      throw new Error(
        [
          "No secure credential backend was detected.",
          "Install Git Credential Manager or an OS-backed helper and retry.",
        ].join(" "),
      )
    }

    const key = credentialKeyForOwner(owner)
    const cached = await this.credentialStore.get(key)
    if (cached) {
      try {
        const user = await this.githubClient.getAuthenticatedUser(cached)
        return {
          token: cached,
          userLogin: user.login,
        }
      } catch (error) {
        await this.credentialStore.clear(key)
        const message = error instanceof Error ? error.message : "Authentication failed"
        logDiagnostic("warn", "cloud.cached_credential_rejected", { owner, error: message })
      }
    }

    const token = await this.getDeviceAuthClient().authorize(["repo"])
    const user = await this.githubClient.getAuthenticatedUser(token)
    await this.credentialStore.set(key, token)
    return {
      token,
      userLogin: user.login,
    }
  }

  private getDeviceAuthClient(): DeviceAuthorizationClient {
    if (this.deviceAuthClient) {
      return this.deviceAuthClient
    }

    const clientId = resolveGithubOauthClientIdFromEnv()
    this.deviceAuthClient = new GithubDeviceAuthorizationClient(clientId)
    return this.deviceAuthClient
  }
}
