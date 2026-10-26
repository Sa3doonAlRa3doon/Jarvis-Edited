#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_USER="$(id -un)"
AGENT_USER="jarvis-agent"
AGENT_GROUP="jarvis-workspace"
AGENT_HOME="/var/lib/jarvis-agent"
WORKSPACE_DIR="/srv/jarvis-workspace"
SOURCE_DIR="${OPENJARVIS_SOURCE_DIR:-/opt/openjarvis}"
UV_ENV="/opt/openjarvis-uv"
AGENT_TOOLS_DIR="/opt/jarvis-agent-tools"
HOST_CONTROL=false
BROWSER_CONTROL=true

if [[ "${1:-}" == "--host-control" ]]; then
  HOST_CONTROL=true
  BROWSER_CONTROL=false
elif [[ "${1:-}" == "--read-only-browser" ]]; then
  BROWSER_CONTROL=false
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--host-control|--read-only-browser]" >&2
  exit 2
fi

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This installer is for Raspberry Pi OS or Ubuntu Linux." >&2
  exit 1
fi
if [[ "$(uname -m)" != "aarch64" && "$(uname -m)" != "arm64" ]]; then
  echo "Warning: expected a 64-bit Raspberry Pi, found $(uname -m)."
fi
for binary in git node npm python3 sudo; do
  command -v "$binary" >/dev/null 2>&1 || { echo "$binary is required." >&2; exit 1; }
done

if ! command -v chromium >/dev/null 2>&1 && ! command -v chromium-browser >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    echo "Installing Chromium for the private JARVIS browser profile"
    sudo apt-get update
    sudo apt-get install -y chromium
  else
    echo "Install Chromium, then set JARVIS_BROWSER_EXECUTABLE to its absolute path." >&2
  fi
fi

if ! getent group "$AGENT_GROUP" >/dev/null; then
  sudo groupadd --system "$AGENT_GROUP"
fi
if ! id "$AGENT_USER" >/dev/null 2>&1; then
  sudo useradd --system --create-home --home-dir "$AGENT_HOME" --shell /usr/sbin/nologin --gid "$AGENT_GROUP" "$AGENT_USER"
fi
sudo usermod --gid "$AGENT_GROUP" --groups "$AGENT_GROUP" --home "$AGENT_HOME" --shell /usr/sbin/nologin "$AGENT_USER"
sudo usermod -aG "$AGENT_GROUP" "$APP_USER"
sudo install -d -o "$AGENT_USER" -g "$AGENT_GROUP" -m 0750 "$AGENT_HOME" "$AGENT_HOME/.openjarvis" "$AGENT_HOME/.cache"
sudo install -d -o "$APP_USER" -g "$AGENT_GROUP" -m 2770 "$WORKSPACE_DIR"

if [[ ! -f "$SOURCE_DIR/pyproject.toml" ]]; then
  if [[ -e "$SOURCE_DIR" ]]; then
    echo "$SOURCE_DIR exists but is not an OpenJarvis source checkout. Set OPENJARVIS_SOURCE_DIR to the correct folder." >&2
    exit 1
  fi
  echo "Cloning official OpenJarvis into root-owned $SOURCE_DIR"
  sudo git clone --depth 1 https://github.com/open-jarvis/OpenJarvis.git "$SOURCE_DIR"
fi

if [[ ! -x "$UV_ENV/bin/uv" ]]; then
  sudo python3 -m venv "$UV_ENV"
  sudo "$UV_ENV/bin/python" -m pip install --upgrade pip uv
fi

echo "Installing the local API server and isolated Playwright browser tools"
sudo env UV_CACHE_DIR=/var/cache/openjarvis-uv "$UV_ENV/bin/uv" sync --project "$SOURCE_DIR" --extra server --extra browser
PLAYWRIGHT_BIN="$SOURCE_DIR/.venv/bin/playwright"
if [[ -x "$PLAYWRIGHT_BIN" ]]; then
  sudo env PLAYWRIGHT_BROWSERS_PATH="$SOURCE_DIR/.playwright" "$PLAYWRIGHT_BIN" install chromium
fi
sudo chown -R root:root "$SOURCE_DIR" "$UV_ENV"
sudo chmod -R a+rX "$SOURCE_DIR" "$UV_ENV"

echo "Installing the root-owned Playwright MCP bridge used by the isolated agent"
sudo install -d -o root -g root -m 0755 "$AGENT_TOOLS_DIR"
sudo install -o root -g root -m 0755 "$SCRIPT_DIR/start-browser-mcp.mjs" "$AGENT_TOOLS_DIR/start-browser-mcp.mjs"
sudo install -o root -g root -m 0644 "$SCRIPT_DIR/mcp-prefix.mjs" "$AGENT_TOOLS_DIR/mcp-prefix.mjs"
sudo install -o root -g root -m 0644 "$SCRIPT_DIR/browser-network-guard.ts" "$AGENT_TOOLS_DIR/browser-network-guard.ts"
sudo npm install --prefix "$AGENT_TOOLS_DIR" --omit=dev --ignore-scripts @playwright/mcp@0.0.83
sudo chown -R root:root "$AGENT_TOOLS_DIR"
sudo chmod -R a+rX "$AGENT_TOOLS_DIR"

CONFIG_ARGS=(--config "$AGENT_HOME/.openjarvis/config.toml" --model "${JARVIS_MODEL:-llama3.2:1b}" --allowed-dir "$WORKSPACE_DIR" --browser-launcher "$AGENT_TOOLS_DIR/start-browser-mcp.mjs")
if [[ "$HOST_CONTROL" == true ]]; then
  CONFIG_ARGS+=(--host-control)
elif [[ "$BROWSER_CONTROL" == true ]]; then
  CONFIG_ARGS+=(--browser-control)
fi
sudo -u "$AGENT_USER" env HOME="$AGENT_HOME" "$SOURCE_DIR/.venv/bin/python" "$SCRIPT_DIR/configure-openjarvis.py" "${CONFIG_ARGS[@]}"

ENV_FILE="$SCRIPT_DIR/../.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$SCRIPT_DIR/../.env.example" "$ENV_FILE"
fi
set_env_value() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}
set_env_value JARVIS_ENABLE_HOST_CONTROL "$HOST_CONTROL"
set_env_value JARVIS_BROWSER_CONTROL_ENABLED "$BROWSER_CONTROL"
set_env_value OPENJARVIS_INSTALL_DIR "$SOURCE_DIR"
set_env_value OPENJARVIS_WORKSPACE "$WORKSPACE_DIR"
chmod 600 "$ENV_FILE"

echo
echo "OpenJarvis is ready at $SOURCE_DIR/.venv/bin/jarvis."
echo "It runs as $AGENT_USER, not $APP_USER, and can access only $WORKSPACE_DIR plus public system data."
echo "Browser control uses an isolated Playwright profile."
if [[ "$HOST_CONTROL" == true ]]; then
  echo "Shell/write tools are restricted to the unprivileged agent account and shared workspace. The agent has no sudo, dashboard secrets, OAuth files, Docker socket, or private home access."
elif [[ "$BROWSER_CONTROL" == true ]]; then
  echo "The isolated browser has click/type tools. Every interactive task still needs a one-time dashboard PIN approval."
else
  echo "Browser interaction and host mutation tools are disabled; navigation, snapshots, and extraction remain available."
fi
echo "Next: run $SCRIPT_DIR/../install-pi.sh"
