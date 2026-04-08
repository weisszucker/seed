CLI Editor Design & Development Guidelines

0. Purpose

This document defines the non-negotiable principles for designing and evolving the CLI editor.
The goal is high maintainability, high testability, and consistent user experience.

When making any coding or design decision, prefer the option that best satisfies these principles, even if it appears slower or more verbose in the short term.

1. Core Architectural Principles

1.1 Separation of Concerns Is Mandatory

The system must be conceptually divided into:

Core logic (editor behavior and state transitions)

Side effects (filesystem, clipboard, timers, AI calls, etc.)

UI rendering and input handling

Rules:

Core logic must not depend on UI, terminal APIs, filesystem, or network.

UI must not implement editor semantics.

Side effects must not contain business rules.

Changing one layer should not require changes in the others.

1.2 The Editor Is a Deterministic State Machine

The editor must be defined as:

A state

A set of events/commands

A deterministic transition from (state, event) → new state (+ optional effects)

Rules:

The same sequence of events must always produce the same state.

All editor behavior must be explainable as state transitions.

Non-determinism (timing, AI, IO) must be isolated outside the core.

2. Document Model Principles
2.1 The Document Model Is the Source of Truth

The editor must have an explicit document model that represents:

Text content

Cursor(s) and selection(s)

Undo/redo history

Derived metadata (dirty state, markers, etc.)

Rules:

UI renders the document model; it never reconstructs meaning from text output.

Editing behavior must be defined entirely in terms of document state transitions.

The document model must not know about terminal layout, colors, or input devices.

2.2 Editing Semantics Are Centralized

Rules:

All editing operations (insert, delete, replace, undo, redo) must be implemented once.

UI input, scripts, and future automation must reuse the same operations.

No ad-hoc text mutation is allowed outside the document model.

3. Testability Principles
3.1 Most Behavior Must Be Testable Without UI

Rules:

Core logic must be testable using pure inputs and outputs.

Tests must not require a terminal, PTY, or rendering engine.

Core tests should run fast and deterministically.

3.2 Behavioral Invariants Are More Important Than Screenshots

Prefer testing:

Text content

Cursor/selection positions

Undo/redo correctness

Error and edge-case handling

Over:

Pixel-perfect or frame-based UI assertions

3.3 Tests Are a First-Class Requirement

Rules:

Every new feature must introduce or update tests that guard its behavior.

Fixing a bug requires adding a test that would have caught it.

The absence of tests is a design failure, not a time-saving measure.

3.4 Be Careful Adding e2e Tests

Do not arbitrarily add e2e tests. If a new feature merely replicates the process of existing components, rather than introducing new ones, and its process logic is already covered by other e2e tests, then e2e tests may be omitted.

4. UI & UX Consistency Principles
4.1 UI Is a Projection of State

Rules:

UI components must render from editor state only.

UI must not “decide” what happened; it only displays what the core reports.

Identical states must produce identical UI output.

4.2 User Feedback Must Be Centralized

Rules:

Errors, warnings, confirmations, and progress must follow a unified model.

Similar scenarios must produce similar messages and visual treatment.

No ad-hoc logging or messaging from random code paths.

4.3 A Design System Exists Even in a CLI

Rules:

Colors, spacing, emphasis, and visual hierarchy must be centrally defined.

UI components must use semantic tokens, not raw literals.

Visual consistency is enforced by constraint, not convention.

4.4 Unsaved-Change Prompt Is Global and Gating

Rules:

Dirty-risk actions (open file, new file, quit, and similar actions) must use one consistent unsaved-change prompt flow.

The prompt flow must be represented in core state, including an explicit pending action.

Pending actions must not execute until the prompt is resolved.

When the prompt is visible, editor and sidebar operations must be disabled; only prompt-related events are processed.

Prompt outcomes must be deterministic and explicit (save, don't save, cancel).

4.5 UI should be self-explanatory

The UI should be designed in the way so that the user is able to know how to interact with the system. Restrain from using explanatory text, but using UI elements, such as highlighting, arrow, size, font-weight, position and so on to guide the user. 

Refrain from using border.

5. Side Effects & External Interaction
5.1 Effects Are Explicit and Isolated

Rules:

Core logic may request effects, but never perform them.

All filesystem, clipboard, environment, and AI interactions must be isolated.

Effects must report results back as events, not mutate state directly.

5.2 External Services Must Be Replaceable

Rules:

AI calls and external integrations must be mockable or stubbed.

Core behavior must be testable without network access.

Failure modes must be handled explicitly and consistently.

5.3 Diagnostic Logging Must Be Structured and Useful

The system includes a diagnostic logging layer for runtime investigation. Diagnostic logs are stored under `~/.seed/log` as structured JSONL files and are meant for debugging, failure analysis, and runtime tracing. These logs are distinct from user-facing messages shown in the CLI.

Rules:

Diagnostic logs must go through the centralized logging interface, not ad-hoc file writes.

Logs must capture enough context to reconstruct what happened, including component, operation, and relevant runtime state.

Potential failure paths must emit diagnostic logs that are sufficient to locate the cause of the error.

Sensitive data such as tokens, passwords, secrets, and authorization headers must never be written to logs.

User-facing output and diagnostic logging must be treated as separate concerns.

6. Evolution & Maintainability
6.1 Optimize for Change, Not Speed

Rules:

Prefer clarity over cleverness.

Prefer explicit state over implicit behavior.

Prefer constraints over flexibility.

6.2 Architectural Drift Is a Bug

Rules:

New features must conform to existing abstractions.

If a feature “does not fit,” the abstraction must be fixed, not bypassed.

Temporary shortcuts must not become permanent dependencies.

7. AI-Assisted Development Rules
7.1 The AI Agent Must Respect Architectural Boundaries

Rules:

The AI must not mix UI, logic, and effects.

The AI must not introduce new concepts that bypass the document model.

The AI must not add UI behavior without a corresponding state representation.

7.2 Code Generation Must Be Justifiable

For every generated change, the agent must be able to answer:

What state does this affect?

What invariant does this preserve?

How is this behavior tested?

If these cannot be answered, the change is invalid.

8. Definition of “Correctness”

The editor is considered correct if:

Core behavior is deterministic and test-covered.

UI reflects state accurately and consistently.

Similar user actions produce similar feedback.

Features can be modified or removed without widespread breakage.

Final Rule

When in doubt, move logic toward the core, isolate effects, and make state explicit.

This rule overrides all others.
