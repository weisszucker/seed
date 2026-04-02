# Seed

Seed is a terminal-based text editor.

On the left it has the editor, on the right it has a sidebar. On the bottom there is a status line.

It support mouse for basic operations, such as navigation, selection and interact with clickable elements.

Selecting visible text with the mouse should copy it to the local clipboard on supported platforms, falling back to terminal OSC 52 clipboard access when available.

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

The sidebar can take keyboard focus. When focused, the user can move selection between visible items, open files, and collapse or expand folders. While the sidebar is focused, the editor should not receive text input. `Esc` moves focus back to the editor, and clicking in the editor should also return focus to the editor.

When the sidebar is focused, arrow keys, `w`/`s`/`a`/`d`, and `h`/`j`/`k`/`l` should navigate the tree. `Enter` and `Space` should both toggle a folder or open the selected file.

When the sidebar is focused, `Backspace` and `Delete` should delete the selected file or folder after a confirmation prompt.

## Layout

The editor content width should be capped at around 100 characters.

The sidebar should keep the current width ratio relative to editor (about 34:66) when visible.

When the display is wider than the content cap, keep the content centered and expand horizontal margins on both sides.

The status line should align to the editor column (not the full terminal width), including when sidebar is visible.

## Shortcuts

Use a leader key before all application shortcuts.

The default leader key is `ctrl-l`.

`<leader> q` for quitting.
`<leader> s` / `ctrl-l shift+s` for saving / saving to.
`<leader> n` for opening a new untitled file.
`<leader> c` for creating a file or folder by path relative to the workspace root. A trailing platform path separator means folder creation.
`<leader> m` for moving a file or folder by source and destination path relative to the workspace root.
`<leader> e` for toggling the sidebar.
`<leader> l` for shifting focus between the editor and the sidebar.
`<leader> k` for showing shortcut help.

The leader key and command keys can be controlled by the config file `~/.seed/setting.json`.

For tests or isolated runs, set `SEED_CONFIG_PATH` to load config from a different file path.
