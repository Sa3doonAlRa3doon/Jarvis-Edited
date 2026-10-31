function clean(value, limit = 140) {
  return String(value ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function count(value) {
  return Array.isArray(value) ? value.length : Math.max(0, Number(value) || 0);
}

/**
 * Build the independent JARVIS stats surface from already-authorized local
 * snapshots. External viewer/chat/social values remain explicitly read-only
 * and unavailable until a connector is configured; this function never
 * fabricates a stream or claims that Dexter is connected.
 */
export function buildStatsDeck({ obs = {}, broadcast = {}, media = {}, desktop = {}, agents = {}, voice = {} } = {}) {
  const activities = broadcast.activities || {};
  const chat = broadcast.chat || {};
  const current = media.current || null;
  const mediaTitle = clean(current?.title || current?.name || '', 120);
  const queue = count(media.queue);
  const history = count(media.history);
  const obsOnline = Boolean(obs.online);
  const obsConfigured = Boolean(obs.configured);
  const droppedPercent = Number(obs.streamDroppedPercent ?? obs.streaming?.health?.droppedPercent);
  const diagnostics = voice.diagnostics || {};
  const snrDb = Number(diagnostics.signalToNoiseDb);
  const micLevel = Number(diagnostics.micLevel);
  const voiceState = voice.ready
    ? (diagnostics.physicalGate ? 'armed' : 'ready')
    : voice.running
      ? 'starting'
      : voice.configured
        ? 'offline'
        : 'browser';
  return {
    mode: 'local-first',
    obs: {
      state: obsOnline ? 'ready' : obsConfigured ? 'offline' : 'local',
      scene: clean(obs.scene || obs.scenes?.current, 120) || '—',
      stream: obsOnline && obs.streaming ? 'live' : 'off',
      record: obsOnline && obs.recording ? 'on' : 'off',
      health: clean(obs.streamHealth || obs.streaming?.health?.status, 40) || 'idle',
      droppedPercent: Number.isFinite(droppedPercent) ? Math.max(0, droppedPercent) : null
    },
    twitch: { connected: false, mode: 'public-read-only', viewers: null, chatters: null, followers: null, subscribers: null, bits: null, bitrate: null },
    jarvis: { online: true, label: 'JARVIS' },
    voice: {
      state: voiceState,
      source: clean(diagnostics.source || (voice.configured ? 'pi' : 'browser'), 40) || 'browser',
      gate: voice.ready ? (diagnostics.physicalGate ? 'open' : 'closed') : 'n/a',
      snrDb: Number.isFinite(snrDb) ? snrDb : null,
      micLevel: Number.isFinite(micLevel) ? Math.max(0, Math.min(1, micLevel)) : null,
      lastEvent: clean(voice.lastEvent?.kind || voice.lastEvent?.type || voice.lastEvent?.detail?.kind, 40) || 'none'
    },
    music: { state: mediaTitle ? 'playing' : queue ? 'queued' : 'idle', nowPlaying: mediaTitle || '—', queue, history },
    socials: { connected: false, mode: 'public-read-only' },
    desktop: { count: count(desktop.apps ?? desktop.count), platform: clean(desktop.platform, 40) || 'host' },
    automation: {
      timers: count(activities.timers), polls: count(activities.polls), giveaways: count(activities.giveaways),
      commands: count(chat.commands), pendingReadAloud: Array.isArray(chat.readAloud) ? chat.readAloud.filter((item) => item?.status === 'pending').length : 0
    },
    agents: { routes: Math.max(0, Number(agents.routes) || 0), pipeline: clean(agents.pipeline, 40) || 'READY' }
  };
}

function display(value, fallback = 'N/A') {
  return value == null || value === '' ? fallback : String(value);
}

export function summarizeStatsDeck(deck = {}) {
  const obs = deck.obs || {};
  const twitch = deck.twitch || {};
  const music = deck.music || {};
  const socials = deck.socials || {};
  const desktop = deck.desktop || {};
  const automation = deck.automation || {};
  const agents = deck.agents || {};
  const voice = deck.voice || {};
  const dropped = Number.isFinite(Number(obs.droppedPercent)) ? ` dropped ${(Number(obs.droppedPercent) * 100).toFixed(2)}%` : '';
  return [
    `JARVIS stats deck: OBS ${display(obs.state, 'local')} // scene ${display(obs.scene)} // stream ${display(obs.stream)} // recording ${display(obs.record)}${dropped}.`,
    `Voice ${display(voice.state, 'browser')} // source ${display(voice.source, 'browser')} // gate ${display(voice.gate, 'n/a')}${Number.isFinite(Number(voice.snrDb)) ? ` // SNR ${Number(voice.snrDb).toFixed(1)} dB` : ''}.`,
    `Music ${display(music.state, 'idle')} // now playing ${display(music.nowPlaying)} // ${Number(music.queue) || 0} queued.`,
    `Desktop ${Number(desktop.count) || 0} apps on ${display(desktop.platform, 'host')} // automations ${Number(automation.timers) || 0} timers, ${Number(automation.polls) || 0} polls, ${Number(automation.giveaways) || 0} giveaways.`,
    `Agents ${Number(agents.routes) || 0} routes // pipeline ${display(agents.pipeline, 'READY')}. Twitch viewers/chatters/followers/subscribers/bits/bitrate are ${twitch.connected ? 'connected data' : 'not connected'}; socials are ${socials.mode || 'read-only'} and no external write occurred.`
  ].join(' ');
}

export function summarizeVoiceDiagnostics(voice = {}) {
  const state = display(voice.state, 'browser');
  const source = display(voice.source, 'browser');
  const gate = display(voice.gate, 'n/a');
  const snr = Number.isFinite(Number(voice.snrDb)) ? ` SNR ${Number(voice.snrDb).toFixed(1)} dB.` : '';
  const level = Number.isFinite(Number(voice.micLevel)) ? ` Mic level ${(Math.max(0, Math.min(1, Number(voice.micLevel))) * 100).toFixed(0)}%.` : '';
  const event = voice.lastEvent && voice.lastEvent !== 'none' ? ` Last event ${display(voice.lastEvent, 'none')}.` : ' No wake event recorded.';
  const note = source === 'browser'
    ? ' Browser mic permission and physical input are measured in the active command screen; the server cannot hear a browser track directly.'
    : ' A transcript alone cannot authorize a wake without fresh physical microphone evidence.';
  return `Voice diagnostics: ${state.toUpperCase()} // source ${source} // physical gate ${gate}.${snr}${level}${event}${note}`;
}

