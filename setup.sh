#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_BIN="$HOME/.local/bin"
WRAPPER="$LOCAL_BIN/seed"
SETTINGS_FILE="$HOME/.seed"

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun is required but not found in PATH."
  exit 1
fi

chmod +x "$ROOT_DIR/bin/seed"

echo "Linking package with bun..."
bun link --cwd "$ROOT_DIR"

mkdir -p "$LOCAL_BIN"

cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
exec bun "$ROOT_DIR/bin/seed" "\$@"
EOF

chmod +x "$WRAPPER"

echo "Installed launcher: $WRAPPER"

if [[ ! -f "$SETTINGS_FILE" ]]; then
  cat > "$SETTINGS_FILE" <<EOF
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
EOF
  echo "Created default settings file: $SETTINGS_FILE"
fi

if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
  echo "Note: $LOCAL_BIN is not in PATH. Add this line to your shell profile:"
  echo "  export PATH=\"$LOCAL_BIN:\$PATH\""
fi

echo "Done. You can now run: seed"
