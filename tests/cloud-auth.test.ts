import { describe, expect, test } from "bun:test"

import {
  AuthService,
  DEFAULT_GITHUB_OAUTH_CLIENT_ID,
  resolveGithubOauthClientId,
  type GithubIdentityProvider,
} from "../src/cloud/auth"
import {
  credentialKeyForGithubAccount,
  credentialKeyForGithubHost,
  credentialKeyForOwner,
  legacyCredentialKeyForOwner,
  type CredentialStore,
} from "../src/cloud/credentials"
import type { DeviceAuthorizationClient } from "../src/cloud/device-flow"

class MemoryCredentialStore implements CredentialStore {
  private readonly values = new Map<string, string>()
  private available: boolean
  clearCount = 0
  setCount = 0
  clearedKeys: string[] = []
  setKeys: string[] = []

  constructor(available = true, initialEntries: Record<string, string> = {}) {
    this.available = available
    Object.entries(initialEntries).forEach(([key, value]) => {
      this.values.set(key, value)
    })
  }

  isAvailable(): boolean {
    return this.available
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value)
    this.setCount += 1
    this.setKeys.push(key)
  }

  async clear(key: string): Promise<void> {
    this.values.delete(key)
    this.clearCount += 1
    this.clearedKeys.push(key)
  }

  read(key: string): string | null {
    return this.values.get(key) ?? null
  }
}

class FakeIdentityProvider implements GithubIdentityProvider {
  private readonly validToken: string
  calls: string[] = []

  constructor(validToken: string) {
    this.validToken = validToken
  }

  async getAuthenticatedUser(token: string): Promise<{ login: string }> {
    this.calls.push(token)
    if (token !== this.validToken) {
      throw new Error("invalid token")
    }
    return { login: "alice" }
  }
}

class FakeDeviceAuthClient implements DeviceAuthorizationClient {
  private readonly token: string
  calls = 0

  constructor(token: string) {
    this.token = token
  }

  async authorize(_scopes: string[]): Promise<string> {
    this.calls += 1
    return this.token
  }
}

describe("cloud auth service", () => {
  test("uses the bundled oauth client id", () => {
    expect(resolveGithubOauthClientId()).toBe(DEFAULT_GITHUB_OAUTH_CLIENT_ID)
  })

  test("reuses cached valid token and skips device flow", async () => {
    const credentials = new MemoryCredentialStore(true, {
      [credentialKeyForGithubHost()]: "cached-token",
    })
    const identity = new FakeIdentityProvider("cached-token")
    const device = new FakeDeviceAuthClient("new-token")
    const auth = new AuthService(credentials, identity, device)

    const session = await auth.ensureAuthenticated("alice")

    expect(session).toEqual({ token: "cached-token", userLogin: "alice" })
    expect(device.calls).toBe(0)
    expect(credentials.read(credentialKeyForGithubHost())).toBe("cached-token")
    expect(credentials.read(credentialKeyForGithubAccount())).toBe("cached-token")
    expect(credentials.read(credentialKeyForOwner("alice"))).toBe("cached-token")
  })

  test("exposes cached token without validating it", async () => {
    const credentials = new MemoryCredentialStore(true, {
      [credentialKeyForGithubHost()]: "cached-token",
    })
    const identity = new FakeIdentityProvider("fresh-token")
    const device = new FakeDeviceAuthClient("fresh-token")
    const auth = new AuthService(credentials, identity, device)

    const token = await auth.tryReuseCachedToken("alice")

    expect(token).toBe("cached-token")
    expect(identity.calls).toEqual([])
    expect(device.calls).toBe(0)
  })

  test("clears invalid cached token and re-authenticates with device flow", async () => {
    const credentials = new MemoryCredentialStore(true, {
      [credentialKeyForGithubHost()]: "stale-token",
    })
    const identity = new FakeIdentityProvider("fresh-token")
    const device = new FakeDeviceAuthClient("fresh-token")
    const auth = new AuthService(credentials, identity, device)

    const session = await auth.ensureAuthenticated("alice")

    expect(session).toEqual({ token: "fresh-token", userLogin: "alice" })
    expect(credentials.clearCount).toBe(1)
    expect(credentials.clearedKeys).toEqual([credentialKeyForGithubHost()])
    expect(credentials.read(credentialKeyForGithubHost())).toBe("fresh-token")
    expect(credentials.read(credentialKeyForGithubAccount())).toBe("fresh-token")
    expect(credentials.read(credentialKeyForOwner("alice"))).toBe("fresh-token")
    expect(device.calls).toBe(1)
  })

  test("reuses token stored under a differently cased owner", async () => {
    const credentials = new MemoryCredentialStore(true, {
      [legacyCredentialKeyForOwner("WeissZucker")]: "cached-token",
    })
    const identity = new FakeIdentityProvider("cached-token")
    const device = new FakeDeviceAuthClient("new-token")
    const auth = new AuthService(credentials, identity, device)

    const session = await auth.ensureAuthenticated("weisszucker")

    expect(session).toEqual({ token: "cached-token", userLogin: "alice" })
    expect(device.calls).toBe(0)
    expect(credentials.read(credentialKeyForGithubHost())).toBe("cached-token")
    expect(credentials.read(credentialKeyForGithubAccount())).toBe("cached-token")
    expect(credentials.read(credentialKeyForOwner("alice"))).toBe("cached-token")
  })

  test("does not rewrite canonical credential entries when they already match", async () => {
    const credentials = new MemoryCredentialStore(true, {
      [credentialKeyForGithubHost()]: "cached-token",
      [credentialKeyForGithubAccount()]: "cached-token",
      [credentialKeyForOwner("alice")]: "cached-token",
    })
    const identity = new FakeIdentityProvider("cached-token")
    const device = new FakeDeviceAuthClient("new-token")
    const auth = new AuthService(credentials, identity, device)

    const session = await auth.ensureAuthenticated("alice")

    expect(session).toEqual({ token: "cached-token", userLogin: "alice" })
    expect(credentials.setCount).toBe(0)
    expect(device.calls).toBe(0)
  })

  test("fails fast when secure credential backend is unavailable", async () => {
    const credentials = new MemoryCredentialStore(false)
    const identity = new FakeIdentityProvider("token")
    const device = new FakeDeviceAuthClient("token")
    const auth = new AuthService(credentials, identity, device)

    await expect(auth.ensureAuthenticated("alice")).rejects.toThrow("No secure credential backend was detected.")
  })
})
