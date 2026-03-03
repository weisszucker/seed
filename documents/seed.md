# Seed

Seed is a terminal-based text editor.

On the left it has the editor, on the right it has a sidebar. On the bottom there is a status line.

It support mouse for basic operations, such as navigation, selection and interact with clickable elements.

Most operations should support keyboard, if it's not bound to the mouse.

## Editor

In the editor, it shows the name of the file, and its content.

It should support simple markdown syntax highlight.

## Sidebar

In the sidebar, it shows the file tree in the current folder, including folders and files, both are clickable.

When the user click on the folder, it expands and collapse.

When the user click on the file, it open the file. If there is unsaved change in current file, then a prompt should pop up, asking if the file should be saved.

The unsaved-change prompt should apply to all similar dirty-risk actions, such as opening another file, creating a new file, and quitting.

The prompt options are `Save` and `Don't Save`. Pressing `Esc` cancels the pending action.

Prompt is gating: pending actions do not execute until the prompt decision is made. While the prompt is visible, operations on the editor and sidebar are disabled.

The sidebar can be toggled on and off. When it's toggled off, the editor should be centered horizontally.

## Layout

The editor content width should be capped at around 100 characters.

The sidebar should keep the current width ratio relative to editor (about 34:66) when visible.

When the display is wider than the content cap, keep the content centered and expand horizontal margins on both sides.

The status line should align to the editor column (not the full terminal width), including when sidebar is visible.

## Shortcuts

ctrl-q for quitting.
ctrl-s/ctrl-shift-s for saving/saving to.
ctrl-n for opening a new untitled file.
ctrl-l for toggling the sidebar.

The shortcuts can be controlled by a config file "setting.json".

## Cloud Mode

Seed supports a cloud mode for syncing files with GitHub.

Run `seed cloud <owner>/<repo>` to open a cloud workspace.
If the GitHub repo does not exist, Seed creates it (private).
The local repo is stored at `~/.seed/<owner>/<repo>`.

On first use, Seed asks for GitHub authentication with repo create/read/write access, and credentials must be stored by OS credential helpers (not plaintext files).
Later runs reuse saved credentials unless authentication fails.

When cloud mode starts, Seed syncs local state to `origin/main` before opening the editor.
When Seed exits normally, it checks for changes, creates a commit (date/timestamp-based message), and pushes to `origin/main`.

If push fails, Seed should support retry.
On exit-without-save during retry flow, local unpushed changes are discarded and local state is reset to `origin/main`.
