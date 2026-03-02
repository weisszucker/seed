# Cloud Sync Implementation Spec (v1)

## 1. CLI and Mode
- Command: `seed cloud <owner>/<repo>`
- Example: `seed cloud alice/notes`
- Validate `<owner>/<repo>` format.
- Local repo path: `~/.seed/<owner>/<repo>`.

## 2. Authentication
- First run:
  - Prompt GitHub authentication (PAT or device flow).
  - Require repo create/read/write permissions.
  - Store credentials in native OS secure storage through Git credential helpers:
    - macOS: `git-credential-osxkeychain`
    - Windows: `manager-core` (Git Credential Manager)
    - Linux: `libsecret` via `git-credential-libsecret` (or `manager-core` if installed)
  - Never store tokens in plaintext files under `~/.seed`.
  - If no secure credential backend is available, fail setup with an actionable error instructing the user to install Git Credential Manager (or OS helper) and retry.
- Later runs:
  - Reuse stored credentials.
  - Prompt again only if auth fails.

## 3. Repository Bootstrap
On `seed cloud <owner>/<repo>`:
1. Check whether `<owner>/<repo>` exists on GitHub.
2. If missing, create a private repo.
3. If local path is missing, clone into `~/.seed/<owner>/<repo>`.
4. If local path exists, verify its remote URL matches target repo.
5. Ensure tracking branch is `main`.
6. If remote is empty, create initial commit with seed baseline files.

## 4. Entering Cloud Mode (Start Sync)
At mode start:
1. `git fetch origin`
2. `git reset --hard origin/main`

Then launch Seed against that local repo directory.

## 5. Exit-Time Sync (Only)
On normal Seed exit:
1. Check changes with `git status --porcelain`.
2. If no changes, return.
3. If changed:
   - Commit message with timestamp of format '2026-02-26T18:05:12Z'
4. Push to `origin/main` with retry policy in Section 6.

## 6. Push Retry Policy
- prompt for retry or exit without save
  - in case of force quit, don't do anything.
- Before each retry:
  - `git fetch origin`
  - `git rebase origin/main`
- If exit without save
1. Abort any in-progress rebase/merge.
2. `git reset --hard origin/main`
3. `git clean -fd`

## 7. Conflict Handling (v1)
- If rebase conflicts:
  - Abort rebase.
  - Prompt for retry

## 8. Data and Metadata
- Root folder: `~/.seed`
- Repo path: `~/.seed/<owner>/<repo>`
- Metadata file: `~/.seed/<owner>/<repo>/.seed-cloud.json`

Suggested metadata fields:
- `owner`
- `repo`
- `remote_url`
- `last_sync_at`
- `last_sync_status`
- `retry_count_last_exit`

## 9. User Messages and Logs
User-facing messages:
- `Cloud mode ready`
- `Exit sync: no changes`
- `Exit sync: committed`
- `Exit sync: push retry X/5`
- `Exit sync failed; local changes discarded`

Also write structured internal logs for diagnostics.

## 10. Acceptance Criteria
1. `seed cloud <owner>/<repo>` creates missing repo and starts successfully.
2. First auth is prompted once; later runs do not prompt unless auth breaks.
3. Start sync always matches `origin/main`.
4. Exit with edits creates new commit and pushes.
5. Allow retry for push failures
6. If exit without save, local unpushed changes are discarded and local state matches `origin/main`.
7. Repo remains persisted at `~/.seed/<owner>/<repo>` across runs.
