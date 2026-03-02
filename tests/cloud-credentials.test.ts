import { describe, expect, test } from "bun:test"

import { credentialCandidates, resolveCredentialBackend } from "../src/cloud/credentials"

describe("credential backend resolver", () => {
  test("lists known macOS helper", () => {
    const candidates = credentialCandidates("darwin")
    expect(candidates).toEqual([{ helper: "osxkeychain", binary: "git-credential-osxkeychain" }])
  })

  test("prefers linux libsecret when both helpers exist", async () => {
    const backend = await resolveCredentialBackend("linux", async (binary) => {
      return binary === "git-credential-libsecret" || binary === "git-credential-manager-core"
    })

    expect(backend).toEqual({ helper: "libsecret", binary: "git-credential-libsecret" })
  })

  test("returns null when no helper is available", async () => {
    const backend = await resolveCredentialBackend("linux", async () => false)
    expect(backend).toBeNull()
  })
})
