#!/usr/bin/env bash
# Safely register hookmark-mcp in the Claude Desktop config.
#
# - Timestamped backup before any write
# - Refuses to overwrite an existing "hookmark" entry unless --force
# - Preserves all other keys (mcpServers entries, preferences, etc.)
# - Atomic write via tmp + mv
#
# Usage:
#   scripts/install-claude-desktop.sh            # install
#   scripts/install-claude-desktop.sh --force    # overwrite existing entry
#   scripts/install-claude-desktop.sh --uninstall
#   scripts/install-claude-desktop.sh --print    # show the JSON fragment only

set -euo pipefail

SERVER_NAME="hookmark"
CONFIG_PATH="${CLAUDE_DESKTOP_CONFIG:-$HOME/Library/Application Support/Claude/claude_desktop_config.json}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_ENTRY="$REPO_ROOT/dist/index.js"

FORCE=0
UNINSTALL=0
PRINT_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --uninstall) UNINSTALL=1 ;;
    --print) PRINT_ONLY=1 ;;
    -h|--help)
      sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "error: node not found on PATH (install Node >= 22 first)" >&2
  exit 1
fi

if [[ $PRINT_ONLY -eq 1 ]]; then
  cat <<JSON
{
  "command": "$NODE_BIN",
  "args": ["$DIST_ENTRY"]
}
JSON
  exit 0
fi

if [[ $UNINSTALL -eq 0 && ! -f "$DIST_ENTRY" ]]; then
  echo "error: $DIST_ENTRY does not exist — run \`npm run build\` first" >&2
  exit 1
fi

# Ensure config dir exists (safe mkdir; no-op if already there)
mkdir -p "$(dirname "$CONFIG_PATH")"

# Seed an empty shell if the config doesn't exist yet.
if [[ ! -f "$CONFIG_PATH" ]]; then
  echo '{ "mcpServers": {} }' > "$CONFIG_PATH"
  echo "created new config at $CONFIG_PATH"
fi

# Backup
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${CONFIG_PATH}.backup-${STAMP}"
cp "$CONFIG_PATH" "$BACKUP"
echo "backup: $BACKUP"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# Use Python stdlib for JSON merge — guaranteed on macOS, no jq dependency.
CONFIG_PATH="$CONFIG_PATH" \
TMP="$TMP" \
SERVER_NAME="$SERVER_NAME" \
NODE_BIN="$NODE_BIN" \
DIST_ENTRY="$DIST_ENTRY" \
FORCE="$FORCE" \
UNINSTALL="$UNINSTALL" \
python3 <<'PY'
import json, os, sys

config_path = os.environ["CONFIG_PATH"]
tmp_path    = os.environ["TMP"]
name        = os.environ["SERVER_NAME"]
node_bin    = os.environ["NODE_BIN"]
entry       = os.environ["DIST_ENTRY"]
force       = os.environ["FORCE"] == "1"
uninstall   = os.environ["UNINSTALL"] == "1"

with open(config_path, "r") as f:
    cfg = json.load(f)

servers = cfg.setdefault("mcpServers", {})

if uninstall:
    if name in servers:
        servers.pop(name)
        print(f"removed mcpServers.{name}")
    else:
        print(f"no-op: mcpServers.{name} was not present")
        sys.exit(0)
else:
    if name in servers and not force:
        print(
            f"mcpServers.{name} already exists. Re-run with --force to overwrite.",
            file=sys.stderr,
        )
        sys.exit(3)
    servers[name] = {"command": node_bin, "args": [entry]}
    verb = "updated" if force and name in servers else "added"
    print(f"{verb} mcpServers.{name} -> {node_bin} {entry}")

with open(tmp_path, "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")
PY

# Atomic swap
mv "$TMP" "$CONFIG_PATH"
trap - EXIT
echo "wrote $CONFIG_PATH"
echo "restart Claude Desktop for changes to take effect."
