import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const port = Number(process.env.GOOGLE_OAUTH_PORT || 8789);
const redirectUri = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || `http://127.0.0.1:${port}/`).trim();
const authDirectory = process.env.GOOGLE_AUTH_DIRECTORY || path.join(os.homedir(), 'jarvis-google');
const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || path.join(authDirectory, 'credentials.json');
const tokenPath = process.env.GOOGLE_TOKEN_PATH || path.join(authDirectory, 'token.json');
const scopes = [
  'openid', 'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/tasks.readonly', 'https://www.googleapis.com/auth/contacts.readonly'
];

function validateRedirectUri(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('GOOGLE_OAUTH_REDIRECT_URI must be a valid local URL.'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('Google OAuth stays local: GOOGLE_OAUTH_REDIRECT_URI must use http://localhost or http://127.0.0.1.');
  }
  if (!url.port || Number(url.port) < 1024 || Number(url.port) > 65535) throw new Error('GOOGLE_OAUTH_REDIRECT_URI must include a local port between 1024 and 65535.');
  if (url.pathname !== '/') url.pathname = '/';
  url.search = ''; url.hash = '';
  return url;
}

const callbackUri = validateRedirectUri(redirectUri);
const safeRedirectUri = callbackUri.href;

const credentials = JSON.parse(await fs.readFile(credentialsPath, 'utf8'));
const client = credentials.installed || credentials.web || credentials;
if (!client.client_id || !client.client_secret) throw new Error(`Desktop OAuth credentials are invalid: ${credentialsPath}`);

const state = crypto.randomBytes(24).toString('base64url');
const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authorize.search = new URLSearchParams({
  client_id: client.client_id, redirect_uri: safeRedirectUri, response_type: 'code', access_type: 'offline', prompt: 'consent',
  include_granted_scopes: 'true', scope: scopes.join(' '), state
}).toString();

const callback = new Promise((resolve, reject) => {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, safeRedirectUri);
    if (url.pathname !== '/') { response.writeHead(404).end(); return; }
    if (url.searchParams.get('state') !== state) { response.writeHead(403).end('OAuth state mismatch.'); reject(new Error('OAuth state mismatch.')); server.close(); return; }
    const error = url.searchParams.get('error');
    const code = url.searchParams.get('code');
    if (error || !code) { response.writeHead(400).end('Google authorization was not completed.'); reject(new Error(error || 'Google returned no authorization code.')); server.close(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>JARVIS Google connected</title><h1>Google connected to JARVIS</h1><p>You can close this tab.</p>');
    resolve(code); server.close();
  });
  server.listen(Number(callbackUri.port), callbackUri.hostname);
  server.on('error', reject);
  setTimeout(() => { server.close(); reject(new Error('Authorization timed out after ten minutes.')); }, 10 * 60_000).unref();
});

console.log(`Open this URL in your browser. If JARVIS is on the Pi, keep the SSH -L ${callbackUri.port}:${callbackUri.hostname}:${callbackUri.port} tunnel open:`);
console.log(authorize.toString());
const code = await callback;
const exchange = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ code, client_id: client.client_id, client_secret: client.client_secret, redirect_uri: safeRedirectUri, grant_type: 'authorization_code' })
});
const payload = await exchange.json().catch(() => ({}));
if (!exchange.ok || !payload.access_token) throw new Error(`Token exchange failed (HTTP ${exchange.status}).`);
let previous = {};
try { previous = JSON.parse(await fs.readFile(tokenPath, 'utf8')); } catch {}
const token = {
  access_token: payload.access_token, refresh_token: payload.refresh_token || previous.refresh_token,
  scope: payload.scope || scopes.join(' '), token_type: payload.token_type || 'Bearer',
  expiry_date: Date.now() + Number(payload.expires_in || 3600) * 1000
};
if (!token.refresh_token) throw new Error('Google returned no refresh token. Revoke the old grant and run this command again.');
await fs.mkdir(path.dirname(tokenPath), { recursive: true, mode: 0o700 });
await fs.writeFile(tokenPath, `${JSON.stringify(token, null, 2)}\n`, { mode: 0o600 });
await fs.chmod(tokenPath, 0o600);
console.log(`Saved a private Google token with Gmail send approval at ${tokenPath}`);
