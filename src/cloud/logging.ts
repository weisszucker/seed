import { logDiagnostic } from "../diagnostics/logging"
import type { DiagnosticLevel } from "../diagnostics/logging"

type CloudLogPayload = Record<string, unknown>

export function logCloudEvent(
  event: string,
  payload: CloudLogPayload = {},
  level: DiagnosticLevel = "info",
): void {
  logDiagnostic(level, `cloud.${event}`, payload)
}
