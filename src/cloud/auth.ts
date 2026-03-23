import type { CredentialStore } from "./credentials"
import { credentialKeyForGithubHost } from "./credentials"
import { credentialKeyForGithubAccount } from "./credentials"
import { credentialKeyForOwner } from "./credentials"
import { legacyCredentialKeyForGithubAccount } from "./credentials"
import { legacyCredentialKeyForGithubHost } from "./credentials"
import { legacyCredentialKeyForOwner } from "./credentials"
import { GithubDeviceAuthorizationClient, type DeviceAuthorizationClient } from "./device-flow"
import type { GithubUser } from "./github"
import { createNoopLogger, type Logger } from "../logging/logger"

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
  private readonly logger: Logger

  constructor(
    private readonly credentialStore: CredentialStore,
    private readonly githubClient: GithubIdentityProvider,
    deviceAuthClient?: DeviceAuthorizationClient,
    logger: Logger = createNoopLogger({ component: "cloud.auth" }),
  ) {
    this.deviceAuthClient = deviceAuthClient ?? null
    this.logger = logger
  }

  async tryReuseCachedToken(owner: string): Promise<string | null> {
    if (!this.credentialStore.isAvailable()) {
      return null
    }

    for (const key of this.keysForLookup(owner)) {
      if (authDebugEnabled()) {
        this.logger.debug("cloud.auth.lookup_key", { credential_key: key })
      }
      const cached = await this.credentialStore.get(key)
      if (cached) {
        return cached
      }
    }

    return null
  }

  async ensureAuthenticated(owner: string): Promise<AuthSession> {
    const operation = this.logger.beginOperation("cloud.auth.ensure", { owner })

    if (!this.credentialStore.isAvailable()) {
      const error = new Error(
        [
          "No secure credential backend was detected.",
          "Install Git Credential Manager or an OS-backed helper and retry.",
        ].join(" "),
      )
      operation.fail(error)
      throw error
    }

    for (const lookup of await this.lookupCachedTokens(owner)) {
      if (!lookup.token) {
        if (authDebugEnabled()) {
          this.logger.debug("cloud.auth.lookup_miss", { credential_key: lookup.key })
        }
        continue
      }

      try {
        const user = await this.githubClient.getAuthenticatedUser(lookup.token)
        await this.persistToken(owner, user.login, lookup.token)
        if (authDebugEnabled()) {
          this.logger.debug("cloud.auth.cache_hit", {
            credential_key: lookup.key,
            user_login: user.login,
          })
        }
        operation.succeed({ auth_source: "credential_cache", user_login: user.login })
        return {
          token: lookup.token,
          userLogin: user.login,
        }
      } catch (error) {
        await this.credentialStore.clear(lookup.key)
        const message = error instanceof Error ? error.message : "Authentication failed"
        console.info(`[seed-cloud] Stored credential rejected: ${message}`)
        this.logger.warn("cloud.auth.cache_rejected", {
          credential_key: lookup.key,
          reason: message,
        })
      }
    }

    this.logger.info("cloud.auth.device_flow_required", { owner })
    const token = await this.getDeviceAuthClient().authorize(["repo"])
    const user = await this.githubClient.getAuthenticatedUser(token)
    await this.persistToken(owner, user.login, token)
    operation.succeed({ auth_source: "device_flow", user_login: user.login })
    return {
      token,
      userLogin: user.login,
    }
  }

  private async lookupCachedTokens(owner: string): Promise<Array<{ key: string; token: string | null }>> {
    const results: Array<{ key: string; token: string | null }> = []

    for (const key of this.keysForLookup(owner)) {
      if (authDebugEnabled()) {
        this.logger.debug("cloud.auth.lookup_key", { credential_key: key })
      }
      results.push({
        key,
        token: await this.credentialStore.get(key),
      })
    }

    return results
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
        this.logger.debug("cloud.auth.persist_key", { credential_key: key })
      }
      const existing = await this.credentialStore.get(key)
      if (existing === token) {
        continue
      }
      await this.credentialStore.set(key, token)
    }
  }

  private getDeviceAuthClient(): DeviceAuthorizationClient {
    if (this.deviceAuthClient) {
      return this.deviceAuthClient
    }

    const clientId = resolveGithubOauthClientId()
    this.deviceAuthClient = new GithubDeviceAuthorizationClient(clientId, fetch, undefined, this.logger.child({
      component: "cloud.device_flow",
    }))
    return this.deviceAuthClient
  }
}
