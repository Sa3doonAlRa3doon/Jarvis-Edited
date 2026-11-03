import { DEFAULT_LOCAL_PORTS } from './local-ports.mjs';

export const DEFAULT_SETTINGS_BACKEND_PORT = DEFAULT_LOCAL_PORTS.settings;
export const DEFAULT_GOOGLE_OAUTH_PORT = DEFAULT_LOCAL_PORTS.googleOAuth;

function configuredPort(value, fallback, label) {
  if (value == null || String(value).trim() === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`${label} must be an integer port between 1024 and 65535.`);
  }
  return port;
}

function validateRedirectUri(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('GOOGLE_OAUTH_REDIRECT_URI must be a valid local URL.'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password) {
    throw new Error('Google OAuth stays local: GOOGLE_OAUTH_REDIRECT_URI must use http://localhost or http://127.0.0.1.');
  }
  if (!url.port || Number(url.port) < 1024 || Number(url.port) > 65535) throw new Error('GOOGLE_OAUTH_REDIRECT_URI must include a local port between 1024 and 65535.');
  if (url.pathname !== '/') url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

export function resolveGoogleOAuthConfig(environment = {}) {
  const settingsPort = configuredPort(environment.JARVIS_SETTINGS_BACKEND_PORT, DEFAULT_SETTINGS_BACKEND_PORT, 'JARVIS_SETTINGS_BACKEND_PORT');
  let preferredPort = configuredPort(environment.GOOGLE_OAUTH_PORT, DEFAULT_GOOGLE_OAUTH_PORT, 'GOOGLE_OAUTH_PORT');
  const hasExplicitOAuthPort = String(environment.GOOGLE_OAUTH_PORT || '').trim() !== '';
  const configuredRedirect = String(environment.GOOGLE_OAUTH_REDIRECT_URI || '').trim();
  const callbackUri = validateRedirectUri(configuredRedirect || `http://127.0.0.1:${preferredPort}/`);
  const originalRedirectUri = callbackUri.href;
  let migratedFrom = '';

  // 8789 was both the settings service and old Google callback default. Move
  // that legacy redirect to the dedicated preferred OAuth port automatically.
  if (Number(callbackUri.port) === settingsPort) {
    if (preferredPort === settingsPort) {
      preferredPort = DEFAULT_GOOGLE_OAUTH_PORT;
      if (preferredPort === settingsPort) {
        throw new Error(`Google OAuth callback port ${settingsPort} is occupied by the settings backend. Set GOOGLE_OAUTH_PORT to a different port and register the matching loopback redirect URI.`);
      }
    }
    callbackUri.port = String(preferredPort);
    migratedFrom = originalRedirectUri;
  }

  if (Number(callbackUri.port) === settingsPort) {
    throw new Error(`Google OAuth callback port ${settingsPort} conflicts with the settings backend.`);
  }
  if (hasExplicitOAuthPort && Number(callbackUri.port) !== preferredPort) {
    throw new Error(`GOOGLE_OAUTH_PORT (${preferredPort}) must match the port in GOOGLE_OAUTH_REDIRECT_URI (${callbackUri.port}). Register and configure the same loopback port.`);
  }
  return { port: Number(callbackUri.port), redirectUri: callbackUri.href, migratedFrom };
}
