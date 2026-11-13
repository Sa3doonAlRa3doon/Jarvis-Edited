import 'dotenv/config';
import { planPiDeviceMigration } from '../lib/pi-device-migration.mjs';
import { DEFAULT_LOCAL_PORTS } from '../lib/local-ports.mjs';

const apply = process.argv.includes('--apply');
const port = Number(process.env.PORT) || DEFAULT_LOCAL_PORTS.dashboard;
const base = `http://127.0.0.1:${port}`;
const pin = String(process.env.DASHBOARD_ACCESS_PIN || '').trim();

async function request(path, options = {}) {
  return fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(12_000) });
}

async function main() {
  if (!pin) throw new Error('DASHBOARD_ACCESS_PIN is required in the private local environment.');
  const login = await request('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin })
  });
  if (!login.ok) throw new Error(`Dashboard login failed (HTTP ${login.status}).`);
  const cookie = login.headers.getSetCookie?.()[0]?.split(';')[0] || login.headers.get('set-cookie')?.split(';')[0] || '';
  if (!cookie) throw new Error('Dashboard login returned no private session cookie.');
  const headers = { cookie };
  const [settingsResponse, devicesResponse] = await Promise.all([
    request('/api/settings', { headers }), request('/api/media/devices', { headers })
  ]);
  if (!settingsResponse.ok || !devicesResponse.ok) throw new Error('Could not read current Pi devices and settings.');
  const settings = await settingsResponse.json();
  const devices = await devicesResponse.json();
  const plan = planPiDeviceMigration({ settings, cameras: devices.cameras, microphones: devices.microphones });
  process.stdout.write(`PI DEVICE MIGRATION // ${apply ? 'APPLY' : 'DRY RUN'}\n`);
  for (const change of plan.changes) process.stdout.write(`${change.field}: ${change.label || change.to}\n`);
  for (const warning of plan.warnings) process.stdout.write(`WARN: ${warning}\n`);
  if (!plan.changes.length) {
    process.stdout.write('No stable-device migration is required.\n');
    return;
  }
  if (!apply) {
    process.stdout.write('No settings changed. Re-run with --apply after reviewing this mapping.\n');
    return;
  }
  const saved = await request('/api/settings', {
    method: 'PUT', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(plan.next)
  });
  if (!saved.ok) {
    const detail = await saved.json().catch(() => ({}));
    throw new Error(String(detail.error || `Device migration failed (HTTP ${saved.status}).`).slice(0, 240));
  }
  process.stdout.write(`Saved ${plan.changes.length} stable Pi device selection(s).\n`);
}

main().catch((error) => {
  process.stderr.write(`PI DEVICE MIGRATION // ERROR // ${String(error?.message || error).replace(/\s+/g, ' ').slice(0, 260)}\n`);
  process.exitCode = 2;
});
