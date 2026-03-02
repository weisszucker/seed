import type { CliRenderer } from "@opentui/core"

import { reduceEvent } from "../core/reducer"
import { createInitialState, type AppEvent, type EditorState } from "../core/types"
import { runEffect } from "../effects/runner"

type Listener = (state: EditorState) => void
export type RuntimeEffectRunner = typeof runEffect

export class SeedRuntime {
  private state: EditorState

  private listeners = new Set<Listener>()

  private queue: AppEvent[] = []

  private running = false

  constructor(
    cwd: string,
    private readonly renderer: CliRenderer,
    private readonly effectRunner: RuntimeEffectRunner = runEffect,
  ) {
    this.state = createInitialState(cwd)
  }

  getState(): EditorState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispatch(event: AppEvent): void {
    this.queue.push(event)
    void this.drain()
  }

  private publish(): void {
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }

  private async drain(): Promise<void> {
    if (this.running) {
      return
    }

    this.running = true
    while (this.queue.length > 0) {
      const nextEvent = this.queue.shift()
      if (!nextEvent) {
        break
      }

      const result = reduceEvent(this.state, nextEvent)
      this.state = result.state
      this.publish()

      for (const effect of result.effects) {
        const events = await this.effectRunner(effect, this.renderer)
        this.queue.push(...events)
      }
    }
    this.running = false
  }
}
