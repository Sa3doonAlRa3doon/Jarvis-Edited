#!/usr/bin/env bash
set -u

# Read-only Raspberry Pi acceptance check. It deliberately does not source
# .env, so shell syntax or secrets in that file can never become commands.
# Optional printer/OBS/camera hardware is reported as a blocker, not touched.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${JARVIS_ENV_PATH:-$ROOT_DIR/.env}"
STRICT=0
if [[ "${1:-}" == "--strict" ]]; then STRICT=1; fi

PASS=0
WARN=0
FAIL=0

log_pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
log_warn() { WARN=$((WARN + 1)); printf 'WARN  %s\n' "$1"; }
log_fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }

env_value() {
  local key="$1" line value
  [[ -r "$ENV_FILE" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*${key}= ]] || continue
    value="${line#*=}"
    value="${value%$'\r'}"
    value="${value#\"}"; value="${value%\"}"
    value="${value#'}"; value="${value%'}"
    printf '%s' "$value"
    return 0
  done < "$ENV_FILE"
}

http_ok() {
  local url="$1"
  curl -fsS --max-time 5 --output /dev/null "$url" 2>/dev/null
}

printf 'JARVIS PI ACCEPTANCE // read-only // %s\n' "$(date -Is 2>/dev/null || date)"
printf 'ROOT: %s\n' "$ROOT_DIR"

if [[ "$(uname -s 2>/dev/null)" != "Linux" ]]; then
  log_fail "Linux host required; this check is for Raspberry Pi OS/Ubuntu."
elif [[ "$(uname -m 2>/dev/null)" == "aarch64" || "$(uname -m 2>/dev/null)" == "arm64" ]]; then
  log_pass "64-bit ARM host ($(uname -m))"
else
  log_warn "Host architecture is $(uname -m); expected aarch64 for Pi 5."
fi

for tool in curl node; do
  if command -v "$tool" >/dev/null 2>&1; then log_pass "$tool available"; else log_fail "$tool is missing"; fi
done

if command -v ollama >/dev/null 2>&1; then
  log_pass "Ollama available"
else
  log_fail "Ollama is missing"
fi

PORT="$(env_value PORT)"; PORT="${PORT:-8788}"
OLLAMA_BASE_URL="$(env_value OLLAMA_BASE_URL)"; OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
OPENJARVIS_BASE_URL="$(env_value OPENJARVIS_BASE_URL)"; OPENJARVIS_BASE_URL="${OPENJARVIS_BASE_URL:-http://127.0.0.1:8000}"
PRINTER_URL="$(env_value PRINTER_URL)"
PRINTER_CAMERA_URL="$(env_value PRINTER_CAMERA_URL)"
PRINTER_API_KEY="$(env_value PRINTER_API_KEY)"
VISION_MODEL="$(env_value JARVIS_VISION_MODEL)"; VISION_MODEL="${VISION_MODEL:-qwen2.5vl:3b}"
STT_MODEL_DIR="$(env_value JARVIS_STT_MODEL_DIR)"
WAKE_PYTHON="$(env_value WAKE_PYTHON)"; WAKE_PYTHON="${WAKE_PYTHON:-$ROOT_DIR/.wake-venv/bin/python}"

if http_ok "http://127.0.0.1:${PORT}/api/health"; then log_pass "JARVIS dashboard health"; else log_fail "JARVIS dashboard health at port ${PORT}"; fi
if http_ok "${OLLAMA_BASE_URL%/}/api/tags"; then log_pass "Ollama HTTP health"; else log_fail "Ollama HTTP health"; fi
if http_ok "${OPENJARVIS_BASE_URL%/}/health"; then log_pass "OpenJarvis health"; else log_warn "OpenJarvis health unavailable (Ollama fallback can still work)"; fi

if command -v ollama >/dev/null 2>&1; then
  MODEL_LIST="$(ollama list 2>/dev/null || true)"
  if printf '%s\n' "$MODEL_LIST" | awk 'NR > 1 { print $1 }' | grep -Fxq "$VISION_MODEL"; then
    log_pass "Vision model installed: ${VISION_MODEL}"
    SHOW_JSON="$(curl -fsS --max-time 5 -H 'Content-Type: application/json' -d "{\"model\":\"${VISION_MODEL}\"}" "${OLLAMA_BASE_URL%/}/api/show" 2>/dev/null || true)"
    if [[ "$SHOW_JSON" == *'"capabilities"'* ]]; then
      if printf '%s' "$SHOW_JSON" | grep -Eqi '"capabilities"[[:space:]]*:[[:space:]]*\[[^]]*(vision|image|multimodal)'; then
        log_pass "Vision capability advertised by Ollama"
      else
        log_fail "Configured model is installed but Ollama does not advertise image input: ${VISION_MODEL}"
      fi
    elif [[ "$VISION_MODEL" =~ (vision|vl|llava|bakllava|moondream|gemma3) ]]; then
      log_warn "Ollama metadata did not expose capabilities; vision tag fallback will be used"
    else
      log_warn "Ollama vision capability could not be verified"
    fi
  else
    log_fail "Vision model missing: ${VISION_MODEL}; run npm run vision:install"
  fi
  if [[ "$(env_value OLLAMA_MAX_LOADED_MODELS)" == "1" ]]; then
    log_pass "Ollama resident-model limit is 1"
  else
    log_warn "OLLAMA_MAX_LOADED_MODELS is not 1; Pi 5 memory pressure may increase"
  fi
fi

if command -v python3 >/dev/null 2>&1 && python3 "$ROOT_DIR/scripts/verify-pi-wake.py" >/dev/null 2>&1; then
  log_pass "Pi wake score-window policy"
else
  log_warn "Pi wake policy check unavailable"
fi

if [[ -n "$STT_MODEL_DIR" ]]; then
  if [[ -f "$STT_MODEL_DIR/am/final.mdl" ]]; then
    log_pass "Local Vosk command model present"
    if [[ -x "$WAKE_PYTHON" ]] && "$WAKE_PYTHON" -c 'import vosk' >/dev/null 2>&1; then
      log_pass "Local Vosk runtime available"
    else
      log_warn "Vosk model is present but the configured local Python runtime cannot import vosk"
    fi
  else
    log_fail "JARVIS_STT_MODEL_DIR is configured but the Vosk model is incomplete"
  fi
else
  log_warn "Local command transcription is not configured (run ./install-pi.sh --stt when ready)"
fi

if command -v v4l2-ctl >/dev/null 2>&1; then
  VIDEO_COUNT="$(v4l2-ctl --list-devices 2>/dev/null | grep -c '/dev/video' || true)"
  if [[ "${VIDEO_COUNT:-0}" -gt 0 ]]; then log_pass "V4L2 camera devices visible (${VIDEO_COUNT})"; else log_warn "No V4L2 camera detected"; fi
else
  log_warn "v4l2-ctl unavailable; camera enumeration not verified"
fi

if command -v arecord >/dev/null 2>&1; then
  if arecord -l 2>/dev/null | grep -q '^card '; then log_pass "ALSA microphone devices visible"; else log_warn "No ALSA capture device detected"; fi
else
  log_warn "arecord unavailable; microphone enumeration not verified"
fi

if [[ -n "$PRINTER_URL" ]]; then
  if http_ok "$PRINTER_URL"; then log_pass "Printer endpoint reachable"; else log_warn "Printer endpoint not reachable (printer may be off)"; fi
else
  log_warn "PRINTER_URL is not configured"
fi

# Read-only camera probe. Prefer an explicitly configured snapshot endpoint;
# otherwise try the bounded same-host Fluidd/Mainsail paths used by the Node
# dashboard. A printer camera is optional, so a powered-off printer is a
# warning rather than a false Pi acceptance failure. The API key, when set,
# is sent only to the printer and never printed.
printer_snapshot_ok() {
  local target="$1" headers
  if [[ -n "$PRINTER_API_KEY" ]]; then
    headers="$(curl -fsS --max-time 5 -D - -o /dev/null -H "X-Api-Key: ${PRINTER_API_KEY}" "$target" 2>/dev/null || true)"
  else
    headers="$(curl -fsS --max-time 5 -D - -o /dev/null "$target" 2>/dev/null || true)"
  fi
  printf '%s\n' "$headers" | grep -Eiq '^content-type:[[:space:]]*image/(jpeg|png|webp|gif)'
}

if [[ -n "$PRINTER_URL" ]]; then
  CAMERA_CANDIDATES=()
  if [[ -n "$PRINTER_CAMERA_URL" ]]; then
    CAMERA_CANDIDATES+=("$PRINTER_CAMERA_URL")
  else
    PRINTER_BASE="${PRINTER_URL%/}"
    CAMERA_CANDIDATES+=("${PRINTER_BASE}/webcam/?action=snapshot" "${PRINTER_BASE}/webcam2/?action=snapshot")
    if [[ "$PRINTER_BASE" == *":4408" ]]; then
      CAMERA_CANDIDATES+=("${PRINTER_BASE%:4408}:4409/webcam/?action=snapshot" "${PRINTER_BASE%:4408}:4409/webcam2/?action=snapshot")
    fi
  fi
  CAMERA_FOUND=0
  for CAMERA_TARGET in "${CAMERA_CANDIDATES[@]}"; do
    if printer_snapshot_ok "$CAMERA_TARGET"; then CAMERA_FOUND=1; break; fi
  done
  if [[ "$CAMERA_FOUND" -eq 1 ]]; then log_pass "Printer camera snapshot reachable"; else log_warn "Printer camera snapshot not found (camera may be off or endpoint may be custom)"; fi
else
  log_warn "Printer camera discovery skipped because PRINTER_URL is not configured"
fi

if [[ -n "$(env_value OBS_WEBSOCKET_URL)" ]]; then log_pass "OBS endpoint configured (control remains approval-gated)"; else log_warn "OBS WebSocket is not configured"; fi

printf 'SUMMARY // pass=%s warn=%s fail=%s\n' "$PASS" "$WARN" "$FAIL"
if [[ "$FAIL" -gt 0 && "$STRICT" -eq 1 ]]; then exit 1; fi
exit 0
