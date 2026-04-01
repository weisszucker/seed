---
name: seed-cloud-mode
description: Understand and work on Seed cloud mode in this repository. Use when tasks involve `seed cloud`, GitHub authentication, device flow, credential storage, repository bootstrap, startup sync, exit sync, push retry or discard flows, cloud metadata, or cloud-mode docs and tests. Start by reading `doc/cloud.md` for the current overview, then inspect the matching implementation and tests.
---

# Seed Cloud Mode

## Overview

Use this skill to build context for Seed cloud-mode tasks without rediscovering the whole subsystem from scratch.

Treat `doc/cloud.md` as the current broad overview.

## Workflow

1. Read `doc/cloud.md` first to get the current lifecycle and module map.
2. Identify which area the task touches: CLI entry, auth, bootstrap, startup sync, runtime exit sync, retry handling, metadata, or docs.
3. Read only the matching implementation files under `src/cloud/` and `src/cli.ts`.
4. Read the matching tests under `tests/` before changing behavior.
5. When docs, code, and tests disagree, trust code and tests as the current behavior, then update docs if the task requires it.

## File Guide

- `doc/cloud.md`: current cloud-mode overview.
- `src/cli.ts`: `seed cloud [owner/repo]` parsing and last-repo fallback.
- `src/cloud/mode.ts`: top-level orchestration for auth, bootstrap, startup sync, app launch, and exit wiring.
- `src/cloud/auth.ts`: cached-token reuse, validation, and device-flow fallback.
- `src/cloud/credentials.ts`: secure-store selection and local fallback cache behavior.
- `src/cloud/device-flow.ts`: GitHub device authorization flow.
- `src/cloud/github.ts`: GitHub user lookup and repo existence or creation.
- `src/cloud/bootstrap.ts`: local clone validation, branch handling, and initial remote setup.
- `src/cloud/startup-sync.ts`: fetch plus hard reset before launch.
- `src/cloud/lifecycle.ts`: startup and exit sync integration with runtime effects.
- `src/cloud/exit-commit.ts`: exit-time commit creation.
- `src/cloud/push-retry.ts`: retry prompt, fetch or rebase retry, and discard cleanup.
- `src/cloud/metadata.ts`: `.seed-cloud.json` persistence.
- `src/cloud/last-repo.ts`: last-cloud-repo persistence.
- `src/cloud/command.ts`: subprocess execution, auth-header injection, and auth-failure detection.

## Working Rules

- Preserve the current separation between orchestration, GitHub or credential effects, and small focused services.
- Prefer targeted reads over broad codebase searches once `doc/cloud.md` identifies the relevant area.
- Keep cloud docs aligned with behavior when implementation changes.
