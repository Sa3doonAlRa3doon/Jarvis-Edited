#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="/var/lib/jarvis-command-center"
RUNTIME_DIR="/run/jarvis-command-center"
PERSIST_MARKER="$STATE_DIR/maintenance.lock"
RUNTIME_MARKER="$RUNTIME_DIR/maintenance.lock"
CONTAINER_STATE="$STATE_DIR/running-containers"
SERVICES=(ollama.service openjarvis-api.service hatclanker.service)

install -d -m 0750 "$STATE_DIR" "$RUNTIME_DIR"

existing_services=()
for unit in "${SERVICES[@]}"; do
  if systemctl cat "$unit" >/dev/null 2>&1; then
    existing_services+=("$unit")
  fi
done

stop_containers() {
  : > "$CONTAINER_STATE"
  chmod 0600 "$CONTAINER_STATE"
  if command -v docker >/dev/null 2>&1; then
    docker ps -q > "$CONTAINER_STATE" || true
    if [[ -s "$CONTAINER_STATE" ]]; then
      mapfile -t ids < "$CONTAINER_STATE"
      docker stop "${ids[@]}"
    fi
  fi
}

resume_containers() {
  if command -v docker >/dev/null 2>&1 && [[ -s "$CONTAINER_STATE" ]]; then
    mapfile -t ids < "$CONTAINER_STATE"
    docker start "${ids[@]}" || true
    : > "$CONTAINER_STATE"
  fi
}

stop_services() {
  if (( ${#existing_services[@]} > 0 )); then
    systemctl stop "${existing_services[@]}"
  fi
}

start_services() {
  if (( ${#existing_services[@]} > 0 )); then
    systemctl start "${existing_services[@]}"
  fi
}

status_json() {
  persistent=false
  runtime=false
  [[ -e "$PERSIST_MARKER" ]] && persistent=true
  [[ -e "$RUNTIME_MARKER" ]] && runtime=true
  printf '{"maintenancePersistent":%s,"maintenanceUntilReboot":%s,"services":[' "$persistent" "$runtime"
  first=true
  for unit in "${SERVICES[@]}"; do
    if systemctl cat "$unit" >/dev/null 2>&1; then
      active="$(systemctl is-active "$unit" 2>/dev/null || true)"
      enabled="$(systemctl is-enabled "$unit" 2>/dev/null || true)"
      [[ "$first" == true ]] || printf ','
      first=false
      printf '{"name":"%s","active":"%s","enabled":"%s"}' "$unit" "$active" "$enabled"
    fi
  done
  printf ']}\n'
}

case "${1:-}" in
  status)
    status_json
    ;;
  restart-all)
    if [[ -e "$PERSIST_MARKER" || -e "$RUNTIME_MARKER" ]]; then
      echo "Maintenance mode is active; resume services first." >&2
      exit 3
    fi
    if (( ${#existing_services[@]} > 0 )); then
      systemctl restart "${existing_services[@]}"
    fi
    resume_containers
    status_json
    ;;
  stop-until-reboot)
    install -m 0640 /dev/null "$RUNTIME_MARKER"
    stop_containers
    stop_services
    status_json
    ;;
  maintenance-on)
    install -m 0640 /dev/null "$PERSIST_MARKER"
    stop_containers
    stop_services
    status_json
    ;;
  resume)
    rm -f -- "$PERSIST_MARKER" "$RUNTIME_MARKER"
    start_services
    resume_containers
    status_json
    ;;
  repair)
    if [[ -e "$PERSIST_MARKER" || -e "$RUNTIME_MARKER" ]]; then
      echo "Maintenance mode is active; automatic repair is paused." >&2
      exit 3
    fi
    for unit in "${existing_services[@]}"; do
      systemctl reset-failed "$unit" || true
      if ! systemctl is-active --quiet "$unit"; then
        systemctl start "$unit"
      fi
    done
    resume_containers
    status_json
    ;;
  *)
    echo "Usage: $0 {status|restart-all|stop-until-reboot|maintenance-on|resume|repair}" >&2
    exit 2
    ;;
esac
