import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

function oauthError(message) {
  return Object.assign(new Error(message), { safeOAuth: true });
}

async function saveToken(tokenPath, clientId, payload, scopes) {
  let previous = {};
  try { previous = JSON.parse(await fs.readFile(tokenPath, 'utf8')); } catch {}
  const refreshToken = payload.refresh_token || (previous.client_id === clientId ? previous.refresh_token : '');
  if (!refreshToken) throw oauthError('Google returned no refresh token for this client. Reauthorize with consent before trying again.');
  const lifetime = Math.max(60, Math.min(86_400, Number(payload.expires_in) || 3600));
  const token = {
    client_id: clientId,
    access_token: payload.access_token,
    refresh_token: refreshToken,
    scope: payload.scope || scopes.join(' '),
    token_type: payload.token_type || 'Bearer',
    expiry_date: Date.now() + lifetime * 1000
  };
  const directory = path.dirname(tokenPath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = path.join(directory, `.google-token-${crypto.randomBytes(12).toString('hex')}.tmp`);
  let file;
  try {
    file = await fs.open(temporaryPath, 'wx', 0o600);
    await file.writeFile(`${JSON.stringify(token, null, 2)}\n`);
    await file.sync();
    await file.close();
    file = null;
    await fs.rename(temporaryPath, tokenPath);
    await fs.chmod(tokenPath, 0o600);
  } finally {
    await file?.close().catch(() => {});
    await fs.unlink(temporaryPath).catch(() => {});
  }
}

// The URL is returned only after the loopback listener is ready. The callback
// reports success only after the exchange and private atomic token write finish.
export async function startGoogleOAuthSession({
  client, redirectUri, tokenPath, scopes, fetchImpl = globalThis.fetch,
  timeoutMs = 10 * 60_000, tokenTimeoutMs = 15_000
}) {
  const callbackUri = new URL(redirectUri);
  if (callbackUri.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(callbackUri.hostname)
    || callbackUri.username || callbackUri.password || callbackUri.search || callbackUri.hash) {
    throw oauthError('Google OAuth callback must be a plain loopback URL without query parameters.');
  }
  if (!client?.client_id || !client?.client_secret) throw oauthError('Google OAuth client credentials are incomplete.');
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const controller = new AbortController();
  let resolveCompletion, rejectCompletion, timer, processing = false, finished = false;
  const completion = new Promise((resolve, reject) => { resolveCompletion = resolve; rejectCompletion = reject; });
  // A listen error can occur before the caller has received this promise.
  completion.catch(() => {});
  const server = http.createServer({ maxHeaderSize: 8192 }, (request, response) => { void handleCallback(request, response); });
  function finish(error) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    controller.abort();
    server.close();
    server.closeIdleConnections?.();
    if (error) rejectCompletion(error);
    else resolveCompletion({ saved: true, tokenPath });
  }
  function page(response, status, message) {
    response.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    });
    response.end(`<!doctype html><title>JARVIS Google authorization</title><h1>${message}</h1><p>Return to JARVIS Settings to verify Google access.</p>`);
  }
  async function handleCallback(request, response) {
    if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }).end(); return; }
    if (String(request.url).length > 8192) { response.writeHead(414).end(); return; }
    let incoming;
    try { incoming = new URL(request.url, callbackUri); } catch { response.writeHead(400).end(); return; }
    if (incoming.origin !== callbackUri.origin || incoming.pathname !== callbackUri.pathname) { response.writeHead(404).end(); return; }
    const returnedState = Buffer.from(incoming.searchParams.get('state') || '');
    const expectedState = Buffer.from(state);
    if (returnedState.length !== expectedState.length || !crypto.timingSafeEqual(returnedState, expectedState)) {
      page(response, 403, 'This authorization response does not match the active request.');
      return; // A stray request must not cancel the legitimate consent window.
    }
    if (finished || processing) { response.writeHead(409).end(); return; }
    const code = incoming.searchParams.get('code');
    if (incoming.searchParams.has('error') || !code || code.length > 4096) {
      page(response, 400, 'Google authorization was not completed.');
      finish(oauthError('Google authorization was not completed.'));
      return;
    }
    processing = true;
    clearTimeout(timer);
    try {
      let exchange, payload;
      try {
        exchange = await fetchImpl('https://oauth2.googleapis.com/token', {
          method: 'POST', redirect: 'error',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(tokenTimeoutMs)]),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: client.client_id, client_secret: client.client_secret,
            redirect_uri: callbackUri.href, grant_type: 'authorization_code', code_verifier: verifier })
        });
        payload = await exchange.json().catch(() => ({}));
      } catch { throw oauthError('Google token exchange timed out or the network was unavailable.'); }
      if (!exchange.ok || typeof payload.access_token !== 'string' || !payload.access_token) {
        throw oauthError(`Google token exchange failed (HTTP ${exchange.status}).`);
      }
      await saveToken(tokenPath, client.client_id, payload, scopes);
      page(response, 200, 'Google connected to JARVIS.');
      finish();
    } catch (error) {
      const safeError = error?.safeOAuth ? error : oauthError('Google authorization could not be saved. Check the private token directory permissions and retry.');
      page(response, 502, safeError.message);
      finish(safeError);
    }
  }
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(callbackUri.port), callbackUri.hostname, resolve);
  });
  callbackUri.port = String(server.address().port);
  server.on('error', () => finish(oauthError('Google OAuth callback listener failed.')));
  timer = setTimeout(() => finish(oauthError('Authorization timed out after ten minutes.')), timeoutMs);
  timer.unref();
  const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorize.search = new URLSearchParams({ client_id: client.client_id, redirect_uri: callbackUri.href,
    response_type: 'code', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
    scope: scopes.join(' '), state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
  return { authorizationUrl: authorize.href, completion,
    stop: () => finish(oauthError('Google authorization was cancelled.')) };
}
