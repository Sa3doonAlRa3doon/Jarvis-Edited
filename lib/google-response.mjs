function clean(value, limit = 240) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function displayDate(value) {
  const source = String(value || '').trim();
  if (!source) return '';
  const parsed = new Date(source);
  return Number.isNaN(parsed.getTime()) ? clean(source, 80) : parsed.toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' });
}

function unavailableMessage(context) {
  const raw = clean(context, 700)
    .replace(/^Google tool status:\s*unavailable for this request\.\s*/i, '')
    .replace(/\s*Explain this honestly and do not invent Google data\.?\s*$/i, '')
    .replace(/\.+$/, '.');
  return `I couldn't read Google right now. ${raw || 'The Google connector did not return a result.'} No Google data was changed.`;
}

export function summarizeGoogleResult(result) {
  if (!result || typeof result !== 'object') return 'Google did not return a result.';
  if (result.service === 'gmail') {
    const messages = Array.isArray(result.messages) ? result.messages : [];
    if (!messages.length) return `Gmail is connected, but I found no messages for “${clean(result.query || 'the requested search', 120)}”.`;
    const lines = messages.slice(0, 6).map((item) => {
      const parts = [clean(item.subject || '(no subject)', 140), clean(item.from, 120), displayDate(item.date)].filter(Boolean);
      const snippet = clean(item.snippet, 220);
      return `- ${parts.join(' — ')}${snippet ? `: ${snippet}` : ''}`;
    });
    return `I found ${messages.length} Gmail message${messages.length === 1 ? '' : 's'}${result.query ? ` for “${clean(result.query, 120)}”` : ''}.\n${lines.join('\n')}\nThese are read-only results; nothing was sent or changed.`;
  }
  if (result.service === 'calendar') {
    const events = Array.isArray(result.events) ? result.events : [];
    if (!events.length) return 'Google Calendar is connected, but there are no upcoming events in the requested window.';
    return `I found ${events.length} upcoming calendar event${events.length === 1 ? '' : 's'}.\n${events.slice(0, 10).map((item) => `- ${clean(item.title || '(untitled event)', 160)}${displayDate(item.start) ? ` — ${displayDate(item.start)}` : ''}${clean(item.location, 140) ? ` — ${clean(item.location, 140)}` : ''}`).join('\n')}\nNo calendar changes were made.`;
  }
  if (result.service === 'drive') {
    const files = Array.isArray(result.files) ? result.files : [];
    if (!files.length) return `Google Drive is connected, but I found no matching files${result.query ? ` for “${clean(result.query, 120)}”` : ''}.`;
    return `I found ${files.length} Drive file${files.length === 1 ? '' : 's'}${result.query ? ` for “${clean(result.query, 120)}”` : ''}.\n${files.slice(0, 10).map((item) => `- ${clean(item.name || '(unnamed file)', 180)}${displayDate(item.modified) ? ` — modified ${displayDate(item.modified)}` : ''}`).join('\n')}\nNo Drive files were changed.`;
  }
  if (result.service === 'tasks') {
    const tasks = Array.isArray(result.tasks) ? result.tasks : [];
    if (!tasks.length) return 'Google Tasks is connected, but there are no open tasks.';
    return `I found ${tasks.length} open task${tasks.length === 1 ? '' : 's'}.\n${tasks.slice(0, 12).map((item) => `- ${clean(item.title || '(untitled task)', 180)}${displayDate(item.due) ? ` — due ${displayDate(item.due)}` : ''}`).join('\n')}\nNo tasks were changed.`;
  }
  if (result.service === 'contacts') {
    const contacts = Array.isArray(result.contacts) ? result.contacts : [];
    if (!contacts.length) return `Google Contacts is connected, but I found no matching contacts${result.query ? ` for “${clean(result.query, 120)}”` : ''}.`;
    return `I found ${contacts.length} contact${contacts.length === 1 ? '' : 's'}${result.query ? ` for “${clean(result.query, 120)}”` : ''}.\n${contacts.slice(0, 12).map((item) => `- ${clean(item.name || '(unnamed contact)', 160)}${clean(item.email, 160) ? ` — ${clean(item.email, 160)}` : ''}${clean(item.phone, 80) ? ` — ${clean(item.phone, 80)}` : ''}`).join('\n')}\nNo contacts were changed.`;
  }
  return `Google ${clean(result.service || 'workspace', 80)} returned read-only data. No changes were made.`;
}

export function summarizeGoogleTool(google) {
  if (!google?.used) return '';
  return google.result ? summarizeGoogleResult(google.result) : unavailableMessage(google.context);
}
