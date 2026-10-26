export const MCP_TOOL_PREFIX = 'jarvis_';

export function prefixToolName(value) {
  const name = String(value || '');
  if (!name || name.startsWith(MCP_TOOL_PREFIX)) return name;
  return `${MCP_TOOL_PREFIX}${name}`;
}

export function stripToolPrefix(value) {
  const name = String(value || '');
  return name.startsWith(MCP_TOOL_PREFIX) ? name.slice(MCP_TOOL_PREFIX.length) : name;
}

function transformJsonLine(line, transform) {
  const source = String(line || '');
  try {
    const payload = JSON.parse(source);
    transform(payload);
    return JSON.stringify(payload).replace(/[\u0080-\uFFFF]/g, (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
    );
  } catch {
    return source;
  }
}

export function browserRequestToUpstream(line) {
  return transformJsonLine(line, (payload) => {
    if (payload?.method === 'tools/call' && payload.params?.name) {
      payload.params.name = stripToolPrefix(payload.params.name);
    }
  });
}

export function browserResponseToClient(line) {
  return transformJsonLine(line, (payload) => {
    if (!Array.isArray(payload?.result?.tools)) return;
    for (const tool of payload.result.tools) {
      if (tool && typeof tool === 'object' && tool.name) tool.name = prefixToolName(tool.name);
    }
  });
}
