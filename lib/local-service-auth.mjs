import crypto from 'node:crypto';

export function isInternalServiceRequest(request, expectedToken) {
  const expected = String(expectedToken || '');
  const supplied = String(request.get?.('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || !supplied || supplied.length !== expected.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)); }
  catch { return false; }
}

export function requireInternalServiceAuth(expectedToken) {
  return (request, response, next) => {
    if (isInternalServiceRequest(request, expectedToken)) return next();
    response.status(expectedToken ? 401 : 503).json({ error: expectedToken ? 'Local service authentication required.' : 'Local service token is not configured.' });
  };
}

export function internalServiceHeaders(token, extra = {}) {
  return { ...extra, Authorization: `Bearer ${String(token || '')}` };
}
