#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_USER="${SUDO_USER:-$(id -un)}"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
APP_UID="$(id -u "$APP_USER")"
APP_GROUP="$(id -gn "$APP_USER")"
AGENT_USER="jarvis-agent"
AGENT_HOME="/var/lib/jarvis-agent"
AGENT_GROUP="jarvis-workspace"
OPENJARVIS_DIR="${OPENJARVIS_INSTALL_DIR:-/opt/openjarvis}"
OPENJARVIS_WORKSPACE="${OPENJARVIS_WORKSPACE:-/srv/jarvis-workspace}"
AGENT_TOOLS_DIR="/opt/jarvis-agent-tools"
NODE_BIN="$(command -v node || true)"
JARVIS_BIN=""
INSTALL_VISION=false
INSTALL_STT=false
VISION_MODEL="${JARVIS_VISION_MODEL:-}"
VISION_PROFILE="balanced"
VISION_MODEL_EXPLICIT=false
STT_MODEL_DIR="${JARVIS_STT_MODEL_DIR:-}"
STT_MODEL_URL="${JARVIS_STT_MODEL_URL:-https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --vision)
      INSTALL_VISION=true
      shift
      ;;
    --vision-model)
      [[ -n "${2:-}" ]] || { echo "--vision-model needs an Ollama model tag." >&2; exit 2; }
      VISION_MODEL="$2"
      VISION_MODEL_EXPLICIT=true
      INSTALL_VISION=true
      shift 2
      ;;
    --stt)
      INSTALL_STT=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--vision] [--vision-model MODEL] [--stt]"
      echo "  --vision              pull and configure the Pi-balanced local vision model"
      echo "  --vision-model MODEL  pull and configure a different Ollama vision tag"
      echo "  --stt                 install Vosk and the small local English command model"
      exit 0
      ;;
    *)
      echo "Unknown option: $1. Use --help for usage." >&2
      exit 2
      ;;
  esac
done

if [[ -n "$VISION_MODEL" && ! "$VISION_MODEL" =~ ^[A-Za-z0-9._:/-]{1,120}$ ]]; then
  echo "Vision model tag contains unsupported characters: $VISION_MODEL" >&2
  exit 2
fi
[[ -x "$OPENJARVIS_DIR/.venv/bin/jarvis" ]] && JARVIS_BIN="$OPENJARVIS_DIR/.venv/bin/jarvis"

if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js 22.15+ is required by the Camoufox runtime. Install Node.js, then run this script again."
  exit 1
fi

NODE_MAJOR="$($NODE_BIN -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$($NODE_BIN -p 'process.versions.node.split(".")[1]')"
if (( NODE_MAJOR < 22 || (NODE_MAJOR == 22 && NODE_MINOR < 15) )); then
  echo "Node.js 22.15+ is required by the Camoufox runtime; found $($NODE_BIN --version)."
  exit 1
fi

MISSING_MEDIA_PACKAGES=()
command -v ffmpeg >/dev/null 2>&1 || MISSING_MEDIA_PACKAGES+=(ffmpeg)
command -v arecord >/dev/null 2>&1 || MISSING_MEDIA_PACKAGES+=(alsa-utils)
command -v espeak-ng >/dev/null 2>&1 || command -v espeak >/dev/null 2>&1 || MISSING_MEDIA_PACKAGES+=(espeak-ng)
command -v v4l2-ctl >/dev/null 2>&1 || MISSING_MEDIA_PACKAGES+=(v4l-utils)
command -v python3 >/dev/null 2>&1 || MISSING_MEDIA_PACKAGES+=(python3)
python3 -m venv --help >/dev/null 2>&1 || MISSING_MEDIA_PACKAGES+=(python3-venv)
if (( ${#MISSING_MEDIA_PACKAGES[@]} > 0 )); then
  if command -v apt-get >/dev/null 2>&1; then
    echo "Installing local camera and microphone tools: ${MISSING_MEDIA_PACKAGES[*]}"
    sudo apt-get update
    sudo apt-get install -y "${MISSING_MEDIA_PACKAGES[@]}"
  else
    echo "Install these media packages manually: ${MISSING_MEDIA_PACKAGES[*]}"
  fi
fi

install_openwakeword_models() {
  local wake_venv="$1"
  local python="$wake_venv/bin/python"
  local model_dir base name expected temp actual
  model_dir="$("$python" -c 'import openwakeword, pathlib; print(pathlib.Path(openwakeword.__file__).resolve().parent / "resources" / "models")')" || return 1
  base="https://github.com/dscripka/openWakeWord/releases/download/v0.5.1"
  mkdir -p "$model_dir" || return 1
  for model in 'hey_jarvis_v0.1.onnx:1271370' 'embedding_model.onnx:1326578' 'melspectrogram.onnx:1087958'; do
    name="${model%%:*}"
    expected="${model##*:}"
    temp="$(mktemp "$model_dir/.${name}.XXXXXX")" || return 1
    if ! curl --fail --location --silent --show-error --connect-timeout 10 --max-time 120 "$base/$name" -o "$temp"; then
      rm -f "$temp"
      return 1
    fi
    actual="$(wc -c < "$temp" | tr -d '[:space:]')"
    if [[ "$actual" != "$expected" ]]; then
      echo "Unexpected byte size for official openWakeWord asset $name ($actual; expected $expected)." >&2
      rm -f "$temp"
      return 1
    fi
    chmod 0644 "$temp" && mv -f "$temp" "$model_dir/$name" || { rm -f "$temp"; return 1; }
  done
  "$python" - "$model_dir" <<'PY'
import sys
from pathlib import Path
import numpy as np
from openwakeword.model import Model

folder = Path(sys.argv[1])
model_path = folder / "hey_jarvis_v0.1.onnx"
model = Model(wakeword_model_paths=[str(model_path)])
scores = model.predict(np.zeros(1280, dtype=np.int16))
if not scores or not any("hey_jarvis" in key for key in scores):
    raise SystemExit("Hey Jarvis ONNX model did not return its expected score.")
PY
}

for MEDIA_GROUP in video audio; do
  if getent group "$MEDIA_GROUP" >/dev/null && ! id -nG "$APP_USER" | tr ' ' '\n' | grep -qx "$MEDIA_GROUP"; then
    sudo usermod -aG "$MEDIA_GROUP" "$APP_USER"
  fi
done

cd "$APP_DIR"
npm install --omit=dev

WAKE_READY=false
if python3 -m venv "$APP_DIR/.wake-venv"; then
  if "$APP_DIR/.wake-venv/bin/python" -m pip install --upgrade pip && \
     "$APP_DIR/.wake-venv/bin/python" -m pip install openwakeword onnxruntime numpy; then
    if install_openwakeword_models "$APP_DIR/.wake-venv"; then
      WAKE_READY=true
      echo "Installed and verified the local ONNX Hey Jarvis listener."
    else
      echo "Local openWakeWord model preparation failed. The dashboard and browser double-clap mode still work."
    fi
  else
    echo "Wake-word packages could not be installed. The dashboard and browser double-clap mode still work."
  fi
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  echo "Created $APP_DIR/.env from the example. Review it before using Fish Voice."
else
  chmod 600 .env
fi

if [[ "$VISION_MODEL_EXPLICIT" == false ]]; then
  CONFIGURED_VISION_MODEL="$(sed -n 's/^JARVIS_VISION_MODEL=//p' .env | tail -n 1)"
  [[ -n "$CONFIGURED_VISION_MODEL" ]] && VISION_MODEL="$CONFIGURED_VISION_MODEL"
fi
if [[ -z "$VISION_MODEL" ]]; then
  TOTAL_RAM_KIB="$(awk '/MemTotal:/ { print $2; exit }' /proc/meminfo 2>/dev/null || true)"
  FREE_DISK_KIB="$(df -Pk "$APP_DIR" 2>/dev/null | awk 'NR == 2 { print $4; exit }' || true)"
  if [[ "${TOTAL_RAM_KIB:-0}" =~ ^[0-9]+$ ]] && (( TOTAL_RAM_KIB > 0 && TOTAL_RAM_KIB < 6291456 )); then
    VISION_MODEL="moondream:1.8b"
    VISION_PROFILE="lite-ram"
  elif [[ "${FREE_DISK_KIB:-0}" =~ ^[0-9]+$ ]] && (( FREE_DISK_KIB > 0 && FREE_DISK_KIB < 4718592 )); then
    VISION_MODEL="moondream:1.8b"
    VISION_PROFILE="lite-storage"
  else
    VISION_MODEL="qwen2.5vl:3b"
    VISION_PROFILE="balanced"
  fi
elif [[ "$VISION_MODEL" == "moondream:1.8b" ]]; then
  VISION_PROFILE="lite-configured"
else
  VISION_PROFILE="configured"
fi
if [[ ! "$VISION_MODEL" =~ ^[A-Za-z0-9._:/-]{1,120}$ ]]; then
  echo "Vision model tag contains unsupported characters: $VISION_MODEL" >&2
  exit 2
fi

set_env_value() {
  local key="$1"
  local value="$2"
  local env_file="${ENV_FILE:-.env}"
  [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "Refusing invalid environment key." >&2; return 2; }
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || { echo "Refusing multiline environment value for $key." >&2; return 2; }
  JARVIS_ENV_KEY="$key" JARVIS_ENV_VALUE="$value" python3 - "$env_file" <<'PY'
import os
from pathlib import Path
import stat
import sys
import tempfile

path = Path(sys.argv[1])
key = os.environ["JARVIS_ENV_KEY"]
value = os.environ["JARVIS_ENV_VALUE"]
raw = path.read_text(encoding="utf-8") if path.exists() else ""
prefix = f"{key}="
lines = raw.splitlines(keepends=True)
found = False
updated = []
for line in lines:
    body = line.rstrip("\r\n")
    ending = line[len(body):]
    if body.startswith(prefix):
        updated.append(f"{prefix}{value}{ending}")
        found = True
    else:
        updated.append(line)
result = "".join(updated)
if not found:
    if result and not result.endswith(("\n", "\r")):
        result += "\n"
    result += f"{prefix}{value}\n"
mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o600
with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
    handle.write(result)
    temporary = Path(handle.name)
try:
    os.chmod(temporary, mode)
    os.replace(temporary, path)
finally:
    temporary.unlink(missing_ok=True)
PY
}

if ! grep -q '^PRINTER_URL=.' .env; then
  set_env_value PRINTER_URL http://192.168.4.74:4408
  echo "Configured the fixed Moonraker/Fluidd printer endpoint at http://192.168.4.74:4408."
fi
grep -q '^PRINTER_API_KEY=' .env || set_env_value PRINTER_API_KEY ''
grep -q '^PRINTER_TIMEOUT_MS=' .env || set_env_value PRINTER_TIMEOUT_MS 2800
grep -q '^KNOWLEDGE_ROOTS=' .env || set_env_value KNOWLEDGE_ROOTS ''

if ! grep -q '^JARVIS_INTERNAL_SERVICE_TOKEN=.' .env; then
  INTERNAL_SERVICE_TOKEN="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  set_env_value JARVIS_INTERNAL_SERVICE_TOKEN "$INTERNAL_SERVICE_TOKEN"
  unset INTERNAL_SERVICE_TOKEN
fi
set_env_value JARVIS_SETTINGS_BACKEND_PORT 8789
set_env_value JARVIS_CAMERA_BACKEND_PORT 8790
set_env_value JARVIS_MIC_BACKEND_PORT 8791
set_env_value JARVIS_SETTINGS_BACKEND_URL http://127.0.0.1:8789
set_env_value JARVIS_CAMERA_BACKEND_URL http://127.0.0.1:8790
set_env_value JARVIS_MIC_BACKEND_URL http://127.0.0.1:8791
if ! grep -q '^GOOGLE_OAUTH_PORT=.' .env; then
  set_env_value GOOGLE_OAUTH_PORT 8792
elif grep -Eq '^GOOGLE_OAUTH_PORT=8789\r?$' .env; then
  set_env_value GOOGLE_OAUTH_PORT 8792
fi
GOOGLE_OAUTH_PORT_VALUE="$(sed -n 's/^GOOGLE_OAUTH_PORT=//p' .env | tr -d '\r' | tail -n 1)"
GOOGLE_OAUTH_REDIRECT_URI_VALUE="$(sed -n 's/^GOOGLE_OAUTH_REDIRECT_URI=//p' .env | tr -d '\r' | tail -n 1)"
if [[ "$GOOGLE_OAUTH_REDIRECT_URI_VALUE" == "http://127.0.0.1:8789/" || "$GOOGLE_OAUTH_REDIRECT_URI_VALUE" == "http://localhost:8789/" ]]; then
  set_env_value GOOGLE_OAUTH_REDIRECT_URI "http://127.0.0.1:${GOOGLE_OAUTH_PORT_VALUE}/"
  echo "Moved the legacy Google OAuth callback off the settings backend port to ${GOOGLE_OAUTH_PORT_VALUE}; update the registered redirect URI for a web OAuth client."
elif [[ -z "$GOOGLE_OAUTH_REDIRECT_URI_VALUE" ]]; then
  set_env_value GOOGLE_OAUTH_REDIRECT_URI "http://127.0.0.1:${GOOGLE_OAUTH_PORT_VALUE}/"
fi

# Keep OAuth files writable by the sandboxed core service without granting it
# write access to the user's home. Preserve existing private files on upgrade.
GOOGLE_AUTH_STORAGE="/var/lib/openjarvis-google"
GOOGLE_AUTH_SOURCE_DIR="$(sed -n 's/^GOOGLE_AUTH_DIRECTORY=//p' .env | tr -d '\r' | tail -n 1)"
GOOGLE_CREDENTIALS_SOURCE="$(sed -n 's/^GOOGLE_CREDENTIALS_PATH=//p' .env | tr -d '\r' | tail -n 1)"
GOOGLE_TOKEN_SOURCE="$(sed -n 's/^GOOGLE_TOKEN_PATH=//p' .env | tr -d '\r' | tail -n 1)"
sudo install -d -o "$APP_USER" -g "$APP_GROUP" -m 0700 "$GOOGLE_AUTH_STORAGE"
run_as_app_user() {
  if [[ "$(id -u)" == "$APP_UID" ]]; then
    "$@"
  else
    sudo -u "$APP_USER" "$@"
  fi
}
migrate_google_auth_file() {
  local filename="$1"
  local configured_source="$2"
  local target="$GOOGLE_AUTH_STORAGE/$filename"
  local source
  local source_owner
  local source_links
  local target_links
  local candidates=()
  if [[ -L "$target" ]]; then
    echo "Refusing unsafe symlink in private Google OAuth storage: $target" >&2
    return 1
  fi
  if [[ -e "$target" ]]; then
    [[ -f "$target" ]] || { echo "Refusing non-file in private Google OAuth storage: $target" >&2; return 1; }
    target_links="$(stat -c '%h' -- "$target" 2>/dev/null || true)"
    [[ "$target_links" == "1" ]] || { echo "Refusing multiply linked file in private Google OAuth storage: $target" >&2; return 1; }
    sudo chown "$APP_USER:$APP_GROUP" -- "$target"
    sudo chmod 0600 -- "$target"
    return 0
  fi
  [[ -z "$configured_source" ]] || candidates+=("$configured_source")
  [[ -z "$GOOGLE_AUTH_SOURCE_DIR" ]] || candidates+=("$GOOGLE_AUTH_SOURCE_DIR/$filename")
  candidates+=("$APP_HOME/jarvis-google/$filename" "$APP_HOME/Documents/Jarvis-Google-Auth/$filename")
  for source in "${candidates[@]}"; do
    if [[ "$source" != "$target" && -f "$source" && ! -L "$source" && -r "$source" ]]; then
      source_owner="$(stat -c '%u' -- "$source" 2>/dev/null || true)"
      source_links="$(stat -c '%h' -- "$source" 2>/dev/null || true)"
      [[ "$source_owner" == "$APP_UID" ]] || continue
      [[ "$source_links" == "1" ]] || continue
      run_as_app_user install -m 0600 -- "$source" "$target"
      echo "Migrated private Google OAuth material into $GOOGLE_AUTH_STORAGE."
      return 0
    fi
  done
  return 0
}
migrate_google_auth_file credentials.json "$GOOGLE_CREDENTIALS_SOURCE"
migrate_google_auth_file token.json "$GOOGLE_TOKEN_SOURCE"
set_env_value GOOGLE_AUTH_DIRECTORY "$GOOGLE_AUTH_STORAGE"
set_env_value GOOGLE_CREDENTIALS_PATH "$GOOGLE_AUTH_STORAGE/credentials.json"
set_env_value GOOGLE_TOKEN_PATH "$GOOGLE_AUTH_STORAGE/token.json"
grep -q '^GOOGLE_CLIENT_SECRET=' .env || set_env_value GOOGLE_CLIENT_SECRET ''

if ! grep -q '^OPS_CONTROL_PIN=.' .env; then
  GENERATED_PIN="$(python3 -c 'import secrets; print(f"{secrets.randbelow(1000000):06d}")')"
  set_env_value OPS_CONTROL_PIN "$GENERATED_PIN"
  echo "Generated the JARVIS maintenance PIN in the private $APP_DIR/.env file."
  echo "Read OPS_CONTROL_PIN locally when needed; its value is never printed into installation logs."
fi
CONTROL_PIN="$(sed -n 's/^OPS_CONTROL_PIN=//p' .env | tail -n 1)"
if ! grep -q '^DASHBOARD_ACCESS_PIN=.' .env; then
  set_env_value DASHBOARD_ACCESS_PIN "$CONTROL_PIN"
  echo "The same private PIN now unlocks the dashboard. Maintenance still needs a typed confirmation phrase."
fi
set_env_value OPS_HELPER_PATH /usr/local/sbin/jarvis-service-control
set_env_value ENABLE_PI_WAKE_LISTENER "$WAKE_READY"
set_env_value WAKE_PYTHON "$APP_DIR/.wake-venv/bin/python"
set_env_value JARVIS_STT_COMMAND_TIMEOUT_MS 15000
set_env_value JARVIS_STT_COMMAND_SILENCE_MS 900
set_env_value JARVIS_STT_ACK_TIMEOUT_MS 15000
set_env_value JARVIS_STT_POST_ACK_GUARD_MS 180
CURRENT_BROWSER_PROFILE="$(sed -n 's/^JARVIS_BROWSER_PROFILE=//p' .env | tail -n 1)"
if [[ -z "$CURRENT_BROWSER_PROFILE" ]]; then
  CURRENT_BROWSER_PROFILE="$APP_DIR/data/camoufox-profile"
fi
CURRENT_BROWSER_PROFILE="$(realpath -m "$CURRENT_BROWSER_PROFILE")"
case "$CURRENT_BROWSER_PROFILE" in
  "$APP_DIR/data/"*) ;;
  *)
    echo "JARVIS_BROWSER_PROFILE must be inside $APP_DIR/data because the dashboard service is sandboxed to that writable directory." >&2
    exit 1
    ;;
esac
set_env_value JARVIS_BROWSER_PROFILE "$CURRENT_BROWSER_PROFILE"
install -d -m 0700 "$CURRENT_BROWSER_PROFILE"
set_env_value OLLAMA_HOST 127.0.0.1:11434
set_env_value OLLAMA_NO_CLOUD 1
set_env_value OLLAMA_MAX_LOADED_MODELS 1
set_env_value HOST 127.0.0.1
set_env_value API_HOST 127.0.0.1
set_env_value API_PORT 8788
if [[ "$INSTALL_VISION" == true ]]; then
  OLLAMA_BIN="$(command -v ollama || true)"
  if [[ -z "$OLLAMA_BIN" ]]; then
    echo "--vision requested, but Ollama is not installed. Install Ollama, start it, then rerun: $0 --vision" >&2
    exit 1
  fi
  if [[ "$VISION_MODEL" == "moondream:1.8b" ]]; then
    echo "Pulling local vision model $VISION_MODEL (lite Pi profile, about 1.7 GB; selection=$VISION_PROFILE)."
  else
    echo "Pulling local vision model $VISION_MODEL (balanced Pi profile, about 3.2 GB; selection=$VISION_PROFILE)."
  fi
  if ! "$OLLAMA_BIN" pull "$VISION_MODEL"; then
    echo "Ollama could not pull $VISION_MODEL. Confirm Ollama is running at 127.0.0.1:11434 and retry." >&2
    exit 1
  fi
  if ! "$OLLAMA_BIN" list | awk 'NR > 1 { print $1 }' | grep -Fxq "$VISION_MODEL"; then
    echo "Ollama pull finished, but $VISION_MODEL was not found in the local model catalog. The vision setting was not changed." >&2
    exit 1
  fi
  # Do not treat a successfully downloaded text model as a working vision
  # backend. The shared Node preflight checks Ollama's /api/show capability
  # metadata and fails closed when the tag does not advertise image input.
  if ! JARVIS_VISION_MODEL="$VISION_MODEL" OLLAMA_MAX_LOADED_MODELS=1 "$NODE_BIN" scripts/install-vision-model.mjs --check; then
    echo "Ollama installed $VISION_MODEL, but it did not pass the local image-capability check. The vision setting was not changed." >&2
    exit 1
  fi
  set_env_value JARVIS_VISION_MODEL "$VISION_MODEL"
  echo "Configured JARVIS_VISION_MODEL=$VISION_MODEL in $APP_DIR/.env."
else
  echo "Vision model download skipped. When storage and bandwidth are ready, run: $0 --vision"
fi

if [[ "$INSTALL_STT" == true ]]; then
  STT_ROOT="$APP_DIR/models"
  STT_VENV="$APP_DIR/.wake-venv"
  if [[ ! -x "$STT_VENV/bin/python" ]]; then
    if ! python3 -m venv "$STT_VENV"; then
      echo "Could not create the local wake/speech environment at $STT_VENV." >&2
      exit 1
    fi
  fi
  if ! "$STT_VENV/bin/python" -m pip install --upgrade pip || ! "$STT_VENV/bin/python" -m pip install openwakeword onnxruntime numpy vosk; then
    echo "Could not install Vosk into the existing wake environment at $STT_VENV." >&2
    exit 1
  fi
  if ! install_openwakeword_models "$STT_VENV"; then
    echo "Could not download and verify the official local Hey Jarvis ONNX assets in $STT_VENV." >&2
    exit 1
  fi
  if [[ -z "$STT_MODEL_DIR" ]]; then
    STT_MODEL_DIR="$STT_ROOT/vosk-model-small-en-us-0.15"
  fi
  # Keep the installer fail-closed around the model path. A typo in an
  # environment variable must never turn a retry into a recursive delete of a
  # home directory or another mounted disk. Normalize the target and require
  # it to live below the project-owned models directory.
  STT_ROOT_REAL="$(realpath -m "$STT_ROOT")"
  STT_MODEL_DIR="$(realpath -m "$STT_MODEL_DIR")"
  case "$STT_MODEL_DIR" in
    "$STT_ROOT_REAL"/*) ;;
    *)
      echo "Refusing to install the Vosk model outside the project-owned models directory: $STT_ROOT_REAL" >&2
      exit 1
      ;;
  esac
  if [[ ! -f "$STT_MODEL_DIR/am/final.mdl" ]]; then
    command -v curl >/dev/null 2>&1 || { echo "curl is required to download the local Vosk model." >&2; exit 1; }
    command -v unzip >/dev/null 2>&1 || { echo "unzip is required to unpack the local Vosk model." >&2; exit 1; }
    install -d -m 0700 "$STT_ROOT"
    ARCHIVE="$(mktemp --tmpdir jarvis-vosk-XXXXXX.zip)"
    trap 'rm -f "$ARCHIVE"' EXIT
    echo "Downloading the small local Vosk command model. Audio stays on the Pi after installation."
    curl --fail --location --silent --show-error "$STT_MODEL_URL" -o "$ARCHIVE"
    TMP_MODEL_DIR="$(mktemp -d --tmpdir jarvis-vosk-XXXXXX)"
    unzip -q "$ARCHIVE" -d "$TMP_MODEL_DIR"
    FOUND_MODEL="$(find "$TMP_MODEL_DIR" -maxdepth 4 -type f -name final.mdl -printf '%h' -quit)"
    [[ -n "$FOUND_MODEL" ]] || { echo "The Vosk archive did not contain final.mdl." >&2; exit 1; }
    if [[ -e "$STT_MODEL_DIR" ]]; then
      echo "Vosk target exists but is incomplete; refusing to delete it. Remove it manually after checking the path, then rerun." >&2
      exit 1
    fi
    install -d -m 0700 "$(dirname "$STT_MODEL_DIR")"
    mv "$(dirname "$FOUND_MODEL")" "$STT_MODEL_DIR"
    rm -rf "$TMP_MODEL_DIR"
    rm -f "$ARCHIVE"
    trap - EXIT
  fi
  if [[ ! -f "$STT_MODEL_DIR/am/final.mdl" ]]; then
    echo "Vosk model is incomplete at $STT_MODEL_DIR." >&2
    exit 1
  fi
  set_env_value JARVIS_STT_MODEL_DIR "$STT_MODEL_DIR"
  set_env_value WAKE_PYTHON "$STT_VENV/bin/python"
  echo "Configured local Pi command transcription with Vosk at $STT_MODEL_DIR."
else
  echo "Local command transcription skipped. When ready, run: $0 --stt"
fi
install -d -m 0700 "$APP_DIR/data"
if [[ "$EUID" -eq 0 ]]; then
  sudo chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR/data"
  [[ ! -d "$APP_DIR/models" ]] || sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR/models"
  sudo chmod 0600 "$APP_DIR/.env"
fi

sudo install -m 0750 "$APP_DIR/scripts/jarvis-service-control.sh" /usr/local/sbin/jarvis-service-control
sudo tee /etc/sudoers.d/jarvis-command-center >/dev/null <<EOF
$APP_USER ALL=(root) NOPASSWD: /usr/local/sbin/jarvis-service-control status, /usr/local/sbin/jarvis-service-control restart-all, /usr/local/sbin/jarvis-service-control stop-until-reboot, /usr/local/sbin/jarvis-service-control maintenance-on, /usr/local/sbin/jarvis-service-control resume, /usr/local/sbin/jarvis-service-control repair
EOF
sudo chmod 0440 /etc/sudoers.d/jarvis-command-center
sudo visudo -cf /etc/sudoers.d/jarvis-command-center >/dev/null

for GUARDED_SERVICE in ollama.service openjarvis-api.service openjarvis-settings.service openjarvis-camera.service openjarvis-mic.service hatclanker.service; do
  sudo install -d -m 0755 "/etc/systemd/system/${GUARDED_SERVICE}.d"
  sudo tee "/etc/systemd/system/${GUARDED_SERVICE}.d/90-jarvis-maintenance.conf" >/dev/null <<'EOF'
[Unit]
ConditionPathExists=!/run/jarvis-command-center/maintenance.lock
ConditionPathExists=!/var/lib/jarvis-command-center/maintenance.lock
EOF
done

# Ollama is the local fallback/model router. Keep its HTTP listener on loopback
# and opt out of cloud features so the Pi remains private and deterministic.
sudo tee /etc/systemd/system/ollama.service.d/91-jarvis-local.conf >/dev/null <<'EOF'
[Service]
Environment=OLLAMA_HOST=127.0.0.1:11434
Environment=OLLAMA_NO_CLOUD=1
Environment=OLLAMA_MAX_LOADED_MODELS=1
EOF

if [[ -n "$JARVIS_BIN" ]]; then
  if ! id "$AGENT_USER" >/dev/null 2>&1; then
    echo "The isolated $AGENT_USER account is missing. Run scripts/setup-openjarvis-pi.sh first." >&2
    exit 1
  fi
  sudo install -d -o "$AGENT_USER" -g "$AGENT_GROUP" -m 0750 "$AGENT_HOME" "$AGENT_HOME/.openjarvis" "$AGENT_HOME/.cache"
  sudo install -d -o "$APP_USER" -g "$AGENT_GROUP" -m 2770 "$OPENJARVIS_WORKSPACE"
  OPENJARVIS_NETWORK_POLICY=""
  if grep -q '^JARVIS_ENABLE_HOST_CONTROL=\(1\|true\|yes\|on\)$' .env; then
    OPENJARVIS_NETWORK_POLICY=$'IPAddressDeny=any\nIPAddressAllow=localhost'
    echo "OpenJarvis workspace control is network-sealed to loopback. Dashboard web research remains available through the separate no-tools path."
  fi
  sudo tee /etc/systemd/system/openjarvis-api.service >/dev/null <<EOF
[Unit]
Description=Private OpenJarvis API
After=network-online.target ollama.service
Wants=network-online.target

[Service]
Type=simple
User=$AGENT_USER
Group=$AGENT_GROUP
WorkingDirectory=$OPENJARVIS_WORKSPACE
Environment=HOME=$AGENT_HOME
Environment=OPENJARVIS_WORKSPACE=$OPENJARVIS_WORKSPACE
Environment=JARVIS_BROWSER_HEADLESS=true
ExecStart=$JARVIS_BIN serve --host 127.0.0.1 --port 8000 --agent orchestrator
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=$OPENJARVIS_DIR $AGENT_TOOLS_DIR
ReadWritePaths=$AGENT_HOME $OPENJARVIS_WORKSPACE
CapabilityBoundingSet=
RestrictSUIDSGID=true
LockPersonality=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
InaccessiblePaths=-/var/run/docker.sock -/run/docker.sock
$OPENJARVIS_NETWORK_POLICY

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  if ! sudo systemctl enable --now openjarvis-api; then
    echo "OpenJarvis API did not start. Run: sudo journalctl -u openjarvis-api -n 100 --no-pager"
    echo "The dashboard will still use its direct Ollama fallback."
  fi
else
  echo "Isolated OpenJarvis was not found at $OPENJARVIS_DIR. Run scripts/setup-openjarvis-pi.sh first; the dashboard will use Ollama fallback meanwhile."
fi

SETTINGS_SERVICE_FILE="/etc/systemd/system/openjarvis-settings.service"
sudo tee "$SETTINGS_SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=JARVIS local settings backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=NODE_ENV=production
Environment=JARVIS_DATA_DIR=$APP_DIR/data
ExecStart=$NODE_BIN $APP_DIR/settings-service.mjs
Restart=on-failure
RestartSec=4
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=$APP_DIR/data $GOOGLE_AUTH_STORAGE

[Install]
WantedBy=multi-user.target
EOF

CAMERA_SERVICE_FILE="/etc/systemd/system/openjarvis-camera.service"
sudo tee "$CAMERA_SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=JARVIS local camera backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=NODE_ENV=production
ExecStart=$NODE_BIN $APP_DIR/camera-service.mjs
Restart=on-failure
RestartSec=4
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only

[Install]
WantedBy=multi-user.target
EOF

MIC_SERVICE_FILE="/etc/systemd/system/openjarvis-mic.service"
sudo tee "$MIC_SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=JARVIS local microphone and wake-word backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=NODE_ENV=production
ExecStart=$NODE_BIN $APP_DIR/mic-service.mjs
Restart=on-failure
RestartSec=4
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only

[Install]
WantedBy=multi-user.target
EOF

CORE_SERVICE_FILE="/etc/systemd/system/openjarvis-core.service"
sudo tee "$CORE_SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=JARVIS private API and voice back end
After=network-online.target ollama.service openjarvis-api.service openjarvis-settings.service openjarvis-camera.service openjarvis-mic.service
Wants=network-online.target ollama.service openjarvis-api.service openjarvis-settings.service openjarvis-camera.service openjarvis-mic.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=NODE_ENV=production
Environment=JARVIS_API_ONLY=1
Environment=JARVIS_DATA_DIR=$APP_DIR/data
ExecStart=$NODE_BIN $APP_DIR/server.mjs
Restart=on-failure
RestartSec=4
# The wake worker needs the narrow sudo helper for approved host operations only.
NoNewPrivileges=false
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=$APP_DIR/data

[Install]
WantedBy=multi-user.target
EOF

SERVICE_FILE="/etc/systemd/system/openjarvis-dashboard.service"
sudo tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=JARVIS dashboard front end
After=network-online.target openjarvis-core.service
Wants=network-online.target
Wants=openjarvis-core.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=NODE_ENV=production
ExecStart=$NODE_BIN $APP_DIR/frontend.mjs
Restart=on-failure
RestartSec=4
# Static UI process has no host-control privilege and cannot write project data.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
if systemctl list-unit-files ollama.service >/dev/null 2>&1; then
  sudo systemctl try-restart ollama.service || true
fi
sudo systemctl enable openjarvis-settings openjarvis-camera openjarvis-mic openjarvis-core openjarvis-dashboard
sudo systemctl restart openjarvis-settings openjarvis-camera openjarvis-mic || sudo systemctl start openjarvis-settings openjarvis-camera openjarvis-mic
sudo systemctl restart openjarvis-core || sudo systemctl start openjarvis-core
sudo systemctl restart openjarvis-dashboard || sudo systemctl start openjarvis-dashboard
if [[ -n "$JARVIS_BIN" ]]; then
  sudo systemctl status openjarvis-api --no-pager -l || true
fi
sudo systemctl status openjarvis-core --no-pager -l
sudo systemctl status openjarvis-settings openjarvis-camera openjarvis-mic --no-pager -l
sudo systemctl status openjarvis-dashboard --no-pager -l

echo
PI_ADDRESS="$(hostname -I | awk '{print $1}')"
echo "JARVIS dashboard is listening only on http://127.0.0.1:8787."
echo "Unlock it with the private dashboard PIN stored in $APP_DIR/.env."
echo "Camera/microphone access is limited to devices selected in the Vision & Voice tab."
echo "3D knowledge gestures and the fixed printer HUD are included. Printer actions still require the private PIN plus an exact phrase."
echo "For private laptop/phone access, create an SSH tunnel (or configure Tailscale Serve HTTPS):"
echo "ssh -N -L 8787:127.0.0.1:8787 $APP_USER@$PI_ADDRESS"
echo "Then browse to http://127.0.0.1:8787/ (hidden settings: /settings)."
