import { appendFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

import type { AppEffect, AppEvent, FocusedPane, ModalState } from "../core/types"

export const SEED_E2E_ENV = "SEED_E2E"
export const SEED_E2E_EVENT_LOG_ENV = "SEED_E2E_EVENT_LOG"

type E2eHookEventBase = {
  seq: number
}

export type E2eHookEvent =
  | (E2eHookEventBase & { type: "app_started" })
  | (E2eHookEventBase & { type: "state_published"; event: AppEvent["type"] })
  | (E2eHookEventBase & { type: "initial_render_complete" })
  | (E2eHookEventBase & { type: "runtime_idle" })
  | (E2eHookEventBase & { type: "config_loaded" })
  | (E2eHookEventBase & { type: "config_load_failed"; message: string })
  | (E2eHookEventBase & { type: "file_tree_loaded"; nodeCount: number })
  | (E2eHookEventBase & { type: "file_tree_load_failed"; message: string })
  | (E2eHookEventBase & { type: "focus_changed"; pane: FocusedPane })
  | (E2eHookEventBase & { type: "modal_changed"; modal: ModalState["kind"] | null })
  | (E2eHookEventBase & { type: "document_changed"; path: string | null; isDirty: boolean })
  | (E2eHookEventBase & { type: "effect_started"; effectId: number; effectType: AppEffect["type"] })
  | (E2eHookEventBase & {
      type: "effect_finished"
      effectId: number
      effectType: AppEffect["type"]
      queuedEventTypes: AppEvent["type"][]
    })
  | (E2eHookEventBase & { type: "app_exit" })

export type E2eHookSink = {
  emit(event: E2eHookEvent): void
  close?: () => void | Promise<void>
}

export function createMemoryE2eHookSink(events: E2eHookEvent[] = []): {
  events: E2eHookEvent[]
  sink: E2eHookSink
} {
  return {
    events,
    sink: {
      emit(event) {
        events.push(event)
      },
    },
  }
}

export function createJsonlE2eHookSink(path: string): E2eHookSink {
  mkdirSync(dirname(path), { recursive: true })

  return {
    emit(event) {
      appendFileSync(path, `${JSON.stringify(event)}\n`)
    },
  }
}

export function createE2eHookSinkFromEnv(env: NodeJS.ProcessEnv = process.env): E2eHookSink | null {
  if (env[SEED_E2E_ENV]?.trim() !== "1") {
    return null
  }

  const eventLogPath = env[SEED_E2E_EVENT_LOG_ENV]?.trim()
  if (!eventLogPath) {
    throw new Error(`${SEED_E2E_EVENT_LOG_ENV} is required when ${SEED_E2E_ENV}=1`)
  }

  return createJsonlE2eHookSink(eventLogPath)
}

