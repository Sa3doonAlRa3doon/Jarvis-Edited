export function isLoopbackAddress(value) {
  const address = String(value || '').toLowerCase().replace(/^::ffff:/, '');
  return address === '127.0.0.1' || address === '::1' || address === 'localhost';
}

export function trustedHttpsState({ secure = false, remoteAddress = '', forwardedProto = '' } = {}) {
  if (secure) return true;
  if (!isLoopbackAddress(remoteAddress)) return false;
  return String(forwardedProto || '').split(',')[0].trim().toLowerCase() === 'https';
}

export function privateApiTransportAllowed(input = {}) {
  return isLoopbackAddress(input.remoteAddress) || trustedHttpsState(input);
}
