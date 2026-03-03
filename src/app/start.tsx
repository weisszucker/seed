import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"

import type { RuntimeEffectRunner } from "./runtime"
import { App } from "../ui/App"

export type StartSeedOptions = {
  cwd?: string
  effectRunner?: RuntimeEffectRunner
}

export async function startSeedApp(options: StartSeedOptions = {}): Promise<void> {
  // xterm modifyOtherKeys mode 2 lets terminals report ctrl+shift+<key> distinctly.
  // It is ignored by terminals that do not support it.
  const enableModifyOtherKeys = "\x1b[>4;2m"
  const disableModifyOtherKeys = "\x1b[>4;0m"

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    autoFocus: true,
    useMouse: true,
    useKittyKeyboard: {
      disambiguate: true,
      alternateKeys: true,
      allKeysAsEscapes: true,
      reportText: true,
    },
    onDestroy: () => {
      process.stdout.write(disableModifyOtherKeys)
    },
  })

  // Fallback for terminals that do not support Kitty keyboard protocol.
  if (!renderer.capabilities?.kitty_keyboard) {
    process.stdout.write(enableModifyOtherKeys)
  }

  const cwd = options.cwd ?? process.cwd()
  createRoot(renderer).render(<App cwd={cwd} effectRunner={options.effectRunner} />)
}
