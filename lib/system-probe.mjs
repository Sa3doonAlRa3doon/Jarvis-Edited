import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function runBinary(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      encoding: options.encoding || 'utf8',
      timeout: options.timeout || 8000,
      maxBuffer: options.maxBuffer || 12 * 1024 * 1024,
      windowsHide: true,
      env: options.env || process.env
    }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

export async function readText(file, fallback = '') {
  try { return (await fs.readFile(file, 'utf8')).replace(/\0/g, '').trim(); }
  catch { return fallback; }
}

export async function readNumber(file, divisor = 1) {
  const value = Number(await readText(file, 'NaN'));
  return Number.isFinite(value) ? value / divisor : null;
}

export async function binaryAvailable(command, versionArgs = ['--version']) {
  try {
    await runBinary(command, versionArgs, { timeout: 2500, maxBuffer: 256 * 1024 });
    return true;
  } catch { return false; }
}

function cpuSnapshot() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total += Object.values(cpu.times).reduce((sum, time) => sum + time, 0);
  }
  return { idle, total };
}

let previousCpu = cpuSnapshot();

async function diskUsage() {
  try {
    const stats = await fs.statfs(process.platform === 'win32' ? process.cwd() : '/');
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bavail) * Number(stats.bsize);
    return { total, used: total - free, free, percent: total ? ((total - free) / total) * 100 : 0 };
  } catch { return { total: 0, used: 0, free: 0, percent: 0 }; }
}

function localAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '127.0.0.1';
}

async function linuxGpu() {
  const candidates = [
    '/sys/class/drm/card0/device/gpu_busy_percent',
    '/sys/class/drm/card1/device/gpu_busy_percent',
    '/sys/devices/platform/v3d/devfreq/1002000000.v3d/load'
  ];
  for (const file of candidates) {
    const raw = await readText(file, '');
    const numbers = raw.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (!numbers.length) continue;
    let percent = numbers[0];
    if (numbers.length >= 2 && numbers[1] > 0) percent = (numbers[0] / numbers[1]) * 100;
    if (percent > 100 && percent <= 10000) percent /= 100;
    return { available: true, percent: clamp(percent, 0, 100), name: 'VideoCore VII', source: file };
  }
  try {
    const output = String(await runBinary('nvidia-smi', ['--query-gpu=utilization.gpu,name,memory.used,memory.total', '--format=csv,noheader,nounits'], { timeout: 2500 }));
    const [percent, name, used, total] = output.split(/\r?\n/)[0].split(',').map((part) => part.trim());
    return { available: true, percent: clamp(Number(percent), 0, 100), name, memoryUsedMiB: Number(used), memoryTotalMiB: Number(total), source: 'nvidia-smi' };
  } catch {}
  return { available: false, percent: null, name: 'GPU counter unavailable', source: null };
}

export async function systemMetrics() {
  const currentCpu = cpuSnapshot();
  const totalDelta = currentCpu.total - previousCpu.total;
  const idleDelta = currentCpu.idle - previousCpu.idle;
  previousCpu = currentCpu;
  const totalMemory = os.totalmem();
  const usedMemory = totalMemory - os.freemem();
  const [temperature, disk, model, gpu] = await Promise.all([
    readNumber('/sys/class/thermal/thermal_zone0/temp', 1000),
    diskUsage(),
    readText('/proc/device-tree/model', `${os.type()} ${os.arch()}`),
    process.platform === 'linux' ? linuxGpu() : Promise.resolve({ available: false, percent: null, name: 'GPU counter unavailable', source: null })
  ]);
  return {
    timestamp: Date.now(),
    device: model,
    platform: process.platform,
    address: localAddress(),
    cpu: { percent: clamp(totalDelta > 0 ? (1 - idleDelta / totalDelta) * 100 : 0, 0, 100), cores: os.cpus().length, load: os.loadavg() },
    gpu,
    memory: { total: totalMemory, used: usedMemory, free: os.freemem(), percent: totalMemory ? (usedMemory / totalMemory) * 100 : 0 },
    disk,
    temperature,
    uptime: os.uptime()
  };
}

export async function storageDevices() {
  if (process.platform !== 'linux') {
    const disk = await diskUsage();
    return [{ name: 'system', type: 'disk', size: disk.total, used: disk.used, free: disk.free, mountpoints: [process.cwd()], model: os.type(), transport: 'local', removable: false }];
  }
  try {
    const output = await runBinary('lsblk', ['-J', '-b', '-o', 'NAME,KNAME,TYPE,SIZE,FSUSED,FSAVAIL,FSTYPE,MOUNTPOINTS,MODEL,TRAN,RM'], { timeout: 4000 });
    const parsed = JSON.parse(output);
    const flatten = (items, parent = '') => items.flatMap((item) => [{
      name: item.name,
      parent,
      type: item.type,
      size: Number(item.size) || 0,
      used: Number(item.fsused) || 0,
      free: Number(item.fsavail) || 0,
      filesystem: item.fstype || '',
      mountpoints: (item.mountpoints || []).filter(Boolean),
      model: String(item.model || '').trim(),
      transport: item.tran || '',
      removable: Boolean(Number(item.rm))
    }, ...flatten(item.children || [], item.name)]);
    return flatten(parsed.blockdevices || []);
  } catch { return []; }
}

function parseDockerJsonLines(output) {
  return String(output).split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

export async function dockerSummary() {
  if (!await binaryAvailable('docker', ['version', '--format', '{{.Server.Version}}'])) {
    return { available: false, containers: [], disk: [], error: 'Docker engine unavailable' };
  }
  const [listResult, statsResult, diskResult] = await Promise.allSettled([
    runBinary('docker', ['ps', '-a', '--format', '{{json .}}'], { timeout: 5000 }),
    runBinary('docker', ['stats', '--no-stream', '--format', '{{json .}}'], { timeout: 8000 }),
    runBinary('docker', ['system', 'df', '--format', '{{json .}}'], { timeout: 8000 })
  ]);
  const list = listResult.status === 'fulfilled' ? parseDockerJsonLines(listResult.value) : [];
  const stats = statsResult.status === 'fulfilled' ? parseDockerJsonLines(statsResult.value) : [];
  const statByName = new Map(stats.map((item) => [item.Name || item.Container, item]));
  return {
    available: true,
    containers: list.map((item) => ({
      id: item.ID,
      name: item.Names,
      image: item.Image,
      state: item.State,
      status: item.Status,
      ports: item.Ports,
      cpu: statByName.get(item.Names)?.CPUPerc || null,
      memory: statByName.get(item.Names)?.MemUsage || null,
      memoryPercent: statByName.get(item.Names)?.MemPerc || null,
      network: statByName.get(item.Names)?.NetIO || null
    })),
    disk: diskResult.status === 'fulfilled' ? parseDockerJsonLines(diskResult.value) : [],
    error: null
  };
}

function naturalDeviceSort(a, b) {
  return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
}

export async function linuxCameras() {
  if (process.platform !== 'linux') return [];
  try {
    const entries = await fs.readdir('/sys/class/video4linux', { withFileTypes: true });
    const cameras = await Promise.all(entries.filter((entry) => /^video\d+$/.test(entry.name)).map(async (entry) => ({
      id: `/dev/${entry.name}`,
      label: `${entry.name} — ${await readText(`/sys/class/video4linux/${entry.name}/name`, 'V4L2 camera')}`
    })));
    return cameras.sort(naturalDeviceSort);
  } catch { return []; }
}

export async function linuxMicrophones() {
  if (process.platform !== 'linux') return [];
  try {
    const output = await runBinary('arecord', ['-l'], { timeout: 3000, maxBuffer: 512 * 1024 });
    const devices = [];
    for (const line of String(output).split(/\r?\n/)) {
      const match = line.match(/^card\s+(\d+):\s*([^,]+),\s*device\s+(\d+):\s*(.+)$/i);
      if (match) devices.push({ id: `plughw:${match[1]},${match[3]}`, label: `card ${match[1]} / device ${match[3]} — ${match[2].trim()} ${match[4].trim()}` });
    }
    return devices.sort(naturalDeviceSort);
  } catch { return []; }
}

export async function mediaDevices() {
  const [cameras, microphones, ffmpeg, arecord] = await Promise.all([
    linuxCameras(), linuxMicrophones(), binaryAvailable('ffmpeg', ['-version']), binaryAvailable('arecord', ['--version'])
  ]);
  return { platform: process.platform, cameras, microphones, tools: { ffmpeg, arecord } };
}

export function audioRms(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 2) return 0;
  let sum = 0;
  const samples = Math.floor(buffer.length / 2);
  for (let index = 0; index < samples; index += 1) {
    const sample = buffer.readInt16LE(index * 2) / 32768;
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples);
}
