type RequestOptions = {
  method?: string
  token: string
  body?: unknown
}

import { createNoopLogger, type Logger } from "../logging/logger"

type GithubRepoResponse = {
  clone_url: string
}

export type GithubUser = {
  login: string
}

export type GithubRepoInfo = {
  remoteUrl: string
  created: boolean
}

export class GithubClient {
  constructor(
    private readonly baseUrl = "https://api.github.com",
    private readonly logger: Logger = createNoopLogger({ component: "cloud.github" }),
  ) {}

  async getAuthenticatedUser(token: string): Promise<GithubUser> {
    const response = await this.request("/user", { token })
    if (response.status === 401) {
      throw new Error("GitHub authentication failed. Token is invalid or expired.")
    }
    if (!response.ok) {
      throw await this.toGithubError("Failed to validate GitHub authentication", response)
    }
    return await response.json()
  }

  async ensureRepository(owner: string, repo: string, token: string, authenticatedLogin: string): Promise<GithubRepoInfo> {
    const existing = await this.getRepository(owner, repo, token)
    if (existing) {
      return { remoteUrl: existing.clone_url, created: false }
    }

    const payload = {
      name: repo,
      private: true,
      auto_init: false,
    }

    let createResponse: Response
    if (owner.toLowerCase() === authenticatedLogin.toLowerCase()) {
      createResponse = await this.request("/user/repos", {
        method: "POST",
        token,
        body: payload,
      })
    } else {
      createResponse = await this.request(`/orgs/${owner}/repos`, {
        method: "POST",
        token,
        body: payload,
      })
    }

    if (!createResponse.ok) {
      throw await this.toGithubError(`Failed to create repository ${owner}/${repo}`, createResponse)
    }

    const created = (await createResponse.json()) as GithubRepoResponse
    return { remoteUrl: created.clone_url, created: true }
  }

  private async getRepository(owner: string, repo: string, token: string): Promise<GithubRepoResponse | null> {
    const response = await this.request(`/repos/${owner}/${repo}`, { token })
    if (response.status === 404) {
      return null
    }
    if (!response.ok) {
      throw await this.toGithubError(`Failed to read repository ${owner}/${repo}`, response)
    }
    return await response.json()
  }

  private async request(path: string, options: RequestOptions): Promise<Response> {
    const method = options.method ?? "GET"
    const operation = this.logger.beginOperation("cloud.github.request", {
      method,
      path,
    })
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${options.token}`,
      "User-Agent": "seed-cloud-sync",
      "X-GitHub-Api-Version": "2022-11-28",
    }

    const init: RequestInit = {
      method,
      headers,
    }
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json"
      init.body = JSON.stringify(options.body)
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, init)
      operation.succeed({ status: response.status })
      return response
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown network error"
      const wrapped = new Error(`GitHub API request failed: ${message}`)
      operation.fail(wrapped)
      throw wrapped
    }
  }

  private async toGithubError(prefix: string, response: Response): Promise<Error> {
    const text = await response.text()
    const message = text.trim() || response.statusText || `HTTP ${response.status}`
    return new Error(`${prefix}: ${message}`)
  }
}
