export function usesPiSpeech(config, settings = {}) {
  return config?.ttsMode !== 'fish' && config?.localSpeech?.available === true && (!settings.ttsVoice || settings.ttsVoice === 'pi:offline');
}

export async function requestPiSpeech(text, settings = {}, request = (...args) => (window.jarvisFetch || fetch)(...args)) {
  const response = await request('/api/tts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(18_000),
    body: JSON.stringify({ text, mode: 'local', language: settings.voiceLanguage || 'en-GB', rate: settings.ttsRate ?? 1.02, pitch: settings.ttsPitch ?? .92 })
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error || `Offline speech returned HTTP ${response.status}.`);
  }
  const contentType = response.headers.get('content-type') || '';
  const bytes = await response.arrayBuffer();
  if (!/^audio\/wav\b/i.test(contentType) || bytes.byteLength < 46) throw new Error('Offline speech returned no valid audio.');
  return { bytes, contentType };
}

export async function playSpeechAudio(bytes, { context = null, contentType = 'audio/wav', volume = 1 } = {}) {
  volume = Math.max(0, Math.min(1, Number(volume) || 0));
  if (context?.state === 'running') {
    const decoded = await context.decodeAudioData(bytes.slice(0));
    const source = context.createBufferSource(); const gain = context.createGain();
    source.buffer = decoded; gain.gain.value = volume; source.connect(gain).connect(context.destination);
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { source.onended = null; try { source.stop(); } catch {} reject(new Error('Audio playback timed out.')); }, Math.min(300_000, Math.max(6000, (decoded.duration + 3) * 1000)));
        source.onended = () => { clearTimeout(timeout); resolve(); };
        try { source.start(0); } catch (error) { clearTimeout(timeout); reject(error); }
      });
    } finally { source.disconnect(); gain.disconnect(); }
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  const audio = new Audio(url); audio.volume = volume;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Audio playback timed out.')), 300_000);
      const finish = (error) => { clearTimeout(timeout); if (error) reject(error); else resolve(); };
      audio.onended = () => finish(); audio.onerror = () => finish(new Error('Audio playback failed.'));
      audio.play().catch(finish);
    });
  } finally { audio.pause(); URL.revokeObjectURL(url); }
}

export function browserSpeechTimeoutMs(text) {
  return Math.min(25_000, Math.max(8_000, 4_000 + String(text || '').length * 100));
}

export async function speakBrowser(text, settings = {}) {
  if (!('speechSynthesis' in window)) throw new Error('No browser voice is available on this device.');
  const voice = speechSynthesis.getVoices().find((item) => item.voiceURI === settings.ttsVoice || item.name === settings.ttsVoice);
  await new Promise((resolve, reject) => {
    const speechText = String(text).slice(0, 2500);
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.rate = Number(settings.ttsRate ?? 1.02); utterance.pitch = Number(settings.ttsPitch ?? .92); utterance.volume = Number(settings.ttsVolume ?? .95);
    utterance.lang = settings.voiceLanguage || 'en-GB'; if (voice) utterance.voice = voice;
    let started = false; let settled = false;
    const timeout = setTimeout(() => finish(new Error(started ? 'Browser speech timed out.' : 'Browser speech did not start. Select the Pi offline voice or an installed browser voice.')), 6000);
    const finish = (error) => { if (settled) return; settled = true; clearTimeout(timeout); clearTimeout(endTimeout); if (error) { speechSynthesis.cancel(); reject(error); } else resolve(); };
    let endTimeout;
    utterance.onstart = () => { started = true; clearTimeout(timeout); endTimeout = setTimeout(() => finish(new Error('Browser speech timed out.')), browserSpeechTimeoutMs(speechText)); };
    utterance.onend = () => finish(); utterance.onerror = () => finish(new Error('Browser speech failed. Check the selected voice and browser audio permission.'));
    try { speechSynthesis.cancel(); speechSynthesis.speak(utterance); } catch (error) { finish(error); }
  });
}
