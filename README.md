# Markdown Editor

A terminal-based markdown editor built with OpenTUI and React. Features a dual-pane interface with a file tree sidebar and syntax-highlighted editor.

## Features

- **Dual-pane layout**: File tree sidebar + editor
- **Markdown syntax highlighting**: Powered by Tree-sitter
- **File operations**: Open, save, create new files
- **Mouse support**: Click to navigate, select text
- **Keyboard shortcuts**: Full keyboard navigation
- **Save prompts**: Never lose unsaved changes
- **Extensible sidebar**: Ready for future features

## Installation

```bash
# Clone or copy the project
cd /home/panzh/seed

# Install dependencies (requires Bun)
bun install

# Enable global `seed` command
bun run setup

# Or with npm
npm install
npm run setup
```

## Usage

```bash
# Run the editor in current directory
seed

# Or run directly from project root
bun run src/index.tsx

# Or with npm
npm start
```

## Global Settings

You can customize behavior (for example key bindings) with a global config file:

- Path: `~/.seed`
- Format: JSON

Example:

```json
{
  "keybindings": {
    "openFile": "ctrl+o",
    "saveFile": "ctrl+s",
    "saveAs": "ctrl+shift+s",
    "newFile": "ctrl+n",
    "quit": "ctrl+q",
    "refreshTree": "ctrl+r",
    "reloadTheme": "ctrl+t",
    "toggleFocus": "tab",
    "cancel": "escape",
    "quitConfirmYes": "y",
    "quitConfirmNo": "n"
  }
}
```

If `~/.seed` is missing, Seed uses built-in defaults.
If `~/.seed` contains invalid JSON, Seed falls back to defaults and shows a warning.
Key combinations accept both `ctrl+s` and `ctrl-s` styles.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open file (shows dialog) |
| `Ctrl+S` | Save current file |
| `Ctrl+Shift+S` | Save as |
| `Ctrl+N` | New file |
| `Ctrl+Q` | Quit editor |
| `Ctrl+R` | Refresh file tree |
| `Ctrl+T` | Reload theme tokens |
| `Tab` | Toggle focus (sidebar ↔ editor) |
| `Escape` | Focus editor |

## Mouse Support

- **Click files** in sidebar to open
- **Click folders** to expand/collapse
- **Click in editor** to position cursor
- **Drag to select** text
- **Scroll** with mouse wheel

## File Dialog

When opening a file (`Ctrl+O`), you can:
- **Type Path**: Enter a full file path directly
- **Browse**: Select from file tree

## Save Prompts

The editor will prompt you to save when:
- Opening a different file with unsaved changes
- Creating a new file with unsaved changes
- Quitting with unsaved changes

## Color Theme

The editor uses a dark color scheme:
- Background: `#1a1a2e` (dark blue-gray)
- Text: `#c5c8c6` (light gray)
- Line numbers: `#666` (gray)
- Modified indicator: `#cc6666` (red)
- Selected items: `#2a2a3e` (lighter blue-gray)

## Supported File Types

- Markdown (`.md`, `.markdown`)
- TypeScript (`.ts`, `.tsx`)
- JavaScript (`.js`, `.jsx`)
- JSON (`.json`)
- Python (`.py`)
- Rust (`.rs`)
- Go (`.go`)
- HTML (`.html`)
- CSS (`.css`)

## Architecture

```
seed/
├── src/
│   ├── components/
│   │   ├── App.tsx           # Main application layout
│   │   ├── Editor.tsx        # Text editor with syntax highlighting
│   │   ├── FileTree.tsx      # File tree sidebar
│   │   ├── StatusBar.tsx     # Bottom status bar
│   │   ├── FileDialog.tsx    # Open file dialog
│   │   ├── SavePrompt.tsx    # Save confirmation modal
│   │   └── SaveAsDialog.tsx  # Save-as modal
│   ├── hooks/
│   │   ├── useFileSystem.ts  # File I/O operations
│   │   └── useKeyboardShortcuts.ts  # Keyboard handling
│   ├── utils/
│   │   ├── fileTree.ts       # Directory traversal
│   │   └── clipboard.ts      # Clipboard operations
│   └── index.tsx             # Entry point
```

## Requirements

- [Bun](https://bun.sh/) (recommended) or Node.js 18+
- Terminal with mouse support (for best experience)

## License

MIT
