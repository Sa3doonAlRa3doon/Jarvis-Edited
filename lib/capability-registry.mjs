import { agentRoles, selectInstalledModel } from './agent-router.mjs';

export const capabilityCatalog = Object.freeze([
  { id: 'voice', label: 'Wake + voice', kind: 'perception', localOnly: true, requiresApproval: false },
  { id: 'camera', label: 'Camera + gestures', kind: 'perception', localOnly: true, requiresApproval: false },
  { id: 'vision', label: 'Local screen vision', kind: 'perception', localOnly: true, requiresApproval: false },
  { id: 'screen', label: 'Private screen view', kind: 'workspace', localOnly: true, requiresApproval: false },
  { id: 'screen-explain', label: 'Explain selected screen', kind: 'perception', localOnly: true, requiresApproval: false },
  { id: 'website-live', label: 'Live website view', kind: 'browser', localOnly: true, requiresApproval: false },
  { id: 'pi-camera-view', label: 'Raspberry Pi camera view', kind: 'perception', localOnly: true, requiresApproval: false },
  { id: 'browser-read', label: 'Private browser read', kind: 'browser', localOnly: true, requiresApproval: false },
  { id: 'browser-control', label: 'Private browser control', kind: 'browser', localOnly: true, requiresApproval: true },
  { id: 'desktop-apps', label: 'Host desktop apps', kind: 'workspace', localOnly: true, requiresApproval: true },
  { id: 'google', label: 'Google Workspace', kind: 'connector', localOnly: true, requiresApproval: false },
  { id: 'email-send', label: 'Gmail send', kind: 'connector', localOnly: true, requiresApproval: true },
  { id: 'web-research', label: 'Web + news research', kind: 'research', localOnly: false, requiresApproval: false },
  { id: 'social-research', label: 'Public social research', kind: 'research', localOnly: false, requiresApproval: false },
  { id: 'public-apis', label: 'Keyless public data', kind: 'research', localOnly: false, requiresApproval: false },
  { id: 'office', label: 'Office artifacts', kind: 'creative', localOnly: true, requiresApproval: false },
  { id: 'stirling-pdf', label: 'Stirling PDF tools', kind: 'creative', localOnly: false, requiresApproval: false },
  { id: 'routines', label: 'Read-only routines', kind: 'automation', localOnly: true, requiresApproval: false },
  { id: 'printer', label: '3D printer / Moonraker', kind: 'fabricator', localOnly: true, requiresApproval: true },
  { id: 'operations', label: 'Pi service operations', kind: 'operations', localOnly: true, requiresApproval: true },
  { id: 'obs', label: 'OBS stream studio', kind: 'broadcast', localOnly: true, requiresApproval: true },
  { id: 'obs-overlay', label: 'OBS status overlay', kind: 'broadcast', localOnly: true, requiresApproval: false },
  { id: 'broadcast-kit', label: 'Chat + stream kit', kind: 'broadcast', localOnly: true, requiresApproval: false },
  { id: 'media-deck', label: 'Local media deck', kind: 'creative', localOnly: true, requiresApproval: false },
  { id: 'knowledge-index', label: 'Local knowledge index', kind: 'memory', localOnly: true, requiresApproval: false },
  { id: 'engineering-pipeline', label: 'Architect / Critic / Debugger', kind: 'engineering', localOnly: true, requiresApproval: false },
  { id: 'analytics', label: 'Local activity analytics', kind: 'monitoring', localOnly: true, requiresApproval: false },
  { id: 'morning-briefing', label: 'Morning briefing', kind: 'assistant', localOnly: false, requiresApproval: false },
  { id: 'maps-weather', label: 'Maps, weather, and time', kind: 'research', localOnly: false, requiresApproval: false }
]);

function status(available, detail, extra = {}) {
  return { available: Boolean(available), detail: String(detail || (available ? 'ready' : 'offline')), ...extra };
}

function modelMatches(installedModels, requestedModel) {
  if (!Array.isArray(installedModels)) return null;
  const requested = String(requestedModel || '').trim();
  if (!requested) return false;
  return installedModels.some((name) => String(name || '').trim() === requested
    || (requested.endsWith(':latest') && String(name || '').trim().split(':')[0] === requested.split(':')[0]));
}

function specialistModelStatus(route, role, models, installedModels) {
  const requestedModel = String(models?.[route] || models?.primary || '').trim();
  const installed = modelMatches(installedModels, requestedModel);
  const primary = String(models?.primary || '').trim();
  const selection = selectInstalledModel({ requested: requestedModel, primary, installed: installedModels, route });
  const runtimeModel = Array.isArray(installedModels) && installedModels.length ? String(selection.model || '') : '';
  return {
    name: role.name,
    model: requestedModel,
    requestedModel,
    installed,
    runtimeModel,
    fallback: installed === false && runtimeModel ? `Using ${runtimeModel} until ${requestedModel || 'the specialist model'} is installed.` : ''
  };
}

export function buildCapabilitySnapshot({ services = {}, google = {}, printer = {}, operations = {}, stirling = {}, settings = {}, browserControlEnabled = false, googleEmailSendEnabled = false, models = {}, installedModels = null } = {}) {
  const openJarvis = Boolean(services.openjarvis?.online);
  const googleConnected = Boolean(google.liveVerified ?? google.connected);
  const printerOnline = Boolean(printer.online);
  const piSource = settings.source === 'pi';
  const capabilities = capabilityCatalog.map((item) => {
    switch (item.id) {
      case 'voice': return { ...item, status: status(piSource ? Boolean(settings.piMicrophone) : true, piSource ? (settings.piMicrophone ? 'Pi microphone selected' : 'Pi microphone not selected') : 'Browser microphone permission') };
      case 'camera': return { ...item, status: status(piSource ? Boolean(settings.piCamera) : true, piSource ? (settings.piCamera ? 'Pi camera selected' : 'Pi camera not selected') : 'Browser camera permission') };
      case 'vision': {
        const vision = services.ollama?.vision || {};
        const ready = Boolean(vision.ready ?? (vision.configured && vision.installed));
        const detail = ready ? `Ollama ${vision.model}${vision.capabilityVerified === false ? ' // capability inferred from tag' : ''}` : vision.runtime === 'unsupported' ? `Installed model is text-only // ${vision.model}` : vision.runtime === 'unknown' ? `Ollama vision probe unavailable // ${vision.model || 'not configured'}` : vision.configured ? `Model missing // ${vision.model}` : 'Set JARVIS_VISION_MODEL after installing a local model';
        return { ...item, status: status(ready, detail, { model: vision.model || '', runtime: vision.runtime || (vision.configured ? (vision.installed ? 'ready' : 'missing') : 'unconfigured'), capabilityVerified: vision.capabilityVerified ?? false }) };
      }
      case 'screen': return { ...item, status: status(true, 'User-approved snapshots and live agent frames') };
      case 'screen-explain': {
        const vision = services.ollama?.vision || {};
        const ready = Boolean(vision.ready ?? (vision.configured && vision.installed));
        return { ...item, status: status(ready, ready ? `One approved snapshot // ${vision.model}` : vision.runtime === 'unsupported' ? `Configured tag is not vision-capable // ${vision.model}` : 'Install and configure a local vision model', { model: vision.model || '', continuousCapture: false, runtime: vision.runtime || '' }) };
      }
      case 'website-live': return { ...item, status: status(true, 'Camoufox display or isolated browser frame // read-only by default', { engine: 'camoufox', adOrPaywallBypass: false }) };
      case 'pi-camera-view': return { ...item, status: status(piSource ? Boolean(settings.piCameraAvailable ?? settings.piCamera) : true, piSource ? (settings.piCameraAvailable ? `Live frame // ${settings.piCamera}` : settings.piCamera ? 'Selected camera is offline' : 'Pi camera not selected') : 'Browser camera permission', { selected: settings.piCamera || '', continuousCapture: false }) };
      case 'browser-read': return { ...item, status: status(openJarvis, openJarvis ? 'Camoufox browser bridge online' : 'OpenJarvis is offline', { engine: 'camoufox' }) };
      case 'browser-control': return { ...item, status: status(openJarvis && browserControlEnabled, browserControlEnabled ? 'Camoufox // one-task approval required' : 'Disabled until enabled on this host', { engine: 'camoufox' }) };
      case 'desktop-apps': return { ...item, status: status(Boolean(settings.desktopAppsAvailable), settings.desktopAppsAvailable ? 'Discovered host apps // one launch approval' : 'No host-app catalog yet', { count: Number(settings.desktopAppCount) || 0, platform: settings.desktopAppsPlatform || '' }) };
      case 'google': {
        const needsReauthorization = !googleConnected && google.errors && Object.keys(google.errors).length > 0;
        return { ...item, status: status(googleConnected, googleConnected ? 'Private OAuth bridge connected' : needsReauthorization ? 'OAuth reauthorization required' : 'Not connected', { connectors: google.connectors || {}, needsReauthorization: Boolean(needsReauthorization) }) };
      }
      case 'email-send': return { ...item, status: status(googleConnected && googleEmailSendEnabled, googleEmailSendEnabled ? 'Separate SEND EMAIL approval' : 'Draft-only mode') };
      case 'web-research': return { ...item, status: status(true, 'Bounded public search with citations') };
      case 'social-research': return { ...item, status: status(true, 'Public GitHub, Instagram, Reddit, YouTube, Twitch, and Discord research // read-only') };
      case 'public-apis': return { ...item, status: status(true, 'Keyless weather, maps, time, alerts, and more') };
      case 'office': return { ...item, status: status(true, 'Local DOCX, PPTX, and XLSX generation') };
      case 'stirling-pdf': return { ...item, status: status(Boolean(stirling.configured), stirling.configured ? (stirling.online ? 'Stirling API online // server-side key' : 'Configured // health check pending') : 'Set STIRLING_URL and private STIRLING_API_KEY', { baseHost: stirling.baseHost || '', operations: stirling.operations || [] }) };
      case 'routines': return { ...item, status: status(true, `${Number(settings.routineCount) || 0} scheduled read-only checks`, { count: Number(settings.routineCount) || 0, readOnly: true }) };
      case 'printer': return { ...item, status: status(printerOnline, printerOnline ? String(printer.state || 'ready') : 'Printer offline') };
      case 'operations': return { ...item, status: status(Boolean(operations.available), operations.available ? (operations.maintenancePersistent || operations.maintenanceUntilReboot ? 'Maintenance lock active' : 'PIN-protected allow-list') : 'Pi Linux helper unavailable') };
      case 'obs': {
        const streamHealth = String(services.obs?.streamHealth || 'idle');
        const healthLabel = streamHealth === 'good' ? 'STREAM GOOD' : streamHealth === 'warning' ? 'STREAM WARNING' : streamHealth === 'degraded' ? 'STREAM DEGRADED' : 'STREAM IDLE';
        return { ...item, status: status(Boolean(services.obs?.online), services.obs?.online ? `Connected${services.obs.scene ? ` // ${services.obs.scene}` : ''} // ${healthLabel}` : settings.obsConfigured ? (services.obs.detail || 'OBS offline') : 'OBS WebSocket not configured', { scene: services.obs?.scene || '', previewScene: services.obs?.previewScene || '', streaming: Boolean(services.obs?.streaming), recording: Boolean(services.obs?.recording), recordingPaused: Boolean(services.obs?.recordingPaused), replayBuffer: Boolean(services.obs?.replayBuffer), virtualCamera: Boolean(services.obs?.virtualCamera), studioMode: Boolean(services.obs?.studioMode), sourceCount: Number(services.obs?.sourceCount) || 0, mixerCount: Number(services.obs?.mixerCount) || 0, streamHealth, streamCongestion: Number(services.obs?.streamCongestion) || 0, streamSkippedFrames: Number(services.obs?.streamSkippedFrames) || 0, streamDroppedPercent: Number(services.obs?.streamDroppedPercent) || 0 }) };
      }
      case 'obs-overlay': return { ...item, status: status(Boolean(settings.obsOverlayAvailable), settings.obsOverlayAvailable ? 'Read-only browser source' : 'Overlay unavailable') };
      case 'broadcast-kit': return { ...item, status: status(settings.broadcastKitAvailable !== false, settings.broadcastKitAvailable === false ? 'Broadcast kit unavailable' : 'Local timers, polls, giveaways, replies, and read-aloud queue') };
      case 'media-deck': return { ...item, status: status(settings.mediaDeckAvailable !== false, settings.mediaDeckAvailable === false ? 'Media deck unavailable' : 'Host-local queue and playback staging') };
      case 'knowledge-index': return { ...item, status: status(settings.knowledgeAvailable !== false, settings.knowledgeAvailable === false ? 'Knowledge index unavailable' : 'Bounded local files and project structure') };
      case 'engineering-pipeline': return { ...item, status: status(settings.engineeringAvailable !== false, settings.engineeringAvailable === false ? 'Engineering pipeline unavailable' : 'Fixed Architect → Critic → Debugger recipes') };
      case 'analytics': return { ...item, status: status(settings.analyticsAvailable !== false, settings.analyticsAvailable === false ? 'Analytics unavailable' : 'Host-local activity, health, and broadcast counts') };
      case 'morning-briefing': return { ...item, status: status(settings.morningBriefingAvailable !== false, settings.morningBriefingAvailable === false ? 'Briefing unavailable' : 'Read-only health, weather, news, printer, Docker, and Calendar digest') };
      case 'maps-weather': return { ...item, status: status(settings.mapsWeatherAvailable !== false, settings.mapsWeatherAvailable === false ? 'Public data unavailable' : 'Keyless Open-Meteo, OpenStreetMap, time, and alerts') };
      default: return { ...item, status: status(false, 'Unavailable') };
    }
  });
  return {
    generatedAt: new Date().toISOString(),
    modelInventory: Array.isArray(installedModels) ? [...installedModels].map((name) => String(name || '').trim()).filter(Boolean).slice(0, 32) : null,
    specialistRoles: Object.fromEntries(Object.entries(agentRoles).map(([route, role]) => [route, specialistModelStatus(route, role, models, installedModels)])),
    capabilities
  };
}
