import type { TerminalSession } from "./types"

const DIAGNOSTIC_MARKER = "=== Visible Screen ==="

function appendDiagnostics(error: unknown, diagnostics: string): Error {
  if (error instanceof Error) {
    if (!error.message.includes(DIAGNOSTIC_MARKER)) {
      error.message = `${error.message}\n\n${diagnostics}`
    }
    if (error.stack && !error.stack.includes(DIAGNOSTIC_MARKER)) {
      error.stack = `${error.stack}\n\n${diagnostics}`
    }
    return error
  }

  return new Error(`${String(error)}\n\n${diagnostics}`)
}

export async function withLatestSessionDiagnostics<T extends TerminalSession>(
  sessions: T[],
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn()
  } catch (error) {
    const session = sessions.at(-1)
    if (!session) {
      throw error
    }

    try {
      const diagnostics = await session.collectFailureDiagnostics()
      throw appendDiagnostics(error, diagnostics)
    } catch (diagnosticError) {
      if (diagnosticError === error) {
        throw diagnosticError
      }

      const diagnosticMessage = diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)
      throw appendDiagnostics(error, `=== Failure Diagnostics Error ===\n${diagnosticMessage}`)
    }
  }
}
