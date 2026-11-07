const COMMON_TOKEN = 'JARVIS_INTERNAL_SERVICE_TOKEN';

export const SERVICE_ENVIRONMENT_KEYS = Object.freeze({
  settings: Object.freeze([COMMON_TOKEN, 'JARVIS_SETTINGS_BACKEND_PORT']),
  camera: Object.freeze([COMMON_TOKEN, 'JARVIS_CAMERA_BACKEND_PORT']),
  microphone: Object.freeze([
    COMMON_TOKEN, 'JARVIS_MIC_BACKEND_PORT', 'API_PORT', 'ENABLE_PI_WAKE_LISTENER',
    'WAKE_PYTHON', 'JARVIS_STT_MODEL_DIR', 'JARVIS_STT_COMMAND_TIMEOUT_MS',
    'JARVIS_STT_COMMAND_SILENCE_MS', 'JARVIS_STT_ACK_TIMEOUT_MS',
    'JARVIS_STT_POST_ACK_GUARD_MS', 'PI_WAKE_ENERGY_FLOOR',
    'PI_WAKE_NOISE_MULTIPLIER', 'PI_WAKE_PEAK_FLOOR', 'PI_WAKE_PEAK_RATIO'
  ]),
  frontend: Object.freeze([
    COMMON_TOKEN, 'HOST', 'PORT', 'API_HOST', 'API_PORT', 'TRUSTED_DASHBOARD_PROXY_IPS'
  ])
});

function safeValue(value, key) {
  const text = String(value ?? '');
  if (/[\0\r\n]/.test(text)) throw new Error(`Service environment value for ${key} contains a forbidden control character.`);
  return text;
}

export function buildServiceEnvironment(source, service) {
  const keys = SERVICE_ENVIRONMENT_KEYS[service];
  if (!keys) throw new Error(`Unknown JARVIS service environment: ${service}`);
  const output = {};
  for (const key of keys) {
    if (Object.hasOwn(source || {}, key)) output[key] = safeValue(source[key], key);
  }
  return output;
}

export function serializeSystemdEnvironment(values) {
  return `${Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(safeValue(value, key))}`).join('\n')}\n`;
}
