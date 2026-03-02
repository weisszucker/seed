# Cloud Sync v1 Engineering Task Breakdown

## Scope and Assumptions
- Source spec: `cloud-sync-spec.md`
- Included clarifications:
  - Unlimited manual retry for push failures.
  - User can choose `Retry` or `Exit without save`.
  - On force quit: do not commit and do not push.
  - On next launch, startup sync (`fetch` + `reset --hard origin/main`) cleans local state.

## Module Breakdown

## 1) CLI Entry Module
Responsibilities:
- Parse `seed cloud <owner>/<repo>`.
- Validate `<owner>/<repo>` format.
- Route command to cloud mode runner.

Tasks:
1. Add command parser branch for `cloud`.
2. Implement repo slug validation and error messages.
3. Add usage/help text.

Deliverables:
- Command wiring and validation tests.

## 2) Auth and Credential Module
Responsibilities:
- Handle first-time GitHub authentication.
- Persist/retrieve credentials from secure OS-backed stores.
- Re-prompt only on auth failure.

Tasks:
1. Implement auth flow adapter (PAT/device flow).
2. Implement credential helper detection:
   - macOS: `git-credential-osxkeychain`
   - Windows: `manager-core`
   - Linux: `git-credential-libsecret` or `manager-core`
3. Fail fast with actionable error when no secure backend is available.

Deliverables:
- `AuthService` + `CredentialStore` abstraction.

## 3) Repo Bootstrap Module
Responsibilities:
- Ensure target remote repo exists (create private repo if missing).
- Ensure local clone exists under `~/.seed/<owner>/<repo>`.
- Verify local remote URL matches target.

Tasks:
1. GitHub API check/create repo.
2. Clone or validate existing local repo.
3. Ensure `main` tracking configuration.
4. Handle empty remote initialization with baseline commit.

Deliverables:
- `RepoBootstrapper` with deterministic bootstrap sequence.

## 4) Cloud Session Startup Sync Module
Responsibilities:
- Clean local workspace to remote truth on every launch.

Tasks:
1. Execute startup steps in order:
   - `git fetch origin`
   - `git reset --hard origin/main`
2. Surface failures with clear action messages.

Deliverables:
- `StartupSync` routine called before Seed opens files.

## 5) Exit-Time Commit Module
Responsibilities:
- On normal exit, detect changes and commit with UTC timestamp.

Tasks:
1. Run `git status --porcelain`.
2. Skip commit when no changes.
3. Build commit message timestamp format: `YYYY-MM-DDTHH:mm:ssZ`.
4. Create commit before push.

Deliverables:
- `ExitCommitService`.

## 6) Push + Manual Retry Module
Responsibilities:
- Push committed changes.
- On failure, let user choose `Retry` or `Exit without save` (no retry limit).

Tasks:
1. Attempt `git push origin main`.
2. On failure:
   - prompt user action (`Retry` / `Exit without save`)
   - if retry: `git fetch origin` + `git rebase origin/main` then push again
3. If user chooses exit without save:
   - abort in-progress rebase/merge
   - `git reset --hard origin/main`
   - `git clean -fd`
4. If rebase conflicts:
   - abort rebase
   - re-prompt (`Retry` / `Exit without save`)

Deliverables:
- `PushRetryCoordinator` + prompt adapter.

## 7) Lifecycle/Shutdown Module
Responsibilities:
- Distinguish normal exit vs force quit.
- Ensure force quit performs no commit/push.

Tasks:
1. Hook normal shutdown path to exit sync pipeline.
2. Ensure forced termination path bypasses sync.
3. Verify next startup cleanup restores remote state.

Deliverables:
- Exit orchestration in app lifecycle manager.

## 8) Metadata and Logging Module
Responsibilities:
- Record sync outcomes for diagnostics.
- Keep lightweight metadata in `.seed-cloud.json`.

Tasks:
1. Write/read metadata file:
   - `owner`, `repo`, `remote_url`, `last_sync_at`, `last_sync_status`, `retry_count_last_exit`
2. Emit structured logs for start sync, commit, push, retry, discard.

Deliverables:
- `CloudMetadataStore` + logger events.

## Interface Contracts

## CLI
```text
seed cloud <owner>/<repo>
```

## Core Services (language-agnostic signatures)
```text
interface CloudModeRunner {
  run(owner: string, repo: string): Result
}

interface AuthService {
  ensureAuthenticated(owner: string): AuthSession
}

interface CredentialStore {
  isAvailable(): boolean
  get(key: string): Secret?
  set(key: string, value: Secret): void
  clear(key: string): void
}

interface RepoBootstrapper {
  ensureReady(owner: string, repo: string, localPath: string): RepoContext
}

interface StartupSync {
  run(repoPath: string): void
}

interface ExitCommitService {
  commitIfChanged(repoPath: string, nowUtc: Instant): CommitResult
}

enum RetryDecision { RETRY, EXIT_WITHOUT_SAVE }

interface RetryPrompt {
  askPushFailure(error: string): RetryDecision
}

interface PushRetryCoordinator {
  pushWithManualRetry(repoPath: string): PushResult
}

interface CloudMetadataStore {
  load(repoPath: string): CloudMetadata?
  save(repoPath: string, metadata: CloudMetadata): void
}
```

## User Prompt Contract
- Trigger: push failure or rebase conflict during retry.
- Options only:
  - `Retry`
  - `Exit without save`
- `Exit without save` is destructive and must show confirmation text.

## Test Plan

## Unit Tests
1. CLI parser accepts valid `owner/repo` and rejects invalid formats.
2. Credential backend resolver chooses correct helper by OS.
3. Auth service reuses stored credentials and re-prompts on auth errors.
4. Startup sync always runs `fetch` then `reset --hard`.
5. Exit commit service skips when no changes.
6. Exit commit service uses UTC timestamp message format.
7. Retry coordinator loops until decision is `EXIT_WITHOUT_SAVE`.
8. Conflict handler aborts rebase and returns to prompt.
9. Discard flow runs abort/reset/clean sequence in order.

## Integration Tests (with test Git remotes)
1. Missing remote repo gets created and cloned.
2. Existing local repo with wrong remote URL fails with actionable error.
3. Normal exit with edits commits and pushes successfully.
4. Push fails once, user retries, rebase succeeds, push succeeds.
5. Push keeps failing, user chooses exit without save, local matches `origin/main`.
6. Rebase conflict on retry prompts decision and supports both outcomes.
7. Force-quit simulation: no commit/push on quit; next launch cleanup resets to remote.

## End-to-End Tests
1. First-time user on each OS path (macOS/Windows/Linux helper available).
2. Linux with no secure credential helper installed shows setup failure message.
3. Multi-session workflow: edit -> force quit -> relaunch -> verify cleanup.
4. Repo persistence across runs at `~/.seed/<owner>/<repo>`.

## Task Sequencing
1. Implement modules 1-4 (command, auth, bootstrap, startup sync).
2. Implement modules 5-7 (exit commit, retry/discard, lifecycle handling).
3. Implement module 8 (metadata/logging).
4. Add tests in this order: unit -> integration -> e2e smoke.
5. Gate release on acceptance criteria from `cloud-sync-spec.md`.
