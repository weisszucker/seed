---
name: seed-terminal-e2e
description: Understand and work on Seed's terminal E2E harness and coverage. Use when tasks involve PTY or tmux sessions, terminal input helpers, screen parsing, E2E hook synchronization, failure diagnostics, or adding or updating terminal end-to-end tests.
---

# Seed Terminal E2E

## Overview

Use this skill to build context for Seed terminal E2E work without rediscovering the harness shape from scratch.

Treat `terminal_harness_dev.md` as the design and refactor history, then read only the implementation and tests that match the task.

## Workflow

1. Read `terminal_harness_dev.md` first, especially the synchronization sections and `Refactor Summary`.
2. Identify the change area: runtime hooks, direct PTY transport, tmux transport, input or screen helpers, diagnostics, or test coverage.
3. Read the matching files under `src/e2e/`, `src/app/`, and `tests/e2e/harness/`.
4. Read the matching E2E tests before changing behavior.
5. When docs, code, and tests disagree, trust code and tests as current behavior, then update docs if implementation changes.

## Working Rules

- Keep assertions user-facing by default. Prefer visible text, modal visibility, navigation results, and file effects over hook-only assertions.
- Use E2E hooks for synchronization and diagnostics. `runtime_idle` is the settled-state primitive after action chains.
- Treat tmux as a real second transport. Do not simulate tmux by setting `TERM=tmux-256color` in a plain PTY.
- Treat `clickCell(x, y)` as the primary mouse primitive. Use `clickText(...)` only when the visible text resolves to one unambiguous target cell.
- Keep transport concerns in session classes and keep terminal parsing or wait helpers shared where possible.

## File Guide

- `terminal_harness_dev.md`: current design, implementation notes, checklist history, and refactor summary.
- `src/e2e/hooks.ts`: E2E hook schema and sink setup.
- `src/app/runtime.ts`: sequenced hook emission, startup readiness, and `runtime_idle`.
- `src/app/start.tsx`: runtime startup wiring for E2E hooks.
- `src/ui/App.tsx`: renderer and app-exit hook wiring.
- `tests/e2e/harness/directPtySession.ts`: direct PTY transport and hook log ingestion.
- `tests/e2e/harness/tmuxSession.ts`: real tmux transport, tmux config, and pane capture.
- `tests/e2e/harness/terminalBuffer.ts`: parsed terminal screen model and text-cell lookup helpers.
- `tests/e2e/harness/input.ts`: keyboard input encoding helpers.
- `tests/e2e/harness/mouse.ts`: SGR mouse helpers, `clickCell(...)`, and `clickText(...)`.
- `tests/e2e/harness/diagnostics.ts`: failure diagnostic formatting and workspace snapshots.
- `tests/e2e/harness/testFailure.ts`: session-scoped failure wrapping.
- `tests/e2e/*.test.ts`: current transport and behavior coverage.

## References

- For the current architecture, synchronization contract, and coverage map, read `references/current-harness.md`.
