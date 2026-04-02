import { spawn } from "node:child_process"

type Osc52Clipboard = {
  copyToClipboardOSC52(text: string): boolean
}

type ClipboardDependencies = {
  platform?: NodeJS.Platform
  copyWithMacClipboard?: (text: string) => Promise<boolean>
}

export async function copyWithMacClipboard(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const child = spawn("pbcopy", [], {
      stdio: ["pipe", "ignore", "ignore"],
    })

    function finish(success: boolean): void {
      if (settled) {
        return
      }
      settled = true
      resolve(success)
    }

    child.once("error", () => finish(false))
    child.once("close", (code) => finish(code === 0))
    child.stdin.once("error", () => finish(false))
    child.stdin.end(text)
  })
}

export async function copyTextToClipboard(
  text: string,
  renderer: Osc52Clipboard,
  deps: ClipboardDependencies = {},
): Promise<boolean> {
  const platform = deps.platform ?? process.platform

  if (platform === "darwin") {
    const copied = await (deps.copyWithMacClipboard ?? copyWithMacClipboard)(text)
    if (copied) {
      return true
    }
  }

  return renderer.copyToClipboardOSC52(text)
}
