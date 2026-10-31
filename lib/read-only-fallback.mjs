import { summarizeGoogleTool } from './google-response.mjs';
import { summarizeLocalStatus } from './local-response.mjs';
import { summarizePublicResult } from './public-response.mjs';

function clean(value, limit = 420) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function sourceService(source, prefix) {
  return String(source || '').slice(prefix.length).replace(/-untrusted$/, '').trim();
}

function summarizeWeb(value, label) {
  const results = Array.isArray(value?.results) ? value.results : [];
  if (value?.unavailable) return `${label}: unavailable — ${clean(value.error || 'the provider returned no result.', 260)}`;
  if (!results.length) return `${label}: no public results were returned.`;
  return `${label}: ${results.slice(0, 6).map((item) => {
    const title = clean(item.title || item.name || item.fullName || 'untitled', 140);
    const detail = clean(item.description || item.snippet || item.url || '', 220);
    return detail ? `${title} — ${detail}` : title;
  }).join('; ')}`;
}

/**
 * Produce a bounded answer when the local language model times out after the
 * server has already collected explicit read-only tool evidence. This is not
 * a model response and never invents missing values; it keeps JARVIS useful
 * on CPU-only Pi hosts instead of returning a silent 502.
 */
export function buildReadOnlyFallback({ prompt = '', dataBlocks = [], assignments = [] } = {}) {
  const lines = [
    'I collected the requested read-only evidence, but the local language model timed out while composing a synthesis.',
    'Here is the verified result from each available lane; no external data was changed.'
  ];
  if (assignments.length > 1) {
    lines.push(`Specialist lanes: ${assignments.map((item) => `${clean(item.label, 80)} → ${clean(item.agent, 60)} (${clean(item.model || 'local fallback', 80)})`).join('; ')}.`);
  }
  const blocks = Array.isArray(dataBlocks) ? dataBlocks : [];
  for (const block of blocks) {
    const source = String(block?.source || '');
    const value = block?.value || {};
    if (source.startsWith('google-')) {
      const service = sourceService(source, 'google-');
      lines.push(summarizeGoogleTool({ used: true, service, result: value?.unavailable ? null : value, context: value?.error || '' }));
      continue;
    }
    if (source.startsWith('public-api-')) {
      const service = sourceService(source, 'public-api-');
      lines.push(summarizePublicResult({ used: true, service, result: value?.unavailable ? null : value, context: value?.error || '' }));
      continue;
    }
    if (source === 'local-printer-readonly') {
      lines.push(summarizeLocalStatus('printer', { printer: value }));
      continue;
    }
    if (source === 'local-system-readonly') {
      lines.push(summarizeLocalStatus('host', value));
      if (value?.docker) lines.push(summarizeLocalStatus('docker', { docker: value.docker }));
      continue;
    }
    if (source === 'local-obs-readonly') {
      lines.push(`OBS: ${value?.online ? 'online' : 'offline or not configured'}${value?.state ? `; state ${clean(value.state, 80)}` : ''}.`);
      continue;
    }
    if (source === 'google-news-untrusted') {
      lines.push(summarizeWeb(value, 'Google News'));
      continue;
    }
    if (source === 'public-web-untrusted') {
      lines.push(summarizeWeb(value, 'Public web search'));
      continue;
    }
    lines.push(`${clean(source || 'Read-only lane', 100)} returned explicit evidence, but no compact formatter is available.`);
  }
  if (blocks.length === 0) lines.push(`No tool evidence was available for “${clean(prompt, 180)}”. Retry once the local model is warm.`);
  return lines.join('\n');
}

