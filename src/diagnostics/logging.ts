import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export type DiagnosticLevel = "error" | "warn" | "info" | "debug"

type DiagnosticFields = Record<string, unknown>

const SENSITIVE_KEY_RE = /(token|secret|password|authorization|credential|content|document|text)/i
const GITHUB_TOKEN_RE = /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g
const GITHUB_FINE_GRAINED_TOKEN_RE = /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g
const BEARER_TOKEN_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi
const BASIC_AUTH_URL_RE = /(https?:\/\/)([^/\s:@]+):([^@\s/]+)@/gi
const MAX_STRING_LENGTH = 600

let logPathOverride: string | null = null
let didReportFailure = false
let initialized = false

function diagnosticLogPath(): string {
  if (logPathOverride) {
    return logPathOverride
  }
  return join(homedir(), ".seed", "log")
}

function redactAndTrim(text: string): string {
  let sanitized = text
    .replace(GITHUB_TOKEN_RE, "[REDACTED]")
    .replace(GITHUB_FINE_GRAINED_TOKEN_RE, "[REDACTED]")
    .replace(BEARER_TOKEN_RE, "Bearer [REDACTED]")
    .replace(BASIC_AUTH_URL_RE, "$1[REDACTED]:[REDACTED]@")
  if (sanitized.length > MAX_STRING_LENGTH) {
    sanitized = `${sanitized.slice(0, MAX_STRING_LENGTH)}...[truncated]`
  }
  return sanitized
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_RE.test(key)) {
    return "[REDACTED]"
  }

  if (value === null) {
    return null
  }

  if (typeof value === "string") {
    return redactAndTrim(value)
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value
  }

  if (value instanceof Error) {
    return redactAndTrim(value.message)
  }

  if (Array.isArray(value)) {
    return `[array:${value.length}]`
  }

  if (typeof value === "object") {
    return "[object]"
  }

  return String(value)
}

function sanitizeFields(fields: DiagnosticFields): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "undefined") {
      continue
    }
    sanitized[key] = sanitizeValue(key, value)
  }
  return sanitized
}

function appendLine(line: string): void {
  if (!initialized) {
    return
  }

  const path = diagnosticLogPath()
  try {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, line, "utf8")
  } catch {
    if (!didReportFailure) {
      didReportFailure = true
      process.stderr.write(`Warning: failed to write diagnostics log at ${path}\n`)
    }
  }
}

export function initializeDiagnosticsLog(): void {
  const path = diagnosticLogPath()
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, "", "utf8")
    initialized = true
    didReportFailure = false
  } catch {
    initialized = false
    if (!didReportFailure) {
      didReportFailure = true
      process.stderr.write(`Warning: failed to initialize diagnostics log at ${path}\n`)
    }
  }
}

export function logDiagnostic(level: DiagnosticLevel, event: string, fields: DiagnosticFields = {}): void {
  const record = {
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitizeFields(fields),
  }
  appendLine(`${JSON.stringify(record)}\n`)
}

export function logDiagnosticError(event: string, error: unknown, fields: DiagnosticFields = {}): void {
  if (error instanceof Error) {
    logDiagnostic("error", event, {
      ...fields,
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack ?? "",
    })
    return
  }

  logDiagnostic("error", event, {
    ...fields,
    error_message: String(error),
  })
}

export function setDiagnosticLogPathForTests(path: string | null): void {
  logPathOverride = path
  initialized = false
  didReportFailure = false
}
