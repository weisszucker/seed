# Current Harness

## Architecture

The terminal E2E harness is split into three layers:

- app instrumentation in `src/e2e/hooks.ts`, `src/app/runtime.ts`, `src/app/start.tsx`, and `src/ui/App.tsx`
- shared Bun-side harness utilities in `tests/e2e/harness/`
- behavior coverage in `tests/e2e/*.test.ts`

The key abstraction is `TerminalSession` from `tests/e2e/harness/types.ts`. The current implementations are:

- `DirectPtySession`: direct PTY transport for `vt100` and `xterm-256color`
- `TmuxSession`: real tmux server plus client PTY for `tmux-256color`

The direct PTY and tmux transports both use the same screen model, hook wait model, and failure-diagnostics pattern.

Both transports also restore the parent test terminal during teardown. This is separate from Seed's in-PTY shutdown cleanup and prevents mouse-mode leakage back to the developer shell after E2E runs.

The Bun test runtime preloads a suite-level terminal leak guard that watches parent stdout/stderr for mouse-mode and alternate-screen toggles and fails the suite if any tracked mode remains enabled at shutdown.

The PTY itself is currently owned by `tests/e2e/harness/pty_helper.py`. Bun owns fixture setup, assertions, waits, and transcript parsing.

## Synchronization

The harness does not rely on timing-based sleeps for normal test flow.

The runtime emits JSONL hook events through `src/e2e/hooks.ts`. Important events:

- `app_started`
- `state_published`
- `initial_render_complete`
- `runtime_idle`
- `focus_changed`
- `modal_changed`
- `document_changed`
- `effect_started`
- `effect_finished`
- `app_exit`

Use the hooks this way:

- wait for `initial_render_complete` after session startup
- use visible-screen polling for user-facing assertions
- use `runtime_idle` after an action chain when the test cares about the settled outcome
- use `focus_changed` and `modal_changed` as synchronization and diagnostic signals, not as the only proof of user-visible behavior

The sequence contract matters:

- `seq` advances on published runtime state transitions
- non-publish lifecycle events carry the latest settled sequence instead of inventing their own ordering
- `runtime_idle` reports the latest published `seq` that is now fully settled

Typical settled wait pattern:

```ts
const afterSeq = session.getLatestHookSeq()
await session.write(press("ctrl+l"))
await session.write(press("n"))
await session.waitForHook(
  (event) => event.type === "runtime_idle" && event.seq > afterSeq,
  10000,
)
```

This is important for prompt-driven and save-driven flows because one user action can expand into multiple reducer transitions and async effects.

## Assertion Model

Keep assertions user-facing by default.

Preferred checks:

- visible text via `findText(...)`
- modal presence or disappearance via visible text plus hook-assisted waits
- opened file content
- filesystem side effects in the temp workspace fixture

Avoid turning tests into reducer-level event assertions unless the user-facing surface is genuinely invisible.

Focus is not treated as a pure text-state concern. Current tests prove focus by behavior:

- sidebar focus routes navigation keys without editing the document
- editor focus allows typing and dirty-state changes
- modal-open state blocks both editor input and sidebar actions

## Mouse Model

Mouse support is cell-based.

- `clickCell(x, y)` is the transport primitive
- `clickText(screen, text)` is a convenience wrapper that must resolve one visible text match to one target cell
- prefer `clickCell(...)` when the target region is already known or repeated labels make text lookup ambiguous

Mouse tests run on:

- direct PTY with `xterm-256color`
- real tmux with `tmux-256color`

Mouse is not a target for `vt100`.

## tmux Rules

`tmux-256color` coverage must run inside a real tmux session.

Do not treat `TERM=tmux-256color` in a plain PTY as equivalent coverage.

The current tmux contract is:

- the outer PTY that hosts the tmux client uses a host terminal such as `xterm-256color`
- tmux config sets `default-terminal` to `tmux-256color`
- Seed inside the pane therefore observes `TERM=tmux-256color`
- diagnostics should preserve both values because outer and inner terminal state matter

Relevant implementation points live in `tests/e2e/harness/tmuxSession.ts`.

## Diagnostics

All E2E tests should use `withLatestSessionDiagnostics(...)` from `tests/e2e/harness/testFailure.ts`.

The session-layer diagnostics currently include:

- visible screen dump
- transcript tail
- recent hook events
- workspace tree
- tmux pane capture when relevant

This keeps failure output transport-aware without duplicating debug plumbing in each test.

## Coverage Map

Current E2E coverage is split this way:

- `tests/e2e/direct-pty-session.test.ts`: direct PTY smoke coverage and resize behavior
- `tests/e2e/app.keyboard.e2e.test.ts`: leader shortcuts, sidebar keyboard navigation, focus-sensitive input routing, prompt cancel
- `tests/e2e/app.prompts.e2e.test.ts`: gating prompt behavior, `Don't Save`, untitled `Save As`, and settled save-then-continue flows
- `tests/e2e/app.mouse.e2e.test.ts`: file clicks, directory toggle, editor click focus return, modal clicks
- clipboard assertions in mouse E2E should stay host-independent: prefer visible success state and hook-backed completion over assuming OSC 52 is the active clipboard transport
- `tests/e2e/app.tmux.e2e.test.ts`: tmux keyboard forwarding and tmux mouse forwarding
- `tests/e2e-hooks.test.ts`: hook sink and sequencing behavior
- `tests/start.test.ts`: startup integration around E2E sink wiring

## Commands

The packaged entrypoints are in `package.json`:

- `bun run test:e2e`: aggregate local run
- `bun run test:e2e:direct`: direct PTY slice plus hook and startup tests
- `bun run test:e2e:tmux`: tmux slice

Use the narrowest command that matches the changed area while iterating, then run the broader command before closing out harness changes.

## Change Guidance

When adding or changing terminal E2E coverage:

1. Start from the existing helper or test file closest to the behavior.
2. Reuse `createWorkspaceFixture(...)` and session wrappers instead of open-coding setup.
3. Wait for `initial_render_complete` at startup and `runtime_idle` after multi-step actions.
4. Assert visible behavior first, then add hook-backed checks only when they prove something not expressed on screen.
5. Update `terminal_harness_dev.md` when the harness design or coverage contract changes.
