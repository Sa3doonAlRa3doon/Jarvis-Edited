/** Preserve time for the routed model to load and produce a complete reply. */
export function localModelAttemptTimeout(remainingMs, attemptsRemaining) {
  const remaining = Math.max(0, Math.floor(Number(remainingMs) || 0));
  if (remaining < 1000) return 0;
  return attemptsRemaining > 1 ? Math.max(1000, Math.floor(remaining * 0.8)) : remaining;
}

export async function askLocalModelCascade({
  modelsToTry = [], selectedModel = '', messages, format,
  timeoutMs = 180_000, fetchChat, now = Date.now
} = {}) {
  const deadline = now() + Math.max(5000, Number(timeoutMs) || 180_000);
  const attemptedModels = [];
  let lastError = new Error('No local model was available.');
  for (let index = 0; index < modelsToTry.length; index += 1) {
    const attemptTimeoutMs = localModelAttemptTimeout(deadline - now(), modelsToTry.length - index);
    if (!attemptTimeoutMs) break;
    const model = modelsToTry[index];
    const body = { model, messages, stream: false, keep_alive: '2m' };
    if (format) body.format = format;
    attemptedModels.push(model);
    try {
      const result = await fetchChat(body, attemptTimeoutMs);
      if (!String(result.message?.content || '').trim()) throw new Error('The local model returned no response.');
      return {
        result, model, attemptedModels,
        fallback: model !== selectedModel ? `The routed model failed at runtime; JARVIS used ${model} instead.` : ''
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
