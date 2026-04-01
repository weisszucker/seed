import type { CliRenderer } from "@opentui/core"

import { reduceEvent } from "../core/reducer"
import { createInitialState, type AppEvent, type EditorState } from "../core/types"
import type { E2eHookEvent, E2eHookSink } from "../e2e/hooks"
import { runEffect } from "../effects/runner"

type Listener = (state: EditorState) => void
export type RuntimeEffectRunner = typeof runEffect

type StartupReadinessState = {
  appStartedReceived: boolean
  configReady: boolean
  fileTreeReady: boolean
  initialRenderCompleteEmitted: boolean
}

function countFileTreeNodes(nodes: EditorState["fileTree"]): number {
  let total = 0
  for (const node of nodes) {
    total += 1
    total += countFileTreeNodes(node.children)
  }
  return total
}

export class SeedRuntime {
  private state: EditorState

  private listeners = new Set<Listener>()

  private queue: AppEvent[] = []

  private running = false

  private publishSeq = 0

  private effectSeq = 0

  private appExitEmitted = false

  private readonly startupReadiness: StartupReadinessState = {
    appStartedReceived: false,
    configReady: false,
    fileTreeReady: false,
    initialRenderCompleteEmitted: false,
  }

  constructor(
    cwd: string,
    private readonly renderer: CliRenderer,
    private readonly effectRunner: RuntimeEffectRunner = runEffect,
    private readonly e2eHookSink: E2eHookSink | null = null,
  ) {
    this.state = createInitialState(cwd)
  }

  getState(): EditorState {
    return this.state
  }

  getLatestHookSeq(): number {
    return this.publishSeq
  }

  emitAppExit(): void {
    if (this.appExitEmitted) {
      return
    }

    this.appExitEmitted = true
    this.emitHook({ type: "app_exit", seq: this.publishSeq })
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispatch(event: AppEvent): void {
    this.queue.push(event)
    void this.drain()
  }

  private emitHook(event: E2eHookEvent): void {
    this.e2eHookSink?.emit(event)
  }

  private publish(sourceEvent: AppEvent, previousState: EditorState): void {
    for (const listener of this.listeners) {
      listener(this.state)
    }

    const seq = ++this.publishSeq

    this.emitHook({
      type: "state_published",
      seq,
      event: sourceEvent.type,
    })

    this.emitEventHook(sourceEvent, seq)
    this.emitDerivedStateHooks(previousState, this.state, seq)
    this.updateStartupReadiness(sourceEvent, seq)
  }

  private emitEventHook(event: AppEvent, seq: number): void {
    switch (event.type) {
      case "CONFIG_LOADED":
        this.emitHook({ type: "config_loaded", seq })
        return

      case "CONFIG_LOAD_FAILED":
        this.emitHook({ type: "config_load_failed", seq, message: event.message })
        return

      case "FILE_TREE_LOADED":
        this.emitHook({
          type: "file_tree_loaded",
          seq,
          nodeCount: countFileTreeNodes(event.nodes),
        })
        return

      case "FILE_TREE_LOAD_FAILED":
        this.emitHook({ type: "file_tree_load_failed", seq, message: event.message })
        return

      default:
        return
    }
  }

  private emitDerivedStateHooks(previousState: EditorState, nextState: EditorState, seq: number): void {
    if (previousState.focusedPane !== nextState.focusedPane) {
      this.emitHook({ type: "focus_changed", seq, pane: nextState.focusedPane })
    }

    if ((previousState.modal?.kind ?? null) !== (nextState.modal?.kind ?? null)) {
      this.emitHook({
        type: "modal_changed",
        seq,
        modal: nextState.modal?.kind ?? null,
      })
    }

    if (
      previousState.document.path !== nextState.document.path ||
      previousState.document.text !== nextState.document.text ||
      previousState.document.isDirty !== nextState.document.isDirty
    ) {
      this.emitHook({
        type: "document_changed",
        seq,
        path: nextState.document.path,
        isDirty: nextState.document.isDirty,
      })
    }
  }

  private updateStartupReadiness(event: AppEvent, seq: number): void {
    if (event.type === "APP_STARTED") {
      this.startupReadiness.appStartedReceived = true
    }

    if (event.type === "CONFIG_LOADED" || event.type === "CONFIG_LOAD_FAILED") {
      this.startupReadiness.configReady = true
    }

    if (event.type === "FILE_TREE_LOADED" || event.type === "FILE_TREE_LOAD_FAILED") {
      this.startupReadiness.fileTreeReady = true
    }

    if (
      !this.startupReadiness.initialRenderCompleteEmitted &&
      this.startupReadiness.appStartedReceived &&
      this.startupReadiness.configReady &&
      this.startupReadiness.fileTreeReady
    ) {
      this.startupReadiness.initialRenderCompleteEmitted = true
      this.emitHook({ type: "initial_render_complete", seq })
    }
  }

  private async drain(): Promise<void> {
    if (this.running) {
      return
    }

    this.running = true
    try {
      while (this.queue.length > 0) {
        const nextEvent = this.queue.shift()
        if (!nextEvent) {
          break
        }

        const previousState = this.state
        const result = reduceEvent(this.state, nextEvent)
        this.state = result.state

        if (result.state !== previousState) {
          this.publish(nextEvent, previousState)
        }

        if (nextEvent.type === "APP_STARTED") {
          this.startupReadiness.appStartedReceived = true
          this.emitHook({ type: "app_started", seq: this.publishSeq })
        }

        for (const effect of result.effects) {
          const effectId = ++this.effectSeq

          this.emitHook({
            type: "effect_started",
            seq: this.publishSeq,
            effectId,
            effectType: effect.type,
          })

          const events = await this.effectRunner(effect, this.renderer)

          this.emitHook({
            type: "effect_finished",
            seq: this.publishSeq,
            effectId,
            effectType: effect.type,
            queuedEventTypes: events.map((event) => event.type),
          })

          if (effect.type === "EXIT_APP") {
            this.emitAppExit()
          }

          this.queue.push(...events)
        }
      }
    } finally {
      this.running = false
    }

    this.emitHook({ type: "runtime_idle", seq: this.publishSeq })
  }
}
