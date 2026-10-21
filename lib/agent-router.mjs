export const agentRoles = Object.freeze({
  GENERAL: { name: 'JARVIS', instruction: 'Handle everyday assistance and coordinate the other specialist roles.' },
  CODEACT: { name: 'CODEX', instruction: 'Focus on code, debugging, Linux commands, APIs, and technical implementation.' },
  RESEARCH: { name: 'PROSPECTOR', instruction: 'Focus on careful analysis, comparisons, calculations, research plans, and sourced reasoning.' },
  MONITOR: { name: 'SENTINEL', instruction: 'Focus on system health, Docker, services, storage, thermals, and operational diagnostics.' },
  MEMORY: { name: 'ARCHIVIST', instruction: 'Focus on local files, notes, recall, summaries, and private knowledge organization.' },
  FABRICATOR: { name: 'FABRICATOR', instruction: 'Focus on 3D-printer status, Moonraker, jobs, materials, temperatures, and print diagnostics.' },
  CONNECTOR: { name: 'LINK', instruction: 'Focus on authorized Google services such as Gmail, Calendar, Drive, Tasks, and Contacts.' }
});

export function resolvePrimaryModel(environment = {}) {
  return environment.JARVIS_MODEL || environment.GENERAL_MODEL || environment.CODING_MODEL || environment.REASONING_MODEL || 'llama3.2:1b';
}

export function routePrompt(prompt, primaryModel) {
  const text = String(prompt || '').toLowerCase();
  let route = 'GENERAL';
  if (/\b(printer|print|printing|klipper|moonraker|nozzle|bed|gcode|filament|resin|slicer|eta)\b/.test(text)) route = 'FABRICATOR';
  else if (/\b(gmail|google calendar|google drive|google tasks|google contacts?|email|calendar event)\b/.test(text)) route = 'CONNECTOR';
  else if (/\b(code|coding|javascript|typescript|python|node\.?js|react|sql|bug|debug|function|class|api|git|shell|bash|powershell|linux command|program)\b/.test(text)) route = 'CODEACT';
  else if (/\b(analy[sz]e|reason|research|compare|strategy|architecture|calculate|equation|math|investigate|sources|citations?)\b/.test(text) || text.length > 700) route = 'RESEARCH';
  else if (/\b(docker|container|compose|service|system health|cpu|ram|storage|disk|temperature|thermal|gpu|uptime|monitor|watch)\b/.test(text)) route = 'MONITOR';
  else if (/\b(remember|recall|memory|archive|notes?|documents?|files?|knowledge base|second brain)\b/.test(text)) route = 'MEMORY';
  return { model: primaryModel, route, agent: agentRoles[route].name };
}
