import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { LocalSpeech, finalizeSpeechWav } from '../lib/local-speech.mjs';
import { browserSpeechTimeoutMs, playSpeechAudio, requestPiSpeech, usesPiSpeech } from '../public/local-speech.js';

function wav() {
  const data = Buffer.alloc(48);
  data.write('RIFF'); data.writeUInt32LE(0x7ffff000, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(22050, 24); data.writeUInt32LE(44100, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(0x7ffff000, 40); data.writeInt16LE(1200, 44); data.writeInt16LE(-1200, 46);
  return data;
}
function processFixture(onInput) {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.killed = false;
  child.kill = () => { child.killed = true; };
  const text = []; child.stdin.on('data', (chunk) => text.push(chunk));
  child.stdin.on('finish', () => onInput?.(child, Buffer.concat(text).toString('utf8')));
  return child;
}
const linux = { platform: 'linux', accessFile: async () => {} };

test('repairs pipe placeholder WAV lengths and rejects invalid or empty PCM', () => {
  const result = finalizeSpeechWav(wav());
  assert.equal(result.readUInt32LE(4), result.length - 8); assert.equal(result.readUInt32LE(40), 4);
  assert.throws(() => finalizeSpeechWav(Buffer.from('not audio')), /valid WAV/);
  const compressed = wav(); compressed.writeUInt16LE(3, 20);
  assert.throws(() => finalizeSpeechWav(compressed), /valid PCM/);
  assert.throws(() => finalizeSpeechWav(wav().subarray(0, 44)), /valid WAV/);
});

test('offline speech uses private stdin with no shell, file, or speech text argument', async () => {
  const secretText = 'Private speech; $(touch /tmp/do-not-run)';
  let actualText;
  const speech = new LocalSpeech({ ...linux, spawnProcess(binary, args, options) {
    assert.equal(binary, '/usr/bin/espeak-ng'); assert.equal(options.shell, false);
    assert.deepEqual(options.stdio, ['pipe', 'pipe', 'ignore']); assert.ok(args.includes('--stdin')); assert.ok(args.includes('--stdout'));
    assert.equal(args.includes(secretText), false); assert.equal(args.includes('-f'), false); assert.equal(args.includes('-m'), false);
    return processFixture((child, text) => { actualText = text; child.stdout.write(wav()); child.emit('close', 0); });
  } });
  assert.equal((await speech.synthesize(secretText)).readUInt32LE(40), 4);
  assert.equal(actualText, secretText); assert.equal(speech.active, 0);
});

test('missing Linux engine and Windows discovery never launch a process', async () => {
  const missing = new LocalSpeech({ platform: 'linux', accessFile: async () => { throw new Error('ENOENT'); }, spawnProcess: () => assert.fail('must not spawn') });
  assert.equal((await missing.status()).available, false);
  await assert.rejects(missing.synthesize('Hello'), /Install espeak-ng/);
  const windows = new LocalSpeech({ platform: 'win32', accessFile: () => assert.fail('must not probe Linux paths') });
  assert.equal((await windows.status()).available, false);
});

test('language cannot become an option or file path and numeric prosody stays bounded', async () => {
  const speech = new LocalSpeech({ ...linux, spawnProcess(_binary, args) {
    assert.equal(args[args.indexOf('-v') + 1], 'en-gb');
    assert.equal(args[args.indexOf('-s') + 1], '350'); assert.equal(args[args.indexOf('-p') + 1], '0');
    return processFixture((child) => { child.stdout.write(wav()); child.emit('close', 0); });
  } });
  await speech.synthesize('Hello', { language: '../../etc/passwd', rate: 999, pitch: -999 });
});

test('timeout kills the child and releases concurrency for subsequent requests', async () => {
  let child;
  const speech = new LocalSpeech({ ...linux, timeoutMs: 50, spawnProcess: () => (child = processFixture()) });
  await assert.rejects(speech.synthesize('Hello'), (error) => error.status === 504 && /timed out/.test(error.message));
  assert.equal(child.killed, true); assert.equal(speech.active, 0);
});

test('concurrent calls are bounded without queueing unbounded speech processes', async () => {
  const children = [];
  const speech = new LocalSpeech({ ...linux, spawnProcess: () => { const child = processFixture(); children.push(child); return child; } });
  const first = speech.synthesize('First'); const second = speech.synthesize('Second');
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(speech.synthesize('Third'), (error) => error.status === 429);
  assert.equal(children.length, 2);
  for (const child of children) { child.stdout.write(wav()); child.emit('close', 0); }
  await Promise.all([first, second]); assert.equal(speech.active, 0);
});

test('oversized audio, malformed output, and process errors do not report success', async () => {
  for (const mode of ['oversize', 'malformed', 'error']) {
    const speech = new LocalSpeech({ ...linux, spawnProcess: () => processFixture((child) => {
      if (mode === 'error') child.emit('error', new Error('private provider diagnostics'));
      else { child.stdout.write(mode === 'oversize' ? Buffer.alloc(17 * 1024 * 1024) : Buffer.from('bad')); child.emit('close', 0); }
    }) });
    await assert.rejects(speech.synthesize('Hello'), (error) => error.status === 503 && !error.message.includes('private provider'));
    assert.equal(speech.active, 0);
  }
});

test('local voice choice preserves Fish mode and explicit browser voices', () => {
  assert.equal(usesPiSpeech({ ttsMode: 'local', localSpeech: { available: true } }), true);
  assert.equal(usesPiSpeech({ ttsMode: 'fish', localSpeech: { available: true } }), false);
  assert.equal(usesPiSpeech({ localSpeech: { available: true } }, { ttsVoice: 'browser-voice' }), false);
  assert.equal(usesPiSpeech({ localSpeech: { available: true } }, { ttsVoice: 'pi:offline' }), true);
  assert.equal(usesPiSpeech({ localSpeech: { available: false } }), false);
});

test('browser speech watchdog stays bounded for short and long replies', () => {
  assert.equal(browserSpeechTimeoutMs('yes sir'), 8_000);
  assert.equal(browserSpeechTimeoutMs('x'.repeat(100)), 14_000);
  assert.equal(browserSpeechTimeoutMs('x'.repeat(2_500)), 25_000);
});

test('client requests local mode and rejects failed or empty audio', async () => {
  const result = await requestPiSpeech('Hello', { ttsRate: 1.2 }, async (url, options) => {
    assert.equal(url, '/api/tts'); assert.equal(options.method, 'POST');
    assert.equal(JSON.parse(options.body).mode, 'local'); assert.equal(JSON.parse(options.body).rate, 1.2);
    return new Response(wav(), { headers: { 'content-type': 'audio/wav' } });
  });
  assert.equal(result.bytes.byteLength, 48);
  await assert.rejects(requestPiSpeech('Hello', {}, async () => new Response('{"error":"Not installed"}', { status: 503 })), /Not installed/);
  await assert.rejects(requestPiSpeech('Hello', {}, async () => new Response('', { headers: { 'content-type': 'audio/wav' } })), /no valid audio/);
});

test('decoded playback waits for audio end and releases its nodes', async () => {
  let source; let disconnected = 0;
  const context = { state: 'running', destination: {}, decodeAudioData: async () => ({ duration: .1 }),
    createBufferSource: () => (source = { connect() { return this; }, disconnect() { disconnected++; }, start() { setImmediate(() => source.onended()); } }),
    createGain: () => ({ gain: {}, connect() {}, disconnect() { disconnected++; } }) };
  await playSpeechAudio(wav().buffer, { context }); assert.equal(disconnected, 2);
});
