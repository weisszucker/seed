import { afterAll } from "bun:test"

const TRACKED_MODES = {
  "1000": "mouse-x10",
  "1002": "mouse-drag",
  "1003": "mouse-motion",
  "1006": "mouse-sgr",
  "1015": "mouse-urxvt",
  "1049": "alternate-screen",
} as const

type TrackedModeCode = keyof typeof TRACKED_MODES
type TerminalModeState = Record<TrackedModeCode, boolean>

const modeState: TerminalModeState = {
  "1000": false,
  "1002": false,
  "1003": false,
  "1006": false,
  "1015": false,
  "1049": false,
}

const modeTransitions: string[] = []
const MODE_SEQUENCE_PATTERN = /\x1b\[\?(1000|1002|1003|1006|1015|1049)([hl])/g

function trackChunk(chunk: unknown, stream: "stdout" | "stderr"): void {
  if (typeof chunk !== "string") {
    return
  }

  for (const match of chunk.matchAll(MODE_SEQUENCE_PATTERN)) {
    const code = match[1] as TrackedModeCode
    const action = match[2] === "h"
    modeState[code] = action
    modeTransitions.push(`${stream}:${TRACKED_MODES[code]}:${action ? "enable" : "disable"}`)
  }
}

function wrapWrite<T extends { write: (...args: any[]) => any }>(stream: T, name: "stdout" | "stderr"): void {
  const originalWrite = stream.write.bind(stream)

  stream.write = ((chunk: unknown, ...args: unknown[]) => {
    trackChunk(chunk, name)
    return originalWrite(chunk, ...args)
  }) as T["write"]
}

wrapWrite(process.stdout, "stdout")
wrapWrite(process.stderr, "stderr")

afterAll(() => {
  const leakingModes = Object.entries(modeState)
    .filter(([, enabled]) => enabled)
    .map(([code]) => TRACKED_MODES[code as TrackedModeCode])

  if (leakingModes.length === 0) {
    return
  }

  throw new Error(
    [
      `Terminal control sequence leak detected: ${leakingModes.join(", ")}`,
      `Recent mode transitions: ${modeTransitions.slice(-20).join(" | ") || "(none)"}`,
    ].join("\n"),
  )
})
