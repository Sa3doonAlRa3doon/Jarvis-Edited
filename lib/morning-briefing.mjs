function clean(value, limit = 240) {
  return String(value ?? '').replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function isMorningBriefingPrompt(prompt) {
  const text = clean(prompt, 500).toLowerCase();
  return /^\s*(?:good\s+)?morning(?:\s+jarvis)?[!.]?\s*$/.test(text)
    || /^\s*start\s+(?:my|the)\s+day[!.]?\s*$/.test(text)
    || /\b(?:morning|daily|start(?:ing)?\s+the\s+day|today'?s?)\b.*\b(?:briefing|digest|overview|update)\b/.test(text)
    || /\b(?:morning|daily)\s+(?:brief|digest)\b/.test(text)
    || /\bbrief\s+me\b/.test(text);
}

function percent(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${Math.round(parsed)}%` : 'N/A';
}

function countOnline(services) {
  const values = Object.values(services || {});
  const online = values.filter((item) => item?.online).length;
  return `${online}/${values.length || 0}`;
}

function duration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return 'unavailable';
  const minutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
}

function eventTime(value) {
  const date = new Date(String(value || ''));
  if (!Number.isFinite(date.getTime())) return 'time unavailable';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
}

export function buildMorningBriefing({ location = 'Dubai', metrics = {}, services = {}, weather = null, news = null, calendar = null, printer = null, docker = null } = {}) {
  const safeLocation = clean(location, 100) || 'your default location';
  const lines = ['Good morning. Here is your local JARVIS briefing.'];
  const sections = [];

  const health = `System: CPU ${percent(metrics.cpu?.percent)}, RAM ${percent(metrics.memory?.percent)}, services ${countOnline(services)} online.`;
  sections.push({ id: 'system', label: 'SYSTEM', text: health }); lines.push(health);

  if (weather?.result?.current) {
    const current = weather.result.current;
    const weatherText = `Weather in ${clean(weather.result.location?.name || safeLocation, 100)}: ${current.temperatureC ?? 'N/A'}°C, ${clean(current.condition || 'conditions unavailable', 80)}, humidity ${current.humidityPercent ?? 'N/A'}%.`;
    sections.push({ id: 'weather', label: 'WEATHER', text: weatherText }); lines.push(weatherText);
  } else {
    const weatherText = `Weather in ${safeLocation}: unavailable right now.`;
    sections.push({ id: 'weather', label: 'WEATHER', text: weatherText }); lines.push(weatherText);
  }

  if (printer?.configured) {
    const progress = Number(printer.progress);
    const progressText = Number.isFinite(progress) ? `${Math.round(progress * 100)}%` : 'progress unavailable';
    const printerText = printer.online
      ? `Printer: ${clean(printer.state || 'ready', 40)}, ${progressText}, ETA ${duration(printer.remaining)}${printer.filename ? `, ${clean(printer.filename, 100)}` : ''}.`
      : 'Printer: configured but offline.';
    sections.push({ id: 'printer', label: 'PRINTER', text: printerText }); lines.push(printerText);
  }

  if (docker) {
    const containers = Array.isArray(docker.containers) ? docker.containers : [];
    const running = containers.filter((item) => /running|up/i.test(`${item?.state || ''} ${item?.status || ''}`)).length;
    const unhealthy = containers.filter((item) => /unhealthy|exited|dead|failed/i.test(`${item?.state || ''} ${item?.status || ''}`)).length;
    const dockerText = `Docker: ${running}/${containers.length} containers running${unhealthy ? `, ${unhealthy} need attention` : ', no unhealthy containers detected'}.`;
    sections.push({ id: 'docker', label: 'DOCKER', text: dockerText }); lines.push(dockerText);
  }

  if (Array.isArray(news?.results) && news.results.length) {
    const headlines = news.results.slice(0, 3).map((item) => clean(item.title, 140)).filter(Boolean);
    const newsText = `News: ${headlines.length} current ${clean(news.query || 'technology', 80)} headlines. ${headlines.join(' | ')}`;
    sections.push({ id: 'news', label: 'NEWS', text: newsText }); lines.push(newsText);
  } else {
    const newsText = 'News: no current headlines were available.';
    sections.push({ id: 'news', label: 'NEWS', text: newsText }); lines.push(newsText);
  }

  const events = Array.isArray(calendar?.result?.events) ? calendar.result.events : [];
  let calendarText = 'Calendar: Google Calendar is not currently connected, so no agenda was read.';
  if (calendar?.result) {
    if (!events.length) calendarText = 'Calendar: no upcoming events were returned.';
    else {
      const agenda = events.slice(0, 3).map((item) => `${eventTime(item.start)} ${clean(item.title || '(untitled event)', 100)}`);
      calendarText = `Calendar: ${events.length} upcoming event${events.length === 1 ? '' : 's'}. ${agenda.join(' | ')}`;
    }
  }
  sections.push({ id: 'calendar', label: 'CALENDAR', text: calendarText }); lines.push(calendarText);
  lines.push('This briefing was read-only; no messages, files, devices, or services were changed.');

  const citations = [...(weather?.citations || []), ...(news?.citations || []), ...(calendar?.citations || [])]
    .filter((item) => /^https?:\/\//i.test(String(item || ''))).filter((item, index, list) => list.indexOf(item) === index).slice(0, 10);
  return { content: lines.join(' '), sections, citations };
}

