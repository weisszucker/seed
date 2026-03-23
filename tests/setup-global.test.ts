import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawn } from "node:child_process"

function runCommand(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })
    child.on("error", rejectRun)
    child.on("close", (code) => {
      resolveRun({ code, stdout, stderr })
    })
  })
}

describe("setup-global.sh", () => {
  test("creates the seed bin wrapper before linking", async () => {
    const repoRoot = resolve(import.meta.dir, "..")
    const tempRoot = await mkdtemp(join(tmpdir(), "seed-setup-global-"))

    try {
      const scriptDir = join(tempRoot, "scripts")
      const stubDir = join(tempRoot, "stubs")
      const logPath = join(tempRoot, "pm.log")

      await mkdir(scriptDir, { recursive: true })
      await mkdir(stubDir, { recursive: true })

      await writeFile(
        join(scriptDir, "setup-global.sh"),
        await readFile(join(repoRoot, "scripts/setup-global.sh"), "utf8"),
        { mode: 0o755 },
      )

      const stubScript = `#!/usr/bin/env bash
set -euo pipefail
echo "$0 $*" >>"${logPath}"
if [[ "\${1:-}" == "pm" && "\${2:-}" == "bin" ]]; then
  printf '%s\\n' "${stubDir}"
fi
`

      await writeFile(join(stubDir, "bun"), stubScript, { mode: 0o755 })
      await writeFile(join(stubDir, "npm"), stubScript, { mode: 0o755 })

      const result = await runCommand("/bin/bash", ["scripts/setup-global.sh"], {
        cwd: tempRoot,
        env: {
          ...process.env,
          PATH: `${stubDir}:${process.env.PATH ?? ""}`,
        },
      })

      expect(result.code).toBe(0)
      expect(result.stderr).toBe("")

      expect(await readFile(join(tempRoot, "bin/seed"), "utf8")).toBe('#!/usr/bin/env bun\n\nimport "../src/main.ts"\n')

      const log = await readFile(logPath, "utf8")
      expect(log.trim().split("\n")).toEqual([
        `${join(stubDir, "bun")} install`,
        `${join(stubDir, "bun")} link`,
        `${join(stubDir, "bun")} pm bin`,
      ])
      expect(result.stdout).toContain("Preparing local 'seed' executable...")
      expect(result.stdout).toContain("Linking 'seed' globally with bun...")
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })
})
