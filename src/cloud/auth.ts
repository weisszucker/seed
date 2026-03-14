import type { CredentialStore } from "./credentials"
import { credentialKeyForGithubHost } from "./credentials"
import { credentialKeyForGithubAccount } from "./credentials"
import { credentialKeyForOwner } from "./credentials"
import { legacyCredentialKeyForGithubAccount } from "./credentials"
import { legacyCredentialKeyForGithubHost } from "./credentials"
import { legacyCredentialKeyForOwner } from "./credentials"
import { GithubDeviceAuthorizationClient, type DeviceAuthorizationClient } from "./device-flow"
import type { GithubUser } from "./github"

export type AuthSession = {
  token: string
  userLogin: string
}

export interface GithubIdentityProvider {
  getAuthenticatedUser(token: string): Promise<GithubUser>
}

export const DEFAULT_GITHUB_OAUTH_CLIENT_ID = "Ov23lixUX18kHxF16jdz"

export function resolveGithubOauthClientId(): string {
  return DEFAULT_GITHUB_OAUTH_CLIENT_ID
}

function authDebugEnabled(): boolean {
  return process.env.SEED_CLOUD_AUTH_DEBUG === "1"
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

    for (const key of this.keysForLookup(owner)) {
      if (authDebugEnabled()) {
        console.error(`[seed-cloud][auth-debug] checking credential key: ${key}`)
      }
      const cached = await this.credentialStore.get(key)
      if (!cached) {
        if (authDebugEnabled()) {
          console.error(`[seed-cloud][auth-debug] no credential found for key: ${key}`)
        }
        continue
      }

      try {
        const user = await this.githubClient.getAuthenticatedUser(cached)
        await this.persistToken(owner, user.login, cached)
        if (authDebugEnabled()) {
          console.error(`[seed-cloud][auth-debug] cache hit accepted for key: ${key} as user ${user.login}`)
        }
        return {
          token: cached,
          userLogin: user.login,
        }
      } catch (error) {
        await this.credentialStore.clear(key)
        const message = error instanceof Error ? error.message : "Authentication failed"
        console.error(`[seed-cloud] Stored credential rejected: ${message}`)
      }
    }

    const token = await this.getDeviceAuthClient().authorize(["repo"])
    const user = await this.githubClient.getAuthenticatedUser(token)
    await this.persistToken(owner, user.login, token)
    return {
      token,
      userLogin: user.login,
    }
  }

  private keysForLookup(owner: string): string[] {
    return [
      ...new Set([
        credentialKeyForGithubHost(),
        credentialKeyForGithubAccount(),
        credentialKeyForOwner(owner),
        legacyCredentialKeyForGithubHost(),
        legacyCredentialKeyForGithubAccount(),
        legacyCredentialKeyForOwner(owner),
      ]),
    ]
  }

  private async persistToken(owner: string, userLogin: string, token: string): Promise<void> {
    const keys = new Set([
      credentialKeyForGithubHost(),
      credentialKeyForGithubAccount(),
      credentialKeyForOwner(owner),
      credentialKeyForOwner(userLogin),
    ])

    for (const key of keys) {
      if (authDebugEnabled()) {
        console.error(`[seed-cloud][auth-debug] storing credential under key: ${key}`)
      }
      await this.credentialStore.set(key, token)
    }
  }

  private getDeviceAuthClient(): DeviceAuthorizationClient {
    if (this.deviceAuthClient) {
      return this.deviceAuthClient
    }

    const clientId = resolveGithubOauthClientId()
    this.deviceAuthClient = new GithubDeviceAuthorizationClient(clientId)
    return this.deviceAuthClient
  }
}
