import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { firstExistingPath, googleAuthFileCandidates, googleTokenCandidatesForCredentials, resolveGoogleAuthPath } from '../lib/google-file-paths.mjs';
import { googleOAuthClientFromEnvironment, resolveGoogleOAuthConfig } from '../lib/google-oauth-config.mjs';
import { startGoogleOAuthSession } from '../lib/google-oauth-session.mjs';

const { redirectUri: safeRedirectUri, migratedFrom } = resolveGoogleOAuthConfig(process.env);
const fileCandidates = googleAuthFileCandidates(process.env);
const environmentClient = googleOAuthClientFromEnvironment(process.env);
const credentialsPath = environmentClient ? '' : await firstExistingPath(fileCandidates.credentials);
if (!credentialsPath && !environmentClient) throw new Error(`Google OAuth client credentials were not found. Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the private .env, or add a credentials.json file at ${fileCandidates.credentials[0]}.`);
const tokenPath = process.env.GOOGLE_TOKEN_PATH
  ? resolveGoogleAuthPath(process.env.GOOGLE_TOKEN_PATH)
  : await firstExistingPath(credentialsPath
    ? googleTokenCandidatesForCredentials(fileCandidates, credentialsPath, process.env)
    : fileCandidates.tokens)
    || (credentialsPath ? path.join(path.dirname(credentialsPath), 'token.json') : fileCandidates.tokens[0]);
const scopes = [
  'openid', 'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/tasks.readonly', 'https://www.googleapis.com/auth/contacts.readonly'
];

const callbackUri = new URL(safeRedirectUri);

const credentials = credentialsPath ? JSON.parse(await fs.readFile(credentialsPath, 'utf8')) : null;
const client = environmentClient || credentials?.installed || credentials?.web || credentials || {};
if (!client.client_id || !client.client_secret) throw new Error(`Desktop OAuth credentials are invalid: ${credentialsPath}`);

const session = await startGoogleOAuthSession({ client, redirectUri: safeRedirectUri, tokenPath, scopes });
if (migratedFrom) console.warn(`Moved the legacy Google OAuth callback from ${migratedFrom} to ${safeRedirectUri} because the old port is used by the settings backend. Update the registered redirect URI for a web OAuth client.`);
console.log(`Open this URL in your browser. If JARVIS is on the Pi, keep the SSH -L ${callbackUri.port}:${callbackUri.hostname}:${callbackUri.port} tunnel open:`);
console.log(session.authorizationUrl);
await session.completion;
console.log(`Saved a private Google token at ${tokenPath}`);
