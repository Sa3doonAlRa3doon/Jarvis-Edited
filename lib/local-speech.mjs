import { spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';

const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
const failure = (message, status = 503) => Object.assign(new Error(message), { status });

// stdout WAVs can contain placeholder lengths because eSpeak cannot seek back
// through a pipe. Correct those lengths only after a complete, bounded render.
export function finalizeSpeechWav(input) {
  const wav = Buffer.from(input);
  if (wav.length < 46 || wav.length > MAX_AUDIO_BYTES || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw failure('The local voice did not produce valid WAV audio.');
  }
  let offset = 12;
  let format = false;
  while (offset + 8 <= wav.length) {
    const tag = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (tag === 'fmt ') {
      if (size < 16 || offset + 8 + size > wav.length || wav.readUInt16LE(offset + 8) !== 1) break;
      const channels = wav.readUInt16LE(offset + 10);
      const rate = wav.readUInt32LE(offset + 12);
      const bits = wav.readUInt16LE(offset + 22);
      if (![1, 2].includes(channels) || rate < 8000 || rate > 96000 || bits !== 16) break;
      format = true;
    }
    if (tag === 'data') {
      const bytes = wav.length - offset - 8;
      if (!format || bytes < 2 || bytes % 2) break;
      wav.writeUInt32LE(wav.length - 8, 4);
      wav.writeUInt32LE(bytes, offset + 4);
      return wav;
    }
    if (size > wav.length - offset - 8) break;
    offset += 8 + size + (size % 2);
  }
  throw failure('The local voice did not produce valid PCM audio.');
}

export class LocalSpeech {
  constructor({ platform = process.platform, accessFile = access, spawnProcess = spawn, timeoutMs = 15_000, maxConcurrent = 2 } = {}) {
    this.platform = platform;
    this.accessFile = accessFile;
    this.spawnProcess = spawnProcess;
    this.timeoutMs = number(timeoutMs, 15_000, 50, 30_000);
    this.maxConcurrent = number(maxConcurrent, 2, 1, 2);
    this.active = 0;
    this.discovery = null;
  }

  async binary() {
    if (!this.discovery) this.discovery = (async () => {
      if (this.platform !== 'linux') return '';
      for (const candidate of ['/usr/bin/espeak-ng', '/usr/bin/espeak']) {
        try { await this.accessFile(candidate, constants.X_OK); return candidate; } catch {}
      }
      return '';
    })();
    return this.discovery;
  }

  async status() {
    const binary = await this.binary();
    return { available: Boolean(binary), provider: binary ? 'espeak' : '', voice: binary ? 'en-gb' : '', offline: true };
  }

  async synthesize(value, { language = 'en-GB', rate = 1.02, pitch = .92 } = {}) {
    const text = String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 2500);
    if (!text) throw failure('Speech text is empty.', 400);
    const binary = await this.binary();
    if (!binary) throw failure('Offline Pi speech is unavailable. Install espeak-ng and restart the JARVIS core, or select an available browser voice.');
    if (this.active >= this.maxConcurrent) throw failure('The offline voice is busy. Please retry shortly.', 429);
    // Language codes cannot become file paths, switches, or voice variants.
    const voice = /^[a-z]{2,3}(?:-[a-z]{2})?$/i.test(String(language)) ? String(language).toLowerCase() : 'en-gb';
    const args = ['--stdout', '--stdin', '-b', '1', '-v', voice, '-s', String(Math.round(number(rate, 1.02, .5, 2) * 175)), '-p', String(Math.round(number(pitch, .92, 0, 2) * 50))];
    this.active += 1;
    try {
      return await new Promise((resolve, reject) => {
        let child;
        let settled = false;
        let timer;
        let length = 0;
        const chunks = [];
        const finish = (error, audio) => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          if (error) { try { child?.kill('SIGKILL'); } catch {} reject(error); }
          else resolve(audio);
        };
        try { child = this.spawnProcess(binary, args, { stdio: ['pipe', 'pipe', 'ignore'], shell: false, windowsHide: true }); }
        catch { finish(failure('The offline voice could not start.')); return; }
        timer = setTimeout(() => finish(failure('Offline speech synthesis timed out.', 504)), this.timeoutMs);
        child.once('error', () => finish(failure('The offline voice could not start.')));
        child.stdin.on('error', () => finish(failure('The offline voice could not read the speech text.')));
        child.stdout.on('data', (chunk) => {
          if (settled) return;
          length += chunk.length;
          if (length > MAX_AUDIO_BYTES) { finish(failure('Offline speech exceeded its audio limit.')); return; }
          chunks.push(chunk);
        });
        child.once('close', (code) => {
          if (settled) return;
          if (code !== 0) { finish(failure('The offline voice could not synthesize this language.')); return; }
          try { finish(null, finalizeSpeechWav(Buffer.concat(chunks, length))); }
          catch (error) { finish(error); }
        });
        // Private speech stays in the pipe: never use a shell, process argument,
        // temporary file, diagnostic log, or network provider for this text.
        child.stdin.end(text, 'utf8');
      });
    } finally { this.active -= 1; }
  }
}
