# Seed Cloud Mode

This document summarizes the current cloud-mode implementation in `src/cloud`. It reflects the code and tests in this repository today. `doc/cloud-sync-spec.md` is an older v1 spec and no longer matches every implementation detail.

## Description

Cloud mode runs Seed against a Git-backed workspace stored under `~/.seed/<owner>/<repo>`, with GitHub as the remote provider.

The CLI entrypoint is:

```text
seed cloud [<owner>/<repo>]
```

Behavior:

- `seed cloud <owner>/<repo>` starts cloud mode for that repository and records it as the last cloud repo.
- `seed cloud` reuses the last recorded cloud repo from `~/.seed/last-cloud-repo.json`.
- The local working copy lives at `~/.seed/<owner>/<repo>`.
- The remote repository is expected on GitHub and is created as a private repo if it does not already exist.
- When Seed starts in cloud mode, the local repo is synced to `origin/main`.
- When Seed exits normally, local changes are committed and pushed back to `origin/main`.

Cloud mode writes per-repo sync metadata to `~/.seed/<owner>/<repo>/.seed-cloud.json`.

## Workflows

### 1. CLI selection

The CLI accepts either an explicit repo slug or no slug at all.

- Repo slugs must match `<owner>/<repo>`.
- If the slug is omitted, Seed loads the last repo from `~/.seed/last-cloud-repo.json`.
- If no previous repo exists, the CLI exits with an actionable usage error.

### 2. Authentication

Cloud mode authenticates with GitHub before repository bootstrap unless it can complete a local fast path with a cached token.

Current auth flow:

1. Try to read a cached token for the repo owner or shared GitHub keys.
2. If a cached token exists and the local repo is already present and healthy, try startup sync immediately without validating through the GitHub API first.
3. If that fast path fails because auth is bad, validate again through the full auth flow.
4. During full auth, try cached tokens in order, validate them with `GET /user`, and clear rejected tokens.
5. If no valid cached token exists, start GitHub device flow and ask the user to authorize the app.
6. Persist the confirmed token back to the credential store under shared and owner-specific keys.

Credential storage behavior differs from the older spec:

- macOS uses the `security` tool when available.
- Linux and Windows use Git credential helpers when available.
- If the primary store is unavailable or a primary write fails, the runtime can fall back to a local cache file at `~/.seed/.cloud-credentials.json`.
- Git operations do not rely on interactive prompts. The command runner injects an authenticated GitHub HTTP header and sets `GIT_TERMINAL_PROMPT=0`.

### 3. Repository bootstrap

Once a token is ready, Seed ensures that both the remote repo and local clone are usable.

Bootstrap flow:

1. Check whether the GitHub repository exists.
2. If it does not exist, create it as a private repo.
3. Resolve the local path as `~/.seed/<owner>/<repo>`.
4. If the local repo does not exist, clone it.
5. If it already exists, verify that `origin` still points to the requested GitHub repo.
6. Ensure the local branch is `main`, checking out or creating it if necessary.
7. Ensure `origin/main` exists.

If the remote does not yet have `main`, Seed initializes it:

- If the working tree is empty, create `README.md` with a Seed placeholder.
- Stage all files.
- Create the initial commit with message `Initialize seed cloud repository`.
- Push with upstream tracking to `origin/main`.

### 4. Startup sync

Before launching the editor, cloud mode synchronizes the local repo to the remote main branch:

1. `git fetch origin`
2. `git reset --hard origin/main`

If startup sync succeeds, metadata is written with status `startup_synced`.
If startup sync fails, metadata is written with status `startup_failed` and the launch fails.

### 5. Runtime and exit sync

After startup sync, Seed launches with its working directory set to the cloud repo path. Cloud mode wraps the runtime effect runner so it can intercept the normal app exit path.

Normal exit flow:

1. Destroy the renderer.
2. Check `git status --porcelain`.
3. If the worktree is clean, write metadata with status `no_changes`.
4. If there are changes, stage everything and create a commit whose message is the current UTC timestamp without milliseconds, for example `2026-02-26T18:05:12Z`.
5. Try `git push origin main`.

If the first push fails:

1. Prompt the user to retry or exit without save.
2. On retry:
   - `git fetch origin`
   - `git rebase origin/main`
   - `git push origin main`
3. If rebase reports a conflict, abort the rebase and prompt again.
4. On exit without save:
   - `git rebase --abort`
   - `git merge --abort`
   - `git reset --hard origin/main`
   - `git clean -fd`

Exit metadata records:

- `owner`
- `repo`
- `remote_url`
- `last_sync_at`
- `last_sync_status`
- `retry_count_last_exit`

Current `last_sync_status` values produced by the runtime are:

- `startup_synced`
- `startup_failed`
- `no_changes`
- `pushed`
- `discarded`

## Implementation

### Module map

- `src/cli.ts`
  Parses `seed cloud [<owner>/<repo>]`, stores the last cloud repo, and dispatches into cloud mode.
- `src/cloud/mode.ts`
  Orchestrates the full lifecycle: logger setup, credential store creation, auth, bootstrap, startup sync, app launch, and exit sync wiring.
- `src/cloud/auth.ts`
  Reuses cached tokens, validates them with GitHub, falls back to device flow, and persists canonical credential keys.
- `src/cloud/credentials.ts`
  Implements credential backends for macOS keychain, Git credential helpers, and the local fallback cache.
- `src/cloud/device-flow.ts`
  Implements GitHub OAuth device authorization polling and user prompts.
- `src/cloud/github.ts`
  Calls the GitHub REST API for authenticated user lookup and repo existence or creation.
- `src/cloud/bootstrap.ts`
  Validates or clones the local repo, checks remote identity, ensures `main`, and initializes empty remotes.
- `src/cloud/startup-sync.ts`
  Performs fetch plus hard reset before launch.
- `src/cloud/lifecycle.ts`
  Connects editor exit effects to cloud sync behavior and metadata persistence.
- `src/cloud/exit-commit.ts`
  Detects local changes and creates timestamped commits.
- `src/cloud/push-retry.ts`
  Handles push retry prompting, fetch or rebase retry logic, and discard-on-exit cleanup.
- `src/cloud/metadata.ts`
  Reads and writes `.seed-cloud.json`.
- `src/cloud/last-repo.ts`
  Persists the last successful cloud repo selection.
- `src/cloud/command.ts`
  Runs subprocesses, wraps command failures, redacts secrets, and injects GitHub auth headers into Git commands.

### Current implementation characteristics

- Cloud mode has a fast path for an already-cloned local repo with a cached token. In that case it can skip GitHub API validation and remote bootstrap entirely if startup sync succeeds.
- Repository creation uses the authenticated user login to decide whether to call `/user/repos` or `/orgs/<owner>/repos`.
- Git authentication for fetch, clone, push, and related commands is done per command through Git config environment injection instead of modifying the stored remote URL.
- The implementation keeps cloud-specific state small and explicit: last repo selection in `last-cloud-repo.json`, per-repo sync metadata in `.seed-cloud.json`, and credentials in platform storage or the local fallback cache.
- The behavior is covered by focused tests for CLI parsing, auth, credential backend selection, bootstrap, startup sync, exit commits, push retry, device flow, and fast-path mode startup.
