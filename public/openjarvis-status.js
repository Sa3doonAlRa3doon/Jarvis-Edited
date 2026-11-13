export function openJarvisMemoryLabel(payload = {}) {
  const entries = Number(payload?.memory?.entries);
  if (Number.isFinite(entries) && entries >= 0) return `${Math.round(entries)} ITEMS`;
  const state = String(payload?.memoryStatus?.state || '').toLowerCase();
  if (state === 'cooldown') return 'NATIVE RETRY';
  if (state === 'unavailable') return 'NATIVE OFFLINE';
  return 'LOCAL';
}

export function openJarvisMemoryDetail(payload = {}) {
  const detail = String(payload?.memoryStatus?.error || '').replace(/\s+/g, ' ').trim();
  return detail.slice(0, 180);
}
