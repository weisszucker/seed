import { describe, expect, test } from "bun:test"

import { GithubDeviceAuthorizationClient } from "../src/cloud/device-flow"

type QueuedResponse = {
  status?: number
  body: Record<string, unknown>
}

function createFetchQueue(queue: QueuedResponse[]) {
  const calls: Array<{ url: string; body: string }> = []
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const next = queue.shift()
    if (!next) {
      throw new Error("No queued response")
    }
    calls.push({
      url: String(input),
      body: typeof init?.body === "string" ? init.body : "",
    })
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { "Content-Type": "application/json" },
    })
  }
  return { fetchImpl, calls }
}

describe("github device authorization client", () => {
  test("polls until access token is available", async () => {
    const { fetchImpl, calls } = createFetchQueue([
      {
        body: {
          device_code: "device-code",
          user_code: "user-code",
          verification_uri: "https://github.com/login/device",
          verification_uri_complete: "https://github.com/login/device?user_code=user-code",
          expires_in: 120,
          interval: 1,
        },
      },
      { body: { error: "authorization_pending" } },
      { body: { error: "slow_down" } },
      { body: { access_token: "gho_abc" } },
    ])

    const sleeps: number[] = []
    const client = new GithubDeviceAuthorizationClient("client-id", fetchImpl, async (ms) => {
      sleeps.push(ms)
    })

    const token = await client.authorize(["repo"])

    expect(token).toBe("gho_abc")
    expect(calls[0]?.url).toBe("https://github.com/login/device/code")
    expect(calls[1]?.url).toBe("https://github.com/login/oauth/access_token")
    expect(sleeps).toEqual([1000, 1000, 6000])
  })

  test("throws on access denied", async () => {
    const { fetchImpl } = createFetchQueue([
      {
        body: {
          device_code: "device-code",
          user_code: "user-code",
          verification_uri: "https://github.com/login/device",
          expires_in: 120,
          interval: 1,
        },
      },
      { body: { error: "access_denied" } },
    ])

    const client = new GithubDeviceAuthorizationClient("client-id", fetchImpl, async () => {})

    await expect(client.authorize(["repo"])).rejects.toThrow("denied")
  })
})
