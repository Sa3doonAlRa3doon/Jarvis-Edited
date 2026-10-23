import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outputDirectory = path.join(root, 'data');
const apiKey = process.env.FISH_AUDIO_API_KEY;
const model = process.env.FISH_AUDIO_MODEL || 's2.1-pro-free';

if (!apiKey) {
  console.error('FISH_AUDIO_API_KEY is missing from .env.');
  process.exit(1);
}

const phrase = process.argv.slice(2).join(' ').trim()
  || 'Good evening, sir. All systems are online. The workshop is secure, and I am ready when you are.';

const voices = [
  {
    label: 'current-mcu',
    id: process.env.FISH_AUDIO_VOICE_ID || '612b878b113047d9a770c069c8b4fdfe'
  },
  {
    label: 'refined-british',
    id: '41f0953d7a6b4c078445c7e65d620eeb'
  }
];

await fs.mkdir(outputDirectory, { recursive: true });

for (const voice of voices) {
  const response = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    signal: AbortSignal.timeout(120_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      model
    },
    body: JSON.stringify({
      text: phrase,
      reference_id: voice.id,
      temperature: 0.3,
      top_p: 0.55,
      normalize: true,
      language: 'en',
      format: 'mp3',
      sample_rate: 44100,
      mp3_bitrate: 192,
      latency: 'normal',
      features: ['quality-guard'],
      prosody: { speed: 0.92, volume: 0, normalize_loudness: true }
    })
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`${voice.label} failed with HTTP ${response.status}: ${detail}`);
  }

  const destination = path.join(outputDirectory, `jarvis-voice-${voice.label}.mp3`);
  await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
  const stat = await fs.stat(destination);
  console.log(`${voice.label}: ${destination} (${stat.size} bytes)`);
}
