import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"

import type { RuntimeEffectRunner } from "./runtime"
import { App } from "../ui/App"

export type StartSeedOptions = {
  cwd?: string
  effectRunner?: RuntimeEffectRunner
}

export async function startSeedApp(options: StartSeedOptions = {}): Promise<void> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    autoFocus: true,
    useMouse: true,
  })

  const cwd = options.cwd ?? process.cwd()
  createRoot(renderer).render(<App cwd={cwd} effectRunner={options.effectRunner} />)
}
