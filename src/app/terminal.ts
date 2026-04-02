type TerminalProcessLike = {
  stdout: {
    isTTY?: boolean
    write(chunk: string): boolean
  }
  stdin: {
    isTTY?: boolean
    setRawMode?(value: boolean): void
  }
}

export const TERMINAL_RESTORE_SEQUENCE =
  "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1015l\x1b[?1049l\x1b[?25h"

export function forceRestoreTerminal(processRef: TerminalProcessLike): void {
  if (processRef.stdin.isTTY) {
    try {
      processRef.stdin.setRawMode?.(false)
    } catch {
      // Ignore terminal cleanup failures during shutdown.
    }
  }

  if (processRef.stdout.isTTY) {
    try {
      processRef.stdout.write(TERMINAL_RESTORE_SEQUENCE)
    } catch {
      // Ignore terminal cleanup failures during shutdown.
    }
  }
}
