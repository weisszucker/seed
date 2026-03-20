import { CliRenderEvents, createCliRenderer, type CliRenderer } from "@opentui/core"
import { createRoot, type Root } from "@opentui/react"

import type { RuntimeEffectRunner } from "./runtime"
import { App } from "../ui/App"

type ShutdownSignal = "SIGINT" | "SIGTERM" | "SIGHUP" | "SIGQUIT"

type ProcessLike = Pick<NodeJS.Process, "once" | "removeListener" | "stdout" | "stdin" | "exit"> & {
  exitCode?: number
}

type SeedShutdownControllerOptions = {
  renderer: CliRenderer
  getRoot: () => Root | null
  processRef?: ProcessLike
}

const SHUTDOWN_SIGNALS: ShutdownSignal[] = ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"]

const SIGNAL_EXIT_CODE: Record<ShutdownSignal, number> = {
  SIGINT: 130,
  SIGTERM: 143,
  SIGHUP: 129,
  SIGQUIT: 131,
}

const TERMINAL_RESTORE_SEQUENCE = "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1015l\x1b[?1049l\x1b[?25h"

function forceRestoreTerminal(processRef: ProcessLike): void {
  try {
    processRef.stdin.setRawMode?.(false)
  } catch {
    // Ignore terminal cleanup failures during shutdown.
  }

  try {
    processRef.stdout.write(TERMINAL_RESTORE_SEQUENCE)
  } catch {
    // Ignore terminal cleanup failures during shutdown.
  }
}

export function createSeedShutdownController({
  renderer,
  getRoot,
  processRef = process,
}: SeedShutdownControllerOptions): { cleanup: () => void; dispose: () => void } {
  let cleanedUp = false
  let disposed = false

  const signalListeners = new Map<ShutdownSignal, () => void>()
  let exitListener: (() => void) | null = null
  let destroyListener: (() => void) | null = null

  function dispose(): void {
    if (disposed) {
      return
    }

    disposed = true

    for (const [signal, listener] of signalListeners) {
      processRef.removeListener(signal, listener)
    }
    signalListeners.clear()

    if (exitListener) {
      processRef.removeListener("exit", exitListener)
      exitListener = null
    }

    if (destroyListener) {
      renderer.removeListener(CliRenderEvents.DESTROY, destroyListener)
      destroyListener = null
    }
  }

  function cleanup(): void {
    if (cleanedUp) {
      return
    }

    cleanedUp = true
    dispose()

    try {
      getRoot()?.unmount()
    } catch {
      // Ignore React tree teardown failures and continue restoring the terminal.
    }

    try {
      if (!renderer.isDestroyed) {
        renderer.destroy()
      }
    } catch {
      // Ignore renderer teardown failures and continue restoring the terminal.
    } finally {
      forceRestoreTerminal(processRef)
    }
  }

  for (const signal of SHUTDOWN_SIGNALS) {
    const listener = () => {
      cleanup()
      processRef.exitCode = SIGNAL_EXIT_CODE[signal]
      processRef.exit(SIGNAL_EXIT_CODE[signal])
    }
    signalListeners.set(signal, listener)
    processRef.once(signal, listener)
  }

  exitListener = () => {
    cleanup()
  }
  processRef.once("exit", exitListener)

  destroyListener = () => {
    dispose()
  }
  renderer.once(CliRenderEvents.DESTROY, destroyListener)

  return { cleanup, dispose }
}

export type StartSeedOptions = {
  cwd?: string
  effectRunner?: RuntimeEffectRunner
}

export async function startSeedApp(options: StartSeedOptions = {}): Promise<void> {
  let renderer: CliRenderer | null = null
  let root: Root | null = null
  let shutdownController: { cleanup: () => void; dispose: () => void } | null = null

  try {
    renderer = await createCliRenderer({
      exitOnCtrlC: false,
      autoFocus: true,
      useMouse: true,
    })

    shutdownController = createSeedShutdownController({
      renderer,
      getRoot: () => root,
    })

    const cwd = options.cwd ?? process.cwd()
    root = createRoot(renderer)
    root.render(<App cwd={cwd} effectRunner={options.effectRunner} />)
  } catch (error) {
    shutdownController?.cleanup()

    if (!shutdownController && renderer && !renderer.isDestroyed) {
      try {
        renderer.destroy()
      } catch {
        forceRestoreTerminal(process)
      }
    }

    throw error
  }
}
