# Seed Terminal E2E Harness Design

## Goal

Add an end-to-end test harness that launches the real Seed terminal app, drives it with terminal keyboard and mouse input, and asserts visible user-facing behavior.

The design should cover these terminal environments:

- `vt100`
- `xterm-256color`
- `tmux-256color`

## Short Answer

Yes, the `opencode` testing pattern can be applied to Seed, but the implementation layer must change.

`opencode` uses Playwright because it is a browser app. Seed is a terminal app built on `@opentui/core`, so the equivalent strategy is:

1. spawn Seed in a PTY
2. send terminal input bytes
3. parse terminal output into a stable screen model
4. add light test-only hooks for synchronization

## Current Fit With Seed

Seed already has the right application boundaries for this:

- Real app startup is in `src/app/start.tsx`.
- The app uses the real terminal renderer through `createCliRenderer(...)`.
- Keyboard handling is centralized in `src/ui/App.tsx` via `useKeyboard(...)`.
- Mouse handling already exists through component `onMouseDown` handlers.
- The app can already be launched without special production-only shell scripts through `src/index.tsx`.

The missing piece is a terminal interaction harness. The current test suite does not yet provide:

- PTY-based execution
- terminal input encoding helpers
- terminal output parsing
- a stable wait/synchronization layer
- true tmux-backed coverage

## Design Principles

- Run the real app, not a reducer-only approximation.
- Keep assertions user-facing by default: screen content, focus, modal visibility, navigation results.
- Use test hooks only for waiting and diagnostics, not as the main assertion mechanism.
- Keep terminal differences explicit instead of pretending all `TERM` values are equivalent.
- Treat `tmux-256color` as a real tmux environment, not just an environment variable.

## Non-Goals

- Pixel-perfect frame snapshots
- OS-level hardware automation
- replacing unit tests for reducer and keybinding logic
- full integration coverage for cloud mode in the first phase

## Important Terminal Reality

The three requested `TERM` values do not mean the same thing.

### `vt100`

- Keyboard-focused compatibility target
- No useful mouse support expectation
- No 256-color expectation
- Should verify Seed remains usable by keyboard and degrades safely

### `xterm-256color`

- Primary full-featured terminal target
- Keyboard and mouse tests should run here
- This should be the default direct PTY E2E environment

### `tmux-256color`

- Must be tested inside a real tmux session
- Setting `TERM=tmux-256color` in a plain PTY is not enough
- Mouse handling, alt-screen behavior, and escape-sequence forwarding are part of what tmux changes
- In tmux coverage, the outer terminal `TERM` and the inner pane `TERM` must be treated as separate values

## Proposed Test Layout

```text
tests/
  e2e/
    app.keyboard.e2e.test.ts
    app.mouse.e2e.test.ts
    app.prompts.e2e.test.ts
    app.sidebar.e2e.test.ts
    app.tmux.e2e.test.ts
    harness/
      terminalSession.ts
      directPtySession.ts
      tmuxSession.ts
      terminalBuffer.ts
      input.ts
      waits.ts
      fixtures.ts
      screenQueries.ts
      types.ts
```

## Harness Architecture

### 1. Session Layer

Define a common interface:

```ts
type TerminalSession = {
  start(): Promise<void>
  stop(): Promise<void>
  write(data: string): Promise<void>
  resize(cols: number, rows: number): Promise<void>
  waitForOutput(predicate: (screen: ScreenState) => boolean, timeoutMs?: number): Promise<void>
  waitForHook(predicate: (event: E2eHookEvent) => boolean, timeoutMs?: number): Promise<E2eHookEvent>
  getLatestHookSeq(): number
  getRecentHookEvents(limit?: number): E2eHookEvent[]
  getScreen(): ScreenState
  getTranscript(): string
}
```

Implementations:

- `DirectPtySession`
- `TmuxSession`

### 2. PTY Transport

Recommended implementation:

- Use a PTY library such as `node-pty`
- For the initial Bun-based harness, a small helper process that owns the PTY is also acceptable when native PTY bindings are not yet in place
- Run Seed through the real CLI entrypoint
- Default command:

```sh
bun run src/main.ts
```

Reason:

- plain `spawn(..., stdio: "pipe")` is not enough for terminal interaction
- many terminal UI behaviors only appear correctly under a PTY
- running `src/main.ts` keeps E2E coverage aligned with the actual `seed` command path while still being repo-local and script-free

Current phase-1 implementation note:

- the repo currently uses a small Python stdlib PTY helper process for `DirectPtySession`
- the Bun-side harness still owns fixtures, waits, parsing, and assertions
- this keeps the PTY transport isolated without introducing a native dependency yet

### 3. Screen Model

The harness should maintain a parsed terminal screen model, not only raw output text.

Recommended approach:

- feed PTY output into a VT parser / headless terminal buffer
- normalize escape sequences into:
  - visible lines
  - cursor position
  - screen dimensions
  - alt-screen state
  - active mouse mode flags when detectable

The screen model should expose helpers such as:

- `findText("Unsaved changes")`
- `findLine(/Start typing markdown/)`
- `textBetween(x1, y1, x2, y2)`
- `dumpVisibleText()`

This is more stable than snapshotting raw ANSI output.

Important limitation:

- visible text alone is not enough to infer every UI state
- in Seed today, focus is often expressed through color/background styling or the active textarea, not through distinct text labels
- if the parser tracks text only, focus assertions must be behavioral or hook-backed rather than purely text-based

### Focus Assertion Decision

This needs an explicit design choice before implementation hardens around one model.

Current Seed behavior:

- editor focus is represented by the active textarea
- sidebar focus is primarily represented through selection styling
- neither focus state currently produces a strong text-only marker on screen

That creates three viable approaches:

#### Option A: Text-Only Parsing Plus Behavioral Assertions

Use a text-oriented terminal buffer and treat focus as something proven by what the app does next.

Examples:

- after clicking the editor, typing changes the document
- after focusing the sidebar, arrow keys or `hjkl`/`wasd` move tree selection
- while a modal is open, editor typing and sidebar navigation are both blocked

Pros:

- keeps assertions strongly user-facing
- least parser complexity
- least terminal-specific brittleness

Cons:

- cannot directly answer "which pane is focused right now?" without an additional action
- some failures may be slower to diagnose because focus is inferred indirectly

#### Option B: Attribute-Aware VT Parsing

Use a richer terminal buffer that exposes style attributes, cursor position, and possibly active element information.

Pros:

- can support more direct focus assertions
- may improve diagnostics when a screen looks wrong

Cons:

- materially more complex
- more likely to be terminal- and tmux-sensitive
- can push the suite toward renderer-detail assertions instead of behavior assertions

#### Option C: Hook-Backed Focus Assertions

Emit focus transitions through E2E hooks and assert them directly.

Pros:

- deterministic
- simple to implement
- useful for synchronization and diagnostics

Cons:

- weaker as a user-facing assertion
- can pass even if rendering is wrong

Recommended decision process:

- start with Option A as the default assertion model
- allow hook-based focus events for synchronization and failure diagnostics
- only adopt Option B for primary assertions if the chosen VT buffer exposes attributes reliably across direct PTY and tmux

Tentative direction:

- editor focus should usually be tested by whether typing edits the document
- sidebar focus should usually be tested by whether navigation keys move the tree
- hooks should support waiting and debugging, not replace visible-behavior checks

### 4. Input Encoder

Provide reusable helpers that write terminal bytes, not reducer events.

Examples:

- `press("enter")`
- `press("escape")`
- `press("ctrl+l")`
- `type("hello")`
- `pressArrow("down")`
- `clickCell(x, y)`
- optional `clickText("Save")`

Keyboard encoding should cover at least:

- printable text
- `Enter`
- `Escape`
- `Tab`
- `Backspace`
- arrow keys
- `Ctrl+L`
- `Ctrl+Q`, `Ctrl+S`, and similar future bindings if introduced

Mouse encoding should use xterm SGR mouse sequences:

- press: `CSI < b ; x ; y M`
- release: `CSI < b ; x ; y m`

The harness should use 1-based terminal cell coordinates.

Mouse helper rules:

- `clickCell(x, y)` is the primary mouse primitive
- higher-level helpers such as `clickText("Save")` should resolve a visible text match to a target cell and then delegate to `clickCell(...)`
- `clickText(...)` should fail when the target text is missing, duplicated, clipped, or otherwise ambiguous on the current screen
- tests should prefer `clickCell(...)` when the target region is already known or when repeated labels would make text lookup unreliable

### 5. Wait Layer

The harness must support reliable waits so tests do not race the renderer.

Add helpers like:

- `waitForText("Unsaved changes")`
- `waitForTextGone("Leader:")`
- `waitForCursorAt(x, y)`
- `waitForHookEvent("initial_render_complete")`
- `waitForRuntimeIdle({ afterSeq })`
- `waitForModal("unsaved_changes")`

Wait model:

- use screen-content waits for transient visible states such as leader hints, modal appearance, or file contents becoming visible
- use startup readiness only for the initial bootstrap of the app
- use action-settled waits for commands that can trigger async effect chains such as save, save-then-continue, open-file, delete, or refresh flows
- the action-settled wait should be based on hook events, not timing heuristics
- hook waits establish that application state has reached a milestone; visible screen assertions should still poll the parsed terminal buffer after that milestone because terminal repaint can lag behind the hook emission

## Test-Only App Hooks

Like `opencode`, Seed should expose light instrumentation for synchronization.

Recommended mechanism:

- enable with `SEED_E2E=1`
- write structured events to a side channel, not the terminal surface
- side channel options:
  - JSONL file path via `SEED_E2E_EVENT_LOG=/tmp/...`
  - local IPC socket
  - in-memory callback injection only if a future in-process renderer harness exists

Recommended event types:

- `app_started`
- `state_published`
- `initial_render_complete`
- `runtime_idle`
- `config_loaded`
- `config_load_failed`
- `file_tree_loaded`
- `file_tree_load_failed`
- `focus_changed`
- `modal_changed`
- `document_changed`
- `effect_started`
- `effect_finished`
- `app_exit`

Recommended payload examples:

```json
{"type":"state_published","seq":12,"event":"FILE_TREE_LOADED"}
{"type":"modal_changed","seq":18,"modal":"unsaved_changes"}
{"type":"focus_changed","seq":25,"pane":"sidebar"}
{"type":"runtime_idle","seq":41}
```

Event sequencing rules:

- every emitted hook event should include a monotonic sequence number `seq`
- `seq` should advance only when a state transition is published to subscribers
- hook events that are not themselves state publishes should carry the latest known `seq` and should not increment it on their own
- `runtime_idle` should report the latest published `seq` that has fully settled
- the harness should record the latest observed `seq` before an action, then wait for `runtime_idle` with a greater `seq` when the test cares about the final settled result
- `effect_started` and `effect_finished` should include at least the effect type, and preferably a stable effect identifier for diagnostics

Rules:

- do not use hooks as the main behavioral assertion
- do use hooks to know when it is safe to assert screen state
- do not print hook data to stdout/stderr

## Direct PTY Mode

### Supported TERM values

- `vt100`
- `xterm-256color`

### Startup

Spawn:

```sh
env TERM=<term> bun run src/main.ts
```

Recommended fixed terminal size:

- `cols=120`
- `rows=40`

Rationale:

- large enough for sidebar and modals
- stable text layout across tests

### Direct PTY Use Cases

Use direct PTY sessions for:

- startup smoke
- leader key flow
- save / save-as modal flow
- keyboard sidebar navigation
- prompt gating behavior
- mouse open-file behavior in `xterm-256color`

## Tmux Mode

### Why It Needs Its Own Session Type

`tmux-256color` is a terminal-inside-terminal environment. The harness must test tmux forwarding behavior, not just terminfo selection.

### Required Shape

Run a real tmux server and attach a real tmux client inside a PTY.

Recommended tmux launch pattern:

```sh
tmux -L seed-e2e-<worker>-<suite> -f /dev/null new-session ...
```

or use an explicit socket path under the test temp directory:

```sh
tmux -S /tmp/seed-e2e-<worker>-<suite>.sock -f /dev/null new-session ...
```

Apply explicit tmux settings for tests:

- `set -g default-terminal "tmux-256color"`
- `set -g mouse on`
- `set -g status off`
- `set -g set-clipboard off`
- `set -g remain-on-exit on`

Recommended execution model:

1. spawn a PTY running a tmux client
2. create a fresh session/window for each test case or test file
3. run Seed inside the pane
4. write keyboard and mouse bytes to the tmux client PTY
5. let tmux translate them to the app pane

TERM contract for tmux tests:

- the outer PTY hosting the tmux client should use a real host-terminal value such as `xterm-256color`
- tmux should set `default-terminal` to `tmux-256color`
- Seed running inside the tmux pane should therefore observe `TERM=tmux-256color`
- do not set the outer PTY `TERM` to `tmux-256color` unless the test is explicitly covering a misconfigured/manual host environment
- failure diagnostics should record both the outer PTY `TERM` and the inner pane `TERM`

Isolation requirements:

- use a unique tmux socket per test process or per test file
- destroy the tmux server during teardown even on failure
- include the socket path/name in failure diagnostics for reproduction

This gives real tmux coverage for:

- key forwarding
- mouse forwarding
- alt-screen behavior
- repaint behavior through tmux

### What Not To Do

Do not consider this sufficient:

```sh
env TERM=tmux-256color bun run src/main.ts
```

That only changes the environment variable. It does not test tmux mediation.

## TERM Capability Matrix

| Capability | vt100 | xterm-256color | tmux-256color |
|---|---:|---:|---:|
| app boots in PTY | yes | yes | yes |
| keyboard shortcuts | yes | yes | yes |
| sidebar keyboard nav | yes | yes | yes |
| save / quit prompt flow | yes | yes | yes |
| mouse click flow | no | yes | yes |
| color-sensitive assertions | no | optional | optional |
| tmux forwarding coverage | no | no | yes |

## Test Categories

### A. Keyboard Core

Run on all three terminal targets:

- app starts and renders editor title
- `Ctrl+L` enters leader mode
- leader + `e` toggles sidebar
- leader + `l` moves focus to sidebar and back
- arrow and `hjkl`/`wasd` sidebar navigation works
- `Esc` cancels prompt
- `Enter` accepts selected prompt action

### B. Prompt Gating

Run on all three terminal targets:

- dirty document + new file opens unsaved changes prompt
- editor typing is blocked while prompt is visible
- `Don't Save` executes pending action
- `Save` executes save then pending action

### C. Mouse Flows

Run on `xterm-256color` and `tmux-256color` only:

- clicking editor returns focus to editor
- clicking a sidebar directory toggles expansion
- clicking a sidebar file opens it
- clicking modal actions triggers the expected choice

Mouse interaction rules:

- the harness should target clickable cells, not text nodes, as its canonical interaction model
- text-based mouse helpers are convenience wrappers for readable tests, not the fundamental transport abstraction
- when multiple matching labels exist or the clickable hit area is broader than the text, use explicit cell targeting

### D. Compatibility Smoke

Run on `vt100`:

- app does not crash at startup
- keyboard-only navigation remains functional
- tests make no assumption about mouse support

## How Assertions Should Work

Primary assertions:

- visible text on screen
- modal presence / absence
- selected file name visible
- status line message visible
- file contents visible after navigation
- focus-sensitive behavior such as whether typing edits the document or whether sidebar navigation keys move tree selection

Secondary assertions:

- test hook events for synchronization
- transcript inspection when a test fails

Avoid:

- exact ANSI sequence snapshots
- color token assertions as a default
- timing-based sleeps except inside polling helpers

## Fixture Model

Each test should get an isolated workspace:

- temp directory
- seeded files and folders
- optional `setting.json`
- deterministic file tree layout

Recommended fixture helper:

```ts
const workspace = await createWorkspaceFixture({
  files: {
    "note.md": "# note\n",
    "docs/todo.md": "- item\n",
  },
  config: {
    leaderKey: "ctrl+l",
  },
})
```

The fixture should also create an isolated config file and launch Seed with:

- `cwd=workspace.path`
- `SEED_CONFIG_PATH=<fixture config path>`
- optionally isolated `HOME` if other future features read from home-directory state

## Required Application Changes

Minimal changes are recommended before implementation:

### 1. Add test event sink support

Add a small E2E event publisher behind `SEED_E2E`.

### 2. Add deterministic readiness signal

Emit `initial_render_complete` only after:

- `APP_STARTED` has been dispatched
- the initial config request has reached a terminal event: `config_loaded` or `config_load_failed`
- the initial file-tree request has reached a terminal event: `file_tree_loaded` or `file_tree_load_failed`
- the resulting state has been published to subscribers after those terminal events

Rules:

- do not define readiness in terms of "time since last repaint" or other heuristic stability guesses
- do not block readiness on optional async work such as syntax highlighting
- if startup later gains more required effects, they must be listed explicitly in the readiness contract

### 3. Add deterministic action-settled signal

Startup readiness is not enough for multi-step flows.

Seed processes one input as a queue of published state transitions and async effects. A single user action such as "Save" from the unsaved-changes prompt can produce:

1. a state publish that closes the modal and records the pending action
2. an async save effect
3. a `FILE_SAVED` publish
4. the pending action executing
5. additional follow-up effects such as file loading or tree refresh

The harness therefore needs a settled signal for final outcomes, not just startup bootstrap.

Required contract:

- add a monotonic publish sequence number that advances whenever runtime state is published to subscribers
- emit `runtime_idle` when the runtime queue is empty and no effect is still in flight
- include the latest published `seq` on `runtime_idle`
- let tests record the latest `seq` before an action and wait for `runtime_idle` with a greater `seq` when asserting final outcomes

Illustrative shape:

```ts
const afterSeq = session.getLatestHookSeq()
await session.press("enter")
await waitForRuntimeIdle(session, { afterSeq })
```

Rules:

- do not use `runtime_idle` as the primary assertion; it is a synchronization primitive
- do not treat disappearance of a modal or appearance of an intermediate status message as proof that the entire action chain has settled
- keep startup readiness and action-settled semantics separate

### 4. Keep terminal output and diagnostics separate

Do not write test metadata into stdout.

### 5. Consider a test mode for external async noise

If future features add background sync, timers, or external prompts, allow them to be disabled or stubbed in E2E mode.

### 6. Validate PTY tooling before deep implementation

This is a decision gate, not just a task checklist.

The open architectural question is: which runtime should own the PTY transport layer?

Possible shapes:

#### Option A: Bun Tests Own PTY Directly

Use the Bun test runner and a PTY library such as `node-pty` directly from the test process.

Pros:

- simplest architecture
- no helper process or cross-process protocol
- all harness logic stays in one runtime

Cons:

- depends on Bun working cleanly with native PTY bindings
- failures may be harder to localize when Bun, PTY bindings, tmux, and the app are stacked together

#### Option B: Bun Tests With a Small PTY Helper

Keep the main test suite in Bun, but move PTY ownership into a small helper process that exposes a narrow transport API.

Pros:

- isolates native PTY risk in the runtime that most PTY libraries target first
- lets the Bun-side harness keep assertions, fixtures, and test organization
- gives a cleaner fallback path if tmux or teardown semantics are unstable under Bun

Cons:

- adds helper-process complexity
- requires a simple protocol between the Bun test harness and the helper transport

#### Option C: Full Node-Based E2E Runner

Move the terminal E2E suite to Node entirely.

Pros:

- most conservative choice for PTY compatibility

Cons:

- splits the test stack
- likely more change than Seed needs unless Bun proves to be a blocker

Required feasibility spike before deciding:

- verify the chosen PTY library works under Bun in both local runs and `bun test`
- verify resize, raw input, and process teardown semantics
- verify tmux is available in the intended CI environment
- verify a direct PTY session can launch `bun run src/main.ts`, accept input, repaint, and exit cleanly
- verify the same basic loop works through a real tmux session

Decision rule:

- if Bun plus direct PTY control works reliably for startup, input, resize, teardown, and tmux, choose Option A
- if those behaviors are flaky or binding support is weak, choose Option B quickly instead of forcing the harness deeper into Bun-specific PTY issues
- only choose Option C if both of the above become awkward enough that a split test stack is cheaper than maintaining a hybrid

## Failure Diagnostics

On test failure, capture:

- final visible screen dump
- last N lines of terminal transcript
- latest E2E hook events
- workspace file tree
- if tmux mode: `tmux capture-pane -p` output

This is important because terminal failures are otherwise expensive to reproduce.

## Scripts

Recommended package scripts:

```json
{
  "test:e2e": "bun test tests/e2e",
  "test:e2e:direct": "SEED_E2E_DIRECT=1 bun test tests/e2e",
  "test:e2e:tmux": "SEED_E2E_TMUX=1 bun test tests/e2e/app.tmux.e2e.test.ts"
}
```

If runtime splits become useful later:

- keep fast direct PTY tests in the default CI path
- keep tmux coverage as a separate job if needed

## Implementation Phases

### Phase 1

- complete the PTY feasibility spike and choose between direct Bun PTY ownership and a Node helper transport
- add `DirectPtySession`
- add screen parser and input helpers
- add `SEED_E2E` event sink
- implement keyboard E2E for `vt100` and `xterm-256color`

### Phase 2

- add mouse helpers
- implement xterm mouse tests
- improve failure dumps

### Phase 3

- add `TmuxSession`
- run a focused tmux compatibility suite
- validate keyboard and mouse forwarding through tmux

## Acceptance Criteria

The design is complete when the implementation can demonstrate all of the following:

1. Seed can be launched in a PTY and controlled with terminal input bytes.
2. The harness can assert visible behavior without reducer-level shortcuts.
3. `vt100` coverage verifies keyboard-only compatibility.
4. `xterm-256color` coverage verifies both keyboard and mouse flows.
5. `tmux-256color` coverage runs through a real tmux session.
6. The harness can wait for final settled outcomes of async action chains without timing-based sleeps.
7. Test failures produce enough diagnostics to debug without rerunning interactively.

## Todo List

### Phase 0: Feasibility Decision

- [x] Verify the chosen PTY helper works under Bun during normal execution.
- [x] Verify the chosen PTY helper works under `bun test`.
- [x] Verify PTY resize works and Seed repaints correctly.
- [x] Verify raw keyboard input reaches Seed correctly through the PTY.
- [x] Verify Seed exits cleanly and does not leave orphan processes behind.
- [x] Verify a real tmux session can be started in the intended local environment and document CI prerequisites.
- [x] Verify the basic launch-input-assert-exit loop works through tmux as well as direct PTY.
- [x] Decide whether PTY ownership stays in Bun or moves to a small helper.

### Phase 1: Test Infrastructure

- [x] Add `tests/e2e/` and `tests/e2e/harness/`.
- [x] Add the shared `TerminalSession` interface.
- [x] Implement `DirectPtySession`.
- [x] Add terminal transcript capture.
- [x] Add a parsed terminal buffer / screen model.
- [x] Add reusable screen query helpers such as `findText`, `findLine`, and `dumpVisibleText`.
- [x] Add keyboard input encoding helpers for printable text, `Enter`, `Escape`, `Tab`, `Backspace`, arrows, and leader-key flows.
- [x] Add generic polling / wait helpers with timeouts.
- [x] Add isolated workspace fixture helpers.
- [x] Add isolated config fixture helpers using `SEED_CONFIG_PATH`.
- [x] Ensure E2E tests launch through `bun run src/main.ts`.

### Phase 1: App Instrumentation

- [x] Add `SEED_E2E=1` support.
- [x] Add a side-channel event sink controlled by `SEED_E2E_EVENT_LOG` or equivalent.
- [x] Emit `app_started`.
- [x] Emit `state_published` with a monotonic `seq`.
- [x] Emit `config_loaded` and `config_load_failed`.
- [x] Emit `file_tree_loaded` and `file_tree_load_failed`.
- [x] Emit `focus_changed`.
- [x] Emit `modal_changed`.
- [x] Emit `document_changed`.
- [x] Emit `effect_started` and `effect_finished`.
- [x] Emit `app_exit`.
- [x] Emit `initial_render_complete` using the explicit readiness contract from this doc.
- [x] Emit `runtime_idle` using the explicit action-settled contract from this doc.
- [x] Keep all E2E hook data out of stdout and stderr.

### Phase 1: First Test Coverage

- [x] Add startup smoke coverage for direct PTY.
- [x] Add keyboard E2E coverage for `vt100`.
- [x] Add keyboard E2E coverage for `xterm-256color`.
- [x] Add tests for leader mode and sidebar toggle.
- [x] Add tests for sidebar keyboard navigation.
- [x] Add tests for prompt cancel and prompt confirm flows.
- [x] Add tests for focus-sensitive behavior using the chosen assertion model.

### Phase 2: Prompt And File Flow Coverage

- [x] Add tests for dirty new-file flow opening the unsaved-changes prompt.
- [x] Add tests proving editor input is blocked while a modal is visible.
- [x] Add tests for `Don't Save` executing the pending action.
- [x] Add tests for `Save` executing save then the pending action.
- [x] Add tests for save-as flow on untitled buffers.
- [x] Add tests for visible status-line feedback in key flows.

### Phase 2: Mouse Coverage

- [x] Add xterm SGR mouse encoding helpers.
- [x] Add `clickCell(x, y)` support.
- [x] Add higher-level helpers such as `clickText("Save")` as optional wrappers over `clickCell(x, y)`.
- [x] Add mouse tests for clicking editor to return focus.
- [x] Add mouse tests for clicking sidebar directories to toggle expansion.
- [x] Add mouse tests for clicking sidebar files to open them.
- [x] Add mouse tests for clicking modal actions.
- [x] Run mouse coverage only on `xterm-256color` until tmux transport is ready.

### Phase 3: Tmux Transport

- [x] Implement `TmuxSession`.
- [x] Use a unique tmux socket per test process or test file.
- [x] Apply explicit tmux test settings.
- [x] Ensure tmux teardown runs even after failures.
- [x] Capture tmux pane output in failure diagnostics.
- [x] Add focused keyboard tmux coverage.
- [x] Add focused mouse tmux coverage.

### Diagnostics And Hardening

- [x] Capture final visible screen dump on failure.
- [x] Capture the last N transcript lines on failure.
- [x] Capture recent E2E hook events on failure.
- [x] Capture the workspace file tree on failure.
- [x] Capture tmux pane output on tmux test failure.
- [x] Remove timing-based sleeps in favor of polling helpers.
- [x] Keep primary assertions user-facing and avoid raw ANSI snapshots.

### Packaging And CI

- [ ] Add `test:e2e` script.
- [ ] Add `test:e2e:direct` script.
- [ ] Add `test:e2e:tmux` script.
- [ ] Decide whether tmux coverage runs in default CI or a separate CI job.
- [ ] Document any CI prerequisites such as tmux availability.

## Recommendation

Build the harness around direct PTY control first, then add tmux as a second transport.

That matches Seed’s architecture, keeps the first step small, and preserves the main insight from the `opencode` model: use the real app, drive it like a user, and add only the minimum internal instrumentation needed to make the tests reliable.
