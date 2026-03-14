import { randomUUID } from "node:crypto"
import { appendFile, mkdir, readdir, rm } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal"

export type LogContext = {
  session_id: string
  component: string
  operation_id?: string
  owner?: string
  repo?: string
}

export type LogError = {
  name: string
  message: string
  stack?: string
  code?: string | number
  cause?: string
}

export type LogRecord = {
  ts: string
  level: LogLevel
  event: string
  context: LogContext
  data?: Record<string, unknown>
  error?: LogError
}

export interface Logger {
  child(bindings: Partial<Omit<LogContext, "session_id">>): Logger
  debug(event: string, data?: Record<string, unknown>): void
  info(event: string, data?: Record<string, unknown>): void
  warn(event: string, data?: Record<string, unknown>): void
  error(event: string, error?: unknown, data?: Record<string, unknown>): void
  fatal(event: string, error?: unknown, data?: Record<string, unknown>): void
  beginOperation(name: string, data?: Record<string, unknown>): OperationLogger
  flush(): Promise<void>
  close(): Promise<void>
}

export interface OperationLogger extends Logger {
  succeed(data?: Record<string, unknown>): void
  fail(error: unknown, data?: Record<string, unknown>): void
}

export interface LogSink {
  write(record: LogRecord): Promise<void>
  flush(): Promise<void>
  close(): Promise<void>
}

const DEFAULT_LOG_ROOT = join(homedir(), ".seed", "log")
const DEFAULT_COMPONENT = "seed"
const MAX_TEXT_LENGTH = 4000
const RETENTION_DAYS = 14
const REDACTED = "[REDACTED]"
const SENSITIVE_KEY_RE = /(token|password|secret|authorization|access_token)/i

function logDateStamp(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function truncateText(value: string): string {
  if (value.length <= MAX_TEXT_LENGTH) {
    return value
  }
  return `${value.slice(0, MAX_TEXT_LENGTH)}...[truncated]`
}

function scrubSecrets(value: string): string {
  return truncateText(
    value
      .replace(/(authorization:\s*(?:basic|bearer)\s+)[^\s"]+/gi, `$1${REDACTED}`)
      .replace(/\bgh[opusr]_[A-Za-z0-9_]+\b/g, REDACTED)
      .replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, REDACTED),
  )
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY_RE.test(key)) {
    return REDACTED
  }

  if (typeof value === "string") {
    return scrubSecrets(value)
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry))
  }

  if (value instanceof Error) {
    return serializeError(value)
  }

  if (typeof value === "object" && value) {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitizeValue(entryValue, entryKey)]))
  }

  if (typeof value === "undefined") {
    return undefined
  }

  return String(value)
}

function sanitizeData(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(data)
      .map(([key, value]) => [key, sanitizeValue(value, key)] as const)
      .filter((entry): entry is [string, unknown] => typeof entry[1] !== "undefined"),
  )
}

function serializeError(error: unknown): LogError {
  if (error instanceof Error) {
    const candidate = error as Error & { code?: string | number; cause?: unknown }
    return {
      name: error.name,
      message: scrubSecrets(error.message),
      stack: error.stack ? scrubSecrets(error.stack) : undefined,
      code: candidate.code,
      cause: candidate.cause instanceof Error ? scrubSecrets(candidate.cause.message) : undefined,
    }
  }

  return {
    name: "Error",
    message: scrubSecrets(String(error)),
  }
}

export class NoopLogSink implements LogSink {
  async write(_record: LogRecord): Promise<void> {}

  async flush(): Promise<void> {}

  async close(): Promise<void> {}
}

export class MemoryLogSink implements LogSink {
  readonly records: LogRecord[] = []

  async write(record: LogRecord): Promise<void> {
    this.records.push(record)
  }

  async flush(): Promise<void> {}

  async close(): Promise<void> {}
}

export class FileLogSink implements LogSink {
  private pending: Promise<void> = Promise.resolve()

  constructor(
    private readonly logRoot = DEFAULT_LOG_ROOT,
    private readonly now: () => Date = () => new Date(),
  ) {}

  static async create(logRoot = DEFAULT_LOG_ROOT, now?: () => Date): Promise<FileLogSink> {
    const sink = new FileLogSink(logRoot, now)
    await sink.initialize()
    return sink
  }

  async write(record: LogRecord): Promise<void> {
    const runtimePath = this.filePath("runtime", this.now())
    const errorPath = this.filePath("error", this.now())
    const crashPath = this.filePath("crash", this.now())
    const line = `${JSON.stringify(record)}\n`

    const next = this.pending.then(async () => {
      await appendFile(runtimePath, line, "utf8")
      if (record.level === "error" || record.level === "fatal") {
        await appendFile(errorPath, line, "utf8")
      }
      if (record.level === "fatal" || record.event === "app.crash") {
        await appendFile(crashPath, line, "utf8")
      }
    })

    this.pending = next.catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      console.info(`[seed-log] failed to write diagnostic log: ${message}`)
    })

    await next
  }

  async flush(): Promise<void> {
    await this.pending
  }

  async close(): Promise<void> {
    await this.flush()
  }

  private async initialize(): Promise<void> {
    await mkdir(this.logRoot, { recursive: true })
    await this.pruneExpiredFiles()
  }

  private filePath(kind: "runtime" | "error" | "crash", date: Date): string {
    return join(this.logRoot, `${kind}-${logDateStamp(date)}.jsonl`)
  }

  private async pruneExpiredFiles(): Promise<void> {
    const entries = await readdir(this.logRoot, { withFileTypes: true })
    const cutoff = this.now().getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000

    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isFile()) {
          return
        }

        const match = entry.name.match(/^(runtime|error|crash)-(\d{4}-\d{2}-\d{2})\.jsonl$/)
        if (!match) {
          return
        }

        const timestamp = Date.parse(`${match[2]}T00:00:00.000Z`)
        if (!Number.isFinite(timestamp) || timestamp >= cutoff) {
          return
        }

        await rm(join(this.logRoot, entry.name), { force: true })
      }),
    )
  }
}

class SeedLogger implements Logger {
  constructor(
    private readonly sink: LogSink,
    private readonly context: LogContext,
  ) {}

  child(bindings: Partial<Omit<LogContext, "session_id">>): Logger {
    return new SeedLogger(this.sink, {
      ...this.context,
      ...bindings,
    })
  }

  debug(event: string, data?: Record<string, unknown>): void {
    this.write("debug", event, data)
  }

  info(event: string, data?: Record<string, unknown>): void {
    this.write("info", event, data)
  }

  warn(event: string, data?: Record<string, unknown>): void {
    this.write("warn", event, data)
  }

  error(event: string, error?: unknown, data?: Record<string, unknown>): void {
    this.write("error", event, data, error)
  }

  fatal(event: string, error?: unknown, data?: Record<string, unknown>): void {
    this.write("fatal", event, data, error)
  }

  beginOperation(name: string, data?: Record<string, unknown>): OperationLogger {
    const operation = new OperationScopedLogger(
      new SeedLogger(this.sink, {
        ...this.context,
        operation_id: randomUUID(),
      }),
      name,
    )
    operation.info(`${name}.start`, data)
    return operation
  }

  async flush(): Promise<void> {
    await this.sink.flush()
  }

  async close(): Promise<void> {
    await this.sink.close()
  }

  private write(level: LogLevel, event: string, data?: Record<string, unknown>, error?: unknown): void {
    const record: LogRecord = {
      ts: new Date().toISOString(),
      level,
      event,
      context: this.context,
      data: sanitizeData(data),
      error: typeof error === "undefined" ? undefined : serializeError(error),
    }

    void this.sink.write(record)
  }
}

class OperationScopedLogger implements OperationLogger {
  private readonly startedAt = Date.now()
  private completed = false

  constructor(
    private readonly logger: SeedLogger,
    private readonly operationName: string,
  ) {}

  child(bindings: Partial<Omit<LogContext, "session_id">>): Logger {
    return this.logger.child(bindings)
  }

  debug(event: string, data?: Record<string, unknown>): void {
    this.logger.debug(event, data)
  }

  info(event: string, data?: Record<string, unknown>): void {
    this.logger.info(event, data)
  }

  warn(event: string, data?: Record<string, unknown>): void {
    this.logger.warn(event, data)
  }

  error(event: string, error?: unknown, data?: Record<string, unknown>): void {
    this.logger.error(event, error, data)
  }

  fatal(event: string, error?: unknown, data?: Record<string, unknown>): void {
    this.logger.fatal(event, error, data)
  }

  beginOperation(name: string, data?: Record<string, unknown>): OperationLogger {
    return this.logger.beginOperation(name, data)
  }

  succeed(data?: Record<string, unknown>): void {
    if (this.completed) {
      return
    }
    this.completed = true
    this.logger.info(`${this.operationName}.success`, this.withDuration(data))
  }

  fail(error: unknown, data?: Record<string, unknown>): void {
    if (this.completed) {
      return
    }
    this.completed = true
    this.logger.error(`${this.operationName}.failure`, error, this.withDuration(data))
  }

  async flush(): Promise<void> {
    await this.logger.flush()
  }

  async close(): Promise<void> {
    await this.logger.close()
  }

  private withDuration(data?: Record<string, unknown>): Record<string, unknown> {
    return {
      ...(data ?? {}),
      duration_ms: Date.now() - this.startedAt,
    }
  }
}

export type CreateSeedLoggerOptions = {
  component?: string
  owner?: string
  repo?: string
  sessionId?: string
  logRoot?: string
  sink?: LogSink
}

export async function createSeedLogger(options: CreateSeedLoggerOptions = {}): Promise<Logger> {
  const sink = options.sink ?? (await FileLogSink.create(options.logRoot))
  return new SeedLogger(sink, {
    session_id: options.sessionId ?? randomUUID(),
    component: options.component ?? DEFAULT_COMPONENT,
    owner: options.owner,
    repo: options.repo,
  })
}

export function createNoopLogger(context: Partial<LogContext> = {}): Logger {
  return new SeedLogger(new NoopLogSink(), {
    session_id: context.session_id ?? "noop-session",
    component: context.component ?? DEFAULT_COMPONENT,
    operation_id: context.operation_id,
    owner: context.owner,
    repo: context.repo,
  })
}
