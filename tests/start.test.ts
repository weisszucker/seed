import { EventEmitter } from "node:events"
import { describe, expect, test } from "bun:test"
import { CliRenderEvents } from "@opentui/core"

import { createSeedShutdownController } from "../src/app/start"
import { TERMINAL_RESTORE_SEQUENCE } from "../src/app/terminal"

class FakeRenderer extends EventEmitter {
  isDestroyed = false
  destroyCalls = 0

  destroy(): void {
    if (this.isDestroyed) {
      return
    }

    this.isDestroyed = true
    this.destroyCalls += 1
    this.emit(CliRenderEvents.DESTROY)
  }
}

class FakeProcess extends EventEmitter {
  exitCode: number | undefined
  exitCalls: number[] = []
  stdoutWrites: string[] = []
  rawModeValues: boolean[] = []

  stdout = {
    isTTY: true,
    write: (chunk: string) => {
      this.stdoutWrites.push(chunk)
      return true
    },
  }

  stdin = {
    isTTY: true,
    setRawMode: (value: boolean) => {
      this.rawModeValues.push(value)
    },
  }

  exit(code?: number): never {
    this.exitCalls.push(code ?? 0)
    throw new Error(`process.exit:${code ?? 0}`)
  }
}

describe("createSeedShutdownController", () => {
  test("cleans up terminal state and exits on SIGTERM", () => {
    const renderer = new FakeRenderer()
    const processRef = new FakeProcess()
    const root = {
      unmountCalls: 0,
      render() {},
      unmount() {
        this.unmountCalls += 1
      },
    }

    createSeedShutdownController({
      renderer: renderer as never,
      getRoot: () => root,
      processRef: processRef as never,
    })

    expect(() => processRef.emit("SIGTERM")).toThrow("process.exit:143")
    expect(root.unmountCalls).toBe(1)
    expect(renderer.destroyCalls).toBe(1)
    expect(processRef.exitCode).toBe(143)
    expect(processRef.exitCalls).toEqual([143])
    expect(processRef.rawModeValues).toEqual([false])
    expect(processRef.stdoutWrites).toEqual([TERMINAL_RESTORE_SEQUENCE])
  })

  test("cleanup is idempotent across repeated calls and exit events", () => {
    const renderer = new FakeRenderer()
    const processRef = new FakeProcess()
    const root = {
      unmountCalls: 0,
      render() {},
      unmount() {
        this.unmountCalls += 1
      },
    }

    const controller = createSeedShutdownController({
      renderer: renderer as never,
      getRoot: () => root,
      processRef: processRef as never,
    })

    controller.cleanup()
    processRef.emit("exit")
    controller.cleanup()

    expect(root.unmountCalls).toBe(1)
    expect(renderer.destroyCalls).toBe(1)
    expect(processRef.exitCalls).toEqual([])
    expect(processRef.rawModeValues).toEqual([false])
    expect(processRef.stdoutWrites).toHaveLength(1)
  })

  test("disposes signal handlers after renderer destruction", () => {
    const renderer = new FakeRenderer()
    const processRef = new FakeProcess()

    createSeedShutdownController({
      renderer: renderer as never,
      getRoot: () => null,
      processRef: processRef as never,
    })

    renderer.destroy()
    processRef.emit("SIGTERM")

    expect(renderer.destroyCalls).toBe(1)
    expect(processRef.exitCalls).toEqual([])
    expect(processRef.stdoutWrites).toEqual([])
  })
})
