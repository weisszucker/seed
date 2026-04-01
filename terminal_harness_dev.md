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
- Run Seed through the real app entrypoint
- Default command:

```sh
bun run src/index.tsx
```

Reason:

- plain `spawn(..., stdio: "pipe")` is not enough for terminal interaction
- many terminal UI behaviors only appear correctly under a PTY

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

### 4. Input Encoder

Provide reusable helpers that write terminal bytes, not reducer events.

Examples:

- `press("enter")`
- `press("escape")`
- `press("ctrl+l")`
- `type("hello")`
- `pressArrow("down")`
- `clickCell(x, y)`
- `clickText("Save")`

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

### 5. Wait Layer

The harness must support reliable waits so tests do not race the renderer.

Add helpers like:

- `waitForText("Unsaved changes")`
- `waitForTextGone("Leader:")`
- `waitForCursorAt(x, y)`
- `waitForHookEvent("ready")`
- `waitForModal("unsaved_changes")`

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
- `initial_render_complete`
- `file_tree_loaded`
- `focus_changed`
- `modal_changed`
- `document_changed`
- `effect_started`
- `effect_finished`
- `app_exit`

Recommended payload examples:

```json
{"type":"modal_changed","modal":"unsaved_changes"}
{"type":"focus_changed","pane":"sidebar"}
{"type":"file_tree_loaded","node_count":5}
```

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
env TERM=<term> bun run src/index.tsx
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
tmux -L seed-e2e -f /dev/null new-session ...
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

This gives real tmux coverage for:

- key forwarding
- mouse forwarding
- alt-screen behavior
- repaint behavior through tmux

### What Not To Do

Do not consider this sufficient:

```sh
env TERM=tmux-256color bun run src/index.tsx
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
  settings: {
    leaderKey: "ctrl+l",
  },
})
```

The session then launches Seed with `cwd=workspace.path`.

## Required Application Changes

Minimal changes are recommended before implementation:

### 1. Add test event sink support

Add a small E2E event publisher behind `SEED_E2E`.

### 2. Add deterministic readiness signal

Emit `initial_render_complete` only after:

- runtime startup finished
- initial file tree load completed or failed explicitly
- first stable render occurred

### 3. Keep terminal output and diagnostics separate

Do not write test metadata into stdout.

### 4. Consider a test mode for external async noise

If future features add background sync, timers, or external prompts, allow them to be disabled or stubbed in E2E mode.

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
6. Test failures produce enough diagnostics to debug without rerunning interactively.

## Recommendation

Build the harness around direct PTY control first, then add tmux as a second transport.

That matches Seed’s architecture, keeps the first step small, and preserves the main insight from the `opencode` model: use the real app, drive it like a user, and add only the minimum internal instrumentation needed to make the tests reliable.
