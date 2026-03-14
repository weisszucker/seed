import { describe, expect, test } from "bun:test"

import {
  AuthService,
  DEFAULT_GITHUB_OAUTH_CLIENT_ID,
  resolveGithubOauthClientId,
  type GithubIdentityProvider,
} from "../src/cloud/auth"
import type { CredentialStore } from "../src/cloud/credentials"
import type { DeviceAuthorizationClient } from "../src/cloud/device-flow"

class MemoryCredentialStore implements CredentialStore {
  private value: string | null = null
  private available: boolean
  clearCount = 0
  setCount = 0

  constructor(available = true, initialValue: string | null = null) {
    this.available = available
    this.value = initialValue
  }

  isAvailable(): boolean {
    return this.available
  }

  async get(_key: string): Promise<string | null> {
    return this.value
  }

  async set(_key: string, value: string): Promise<void> {
    this.value = value
    this.setCount += 1
  }

  async clear(_key: string): Promise<void> {
    this.value = null
    this.clearCount += 1
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
    const credentials = new MemoryCredentialStore(true, "cached-token")
    const identity = new FakeIdentityProvider("cached-token")
    const device = new FakeDeviceAuthClient("new-token")
    const auth = new AuthService(credentials, identity, device)

    const session = await auth.ensureAuthenticated("alice")

    expect(session).toEqual({ token: "cached-token", userLogin: "alice" })
    expect(device.calls).toBe(0)
    expect(credentials.setCount).toBe(0)
  })

  test("clears invalid cached token and re-authenticates with device flow", async () => {
    const credentials = new MemoryCredentialStore(true, "stale-token")
    const identity = new FakeIdentityProvider("fresh-token")
    const device = new FakeDeviceAuthClient("fresh-token")
    const auth = new AuthService(credentials, identity, device)

    const session = await auth.ensureAuthenticated("alice")

    expect(session).toEqual({ token: "fresh-token", userLogin: "alice" })
    expect(credentials.clearCount).toBe(1)
    expect(credentials.setCount).toBe(1)
    expect(device.calls).toBe(1)
  })

  test("fails fast when secure credential backend is unavailable", async () => {
    const credentials = new MemoryCredentialStore(false, null)
    const identity = new FakeIdentityProvider("token")
    const device = new FakeDeviceAuthClient("token")
    const auth = new AuthService(credentials, identity, device)

    await expect(auth.ensureAuthenticated("alice")).rejects.toThrow("No secure credential backend was detected.")
  })
})
