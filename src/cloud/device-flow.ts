type DeviceCodeResponse = {
  device_code?: string
  user_code?: string
  verification_uri?: string
  verification_uri_complete?: string
  expires_in?: number
  interval?: number
}

type AccessTokenResponse = {
  access_token?: string
  error?: string
  error_description?: string
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
type SleepFn = (ms: number) => Promise<void>

import { createNoopLogger, type Logger } from "../logging/logger"

export interface DeviceAuthorizationClient {
  authorize(scopes: string[]): Promise<string>
}

export class GithubDeviceAuthorizationClient implements DeviceAuthorizationClient {
  constructor(
    private readonly clientId: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly sleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly logger: Logger = createNoopLogger({ component: "cloud.device_flow" }),
  ) {}

  async authorize(scopes: string[]): Promise<string> {
    const operation = this.logger.beginOperation("cloud.auth.device_flow", {
      scopes,
    })
    const scope = scopes.join(" ").trim()
    const codeResponse = await this.postForm<DeviceCodeResponse>("https://github.com/login/device/code", {
      client_id: this.clientId,
      scope,
    })

    const deviceCode = codeResponse.device_code
    const userCode = codeResponse.user_code
    const verificationUri = codeResponse.verification_uri
    const verificationUriComplete = codeResponse.verification_uri_complete
    const expiresIn = Number(codeResponse.expires_in ?? 0)
    let intervalSeconds = Number(codeResponse.interval ?? 5)

    if (!deviceCode || !userCode || !verificationUri || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      const error = new Error("GitHub device flow failed: invalid device code response.")
      operation.fail(error)
      throw error
    }
    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
      intervalSeconds = 5
    }

    this.logger.info("cloud.auth.device_flow_prompt", {
      verification_uri: verificationUri,
      has_direct_link: Boolean(verificationUriComplete),
      expires_in_seconds: expiresIn,
    })
    console.error("GitHub authentication required.")
    console.error(`Open: ${verificationUri}`)
    console.error(`Code: ${userCode}`)
    if (verificationUriComplete) {
      console.error(`Direct link: ${verificationUriComplete}`)
    }

    const deadline = Date.now() + expiresIn * 1000
    while (Date.now() < deadline) {
      await this.sleep(intervalSeconds * 1000)

      const tokenResponse = await this.postForm<AccessTokenResponse>("https://github.com/login/oauth/access_token", {
        client_id: this.clientId,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      })

      if (tokenResponse.access_token) {
        operation.succeed({
          poll_interval_seconds: intervalSeconds,
        })
        return tokenResponse.access_token
      }

      const error = tokenResponse.error
      if (error === "authorization_pending") {
        continue
      }
      if (error === "slow_down") {
        intervalSeconds += 5
        this.logger.warn("cloud.auth.device_flow_slow_down", {
          next_poll_interval_seconds: intervalSeconds,
        })
        continue
      }
      if (error === "access_denied") {
        const denied = new Error("GitHub device flow was denied by the user.")
        operation.fail(denied)
        throw denied
      }
      if (error === "expired_token") {
        const expired = new Error("GitHub device flow expired before authorization completed.")
        operation.fail(expired)
        throw expired
      }

      const description = tokenResponse.error_description
      const failure = new Error(
        description && description.length > 0
          ? `GitHub device flow failed: ${description}`
          : `GitHub device flow failed: ${error ?? "unknown error"}.`,
      )
      operation.fail(failure)
      throw failure
    }

    const timeoutError = new Error("GitHub device flow expired before authorization completed.")
    operation.fail(timeoutError)
    throw timeoutError
  }

  private async postForm<T>(url: string, values: Record<string, string>): Promise<T> {
    const body = new URLSearchParams(values)
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    })

    let parsed: unknown
    try {
      parsed = await response.json()
    } catch {
      parsed = null
    }

    if (!response.ok) {
      const reason =
        typeof parsed === "object" && parsed && "error_description" in parsed
          ? String((parsed as { error_description?: unknown }).error_description ?? "")
          : response.statusText
      throw new Error(`GitHub device flow request failed: ${reason || `HTTP ${response.status}`}`)
    }

    return (parsed ?? {}) as T
  }
}
