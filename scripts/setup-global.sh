#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PM="${1:-bun}"
BIN_DIR="$ROOT_DIR/bin"
BIN_PATH="$BIN_DIR/seed"

if [[ "$PM" != "bun" && "$PM" != "npm" ]]; then
  echo "Unsupported package manager: $PM"
  echo "Usage: ./scripts/setup-global.sh [bun|npm]"
  exit 1
fi

if ! command -v "$PM" >/dev/null 2>&1; then
  echo "$PM is not installed or not on PATH."
  if [[ "$PM" == "bun" ]]; then
    echo "Install bun first: https://bun.sh"
  else
    echo "Install Node.js/npm first: https://nodejs.org"
  fi
  exit 1
fi

echo "Preparing local 'seed' executable..."
mkdir -p "$BIN_DIR"
cat >"$BIN_PATH" <<'EOF'
#!/usr/bin/env bun

import "../src/main.ts"
EOF
chmod +x "$BIN_PATH"

echo "Installing dependencies with $PM..."
if [[ "$PM" == "bun" ]]; then
  bun install
else
  npm install
fi

echo "Linking 'seed' globally with $PM..."
if [[ "$PM" == "bun" ]]; then
  bun link
else
  npm link
fi

echo
if command -v seed >/dev/null 2>&1; then
  echo "Done. You can now run: seed"
else
  echo "Link created, but 'seed' is not on PATH yet."
  if [[ "$PM" == "bun" ]]; then
    echo "Add Bun's bin directory to PATH: $(bun pm bin)"
  else
    echo "Add npm global bin to PATH: $(npm config get prefix)/bin"
  fi
fi
