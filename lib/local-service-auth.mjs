import crypto from 'node:crypto';

export function serviceTokenMatches(suppliedToken, expectedToken) {
  const expected = String(expectedToken || '');
  const supplied = String(suppliedToken || '');
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length > 0 && suppliedBytes.length === expectedBytes.length
    && crypto.timingSafeEqual(suppliedBytes, expectedBytes);
}

export function isInternalServiceRequest(request, expectedToken) {
  const supplied = String(request.get?.('Authorization') || '').replace(/^Bearer\s+/i, '');
  return serviceTokenMatches(supplied, expectedToken);
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
