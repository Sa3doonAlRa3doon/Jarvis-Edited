#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_USER="$(id -un)"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
NODE_BIN="$(command -v node || true)"
JARVIS_BIN="$(command -v jarvis || true)"
if [[ -z "$JARVIS_BIN" && -x "$APP_HOME/.local/bin/jarvis" ]]; then
  JARVIS_BIN="$APP_HOME/.local/bin/jarvis"
fi

if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js 20+ is required. Install Node.js, then run this script again."
  exit 1
fi

NODE_MAJOR="$($NODE_BIN -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 20 )); then
  echo "Node.js 20+ is required; found $($NODE_BIN --version)."
  exit 1
fi

MISSING_MEDIA_PACKAGES=()
command -v ffmpeg >/dev/null 2>&1 || MISSING_MEDIA_PACKAGES+=(ffmpeg)
command -v arecord >/dev/null 2>&1 || MISSING_MEDIA_PACKAGES+=(alsa-utils)
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
     "$APP_DIR/.wake-venv/bin/python" -m pip install openwakeword onnxruntime numpy && \
     "$APP_DIR/.wake-venv/bin/python" -c 'import openwakeword; openwakeword.utils.download_models()'; then
    WAKE_READY=true
    echo "Installed the fully local openWakeWord Hey Jarvis listener."
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

set_env_value() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

if ! grep -q '^OPS_CONTROL_PIN=.' .env; then
  GENERATED_PIN="$(python3 -c 'import secrets; print(f"{secrets.randbelow(1000000):06d}")')"
  set_env_value OPS_CONTROL_PIN "$GENERATED_PIN"
  echo "Generated JARVIS maintenance PIN: $GENERATED_PIN"
  echo "Save it now. It is stored only in $APP_DIR/.env and is required for service controls."
fi
CONTROL_PIN="$(sed -n 's/^OPS_CONTROL_PIN=//p' .env | tail -n 1)"
if ! grep -q '^DASHBOARD_ACCESS_PIN=.' .env; then
  set_env_value DASHBOARD_ACCESS_PIN "$CONTROL_PIN"
  echo "The same private PIN now unlocks the dashboard. Maintenance still needs a typed confirmation phrase."
fi
set_env_value OPS_HELPER_PATH /usr/local/sbin/jarvis-service-control
set_env_value ENABLE_PI_WAKE_LISTENER "$WAKE_READY"
set_env_value WAKE_PYTHON "$APP_DIR/.wake-venv/bin/python"
set_env_value HOST 0.0.0.0
install -d -m 0700 "$APP_DIR/data"

sudo install -m 0750 "$APP_DIR/scripts/jarvis-service-control.sh" /usr/local/sbin/jarvis-service-control
sudo tee /etc/sudoers.d/jarvis-command-center >/dev/null <<EOF
$APP_USER ALL=(root) NOPASSWD: /usr/local/sbin/jarvis-service-control status, /usr/local/sbin/jarvis-service-control restart-all, /usr/local/sbin/jarvis-service-control stop-until-reboot, /usr/local/sbin/jarvis-service-control maintenance-on, /usr/local/sbin/jarvis-service-control resume, /usr/local/sbin/jarvis-service-control repair
EOF
sudo chmod 0440 /etc/sudoers.d/jarvis-command-center
sudo visudo -cf /etc/sudoers.d/jarvis-command-center >/dev/null

for GUARDED_SERVICE in ollama.service openjarvis-api.service hatclanker.service; do
  sudo install -d -m 0755 "/etc/systemd/system/${GUARDED_SERVICE}.d"
  sudo tee "/etc/systemd/system/${GUARDED_SERVICE}.d/90-jarvis-maintenance.conf" >/dev/null <<'EOF'
[Unit]
ConditionPathExists=!/run/jarvis-command-center/maintenance.lock
ConditionPathExists=!/var/lib/jarvis-command-center/maintenance.lock
EOF
done

if [[ -n "$JARVIS_BIN" ]]; then
  sudo tee /etc/systemd/system/openjarvis-api.service >/dev/null <<EOF
[Unit]
Description=Private OpenJarvis API
After=network-online.target ollama.service
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Environment=HOME=$APP_HOME
ExecStart=$JARVIS_BIN serve --host 127.0.0.1 --port 8000 --agent orchestrator
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=$APP_HOME/.openjarvis

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  if ! sudo systemctl enable --now openjarvis-api; then
    echo "OpenJarvis API did not start. Run: sudo journalctl -u openjarvis-api -n 100 --no-pager"
    echo "The dashboard will still use its direct Ollama fallback."
  fi
else
  echo "jarvis command not found. Install OpenJarvis first; the dashboard will use Ollama fallback meanwhile."
fi

SERVICE_FILE="/etc/systemd/system/openjarvis-dashboard.service"
sudo tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=OpenJarvis Pi Command Center
After=network-online.target ollama.service openjarvis-api.service
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=NODE_ENV=production
ExecStart=$NODE_BIN $APP_DIR/server.mjs
Restart=on-failure
RestartSec=4
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=$APP_DIR/data

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now openjarvis-dashboard
if [[ -n "$JARVIS_BIN" ]]; then
  sudo systemctl status openjarvis-api --no-pager -l || true
fi
sudo systemctl status openjarvis-dashboard --no-pager -l

echo
PI_ADDRESS="$(hostname -I | awk '{print $1}')"
echo "JARVIS dashboard installed on http://$PI_ADDRESS:8787."
echo "Unlock it with the private dashboard PIN stored in $APP_DIR/.env."
echo "Camera/microphone access is limited to devices selected in the Vision & Voice tab."
echo "Hidden settings: http://$PI_ADDRESS:8787/settings"
echo "For laptop camera/microphone testing, browsers require a secure origin. Use this tunnel:"
echo "ssh -N -L 8787:127.0.0.1:8787 $APP_USER@$PI_ADDRESS"
echo "Then browse to http://127.0.0.1:8787/settings"
