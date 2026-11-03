import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { firstExistingPath, googleAuthFileCandidates, googleTokenCandidatesForCredentials } from '../lib/google-file-paths.mjs';
import { resolveGoogleOAuthConfig } from '../lib/google-oauth-config.mjs';

const { redirectUri: safeRedirectUri, migratedFrom } = resolveGoogleOAuthConfig(process.env);
const fileCandidates = googleAuthFileCandidates(process.env);
const credentialsPath = await firstExistingPath(fileCandidates.credentials);
if (!credentialsPath) throw new Error(`Google Desktop OAuth credentials were not found at ${fileCandidates.credentials[0]}.`);
const tokenPath = process.env.GOOGLE_TOKEN_PATH
  ? path.resolve(process.env.GOOGLE_TOKEN_PATH)
  : await firstExistingPath(googleTokenCandidatesForCredentials(fileCandidates, credentialsPath, process.env))
    || path.join(path.dirname(credentialsPath), 'token.json');
const scopes = [
  'openid', 'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/tasks.readonly', 'https://www.googleapis.com/auth/contacts.readonly'
];

const callbackUri = new URL(safeRedirectUri);

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

if (migratedFrom) console.warn(`Moved the legacy Google OAuth callback from ${migratedFrom} to ${safeRedirectUri} because the old port is used by the settings backend. Update the registered redirect URI for a web OAuth client.`);
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
