import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function resolveGoogleAuthPath(value) {
  const candidate = String(value ?? '').trim();
  if (!candidate) return '';
  if (process.platform !== 'win32' && path.win32.isAbsolute(candidate)) return path.win32.normalize(candidate);
  return path.resolve(candidate);
}

function uniquePaths(values) {
  return [...new Set(values.filter(Boolean).map(resolveGoogleAuthPath))];
}

export function googleAuthFileCandidates(environment = {}, home = os.homedir()) {
  const roots = uniquePaths([
    environment.GOOGLE_AUTH_DIRECTORY,
    path.join(home, 'jarvis-google'),
    path.join(home, 'Documents', 'Jarvis-Google-Auth')
  ]);
  return {
    credentials: uniquePaths([environment.GOOGLE_CREDENTIALS_PATH, ...roots.map((root) => path.join(root, 'credentials.json'))]),
    tokens: uniquePaths([environment.GOOGLE_TOKEN_PATH, ...roots.map((root) => path.join(root, 'token.json'))])
  };
}

export function googleTokenCandidatesForCredentials(candidates, credentialsPath, environment = {}) {
  const configuredToken = environment.GOOGLE_TOKEN_PATH ? [environment.GOOGLE_TOKEN_PATH] : [];
  const matchingToken = credentialsPath ? [path.join(path.dirname(credentialsPath), 'token.json')] : [];
  return uniquePaths([...configuredToken, ...matchingToken, ...candidates.tokens]);
}

export async function firstExistingPath(candidates, access = fs.access) {
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch {}
  }
  return '';
}
