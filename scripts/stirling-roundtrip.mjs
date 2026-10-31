import 'dotenv/config';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StirlingPdfClient } from '../lib/stirling-pdf.mjs';
import { buildSyntheticPdf, documentSignature } from '../lib/stirling-fixture.mjs';

const args = new Set(process.argv.slice(2));
const operation = String(process.env.STIRLING_SMOKE_OPERATION || 'compress').trim().toLowerCase();

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-stirling-'));
  const inputRoot = path.join(tempRoot, 'input');
  const fixturePath = path.join(inputRoot, 'jarvis-stirling-smoke.pdf');
  await fs.mkdir(inputRoot, { recursive: true });
  await fs.writeFile(fixturePath, buildSyntheticPdf(), { mode: 0o600 });

  try {
    const client = new StirlingPdfClient({ inputRoots: [inputRoot], outputDirectory: tempRoot });
    const status = await client.status();
    if (!status.online) throw new Error(status.error || 'Stirling health check did not report online.');
    if (status.cloud && !args.has('--allow-cloud')) {
      throw new Error('Stirling Cloud is configured. Re-run with --allow-cloud to authorize one synthetic test upload.');
    }
    const result = await client.processFile(operation, fixturePath, { inputRoots: [inputRoot] });
    const expected = result.contentType.includes('wordprocessing') ? 'zip/docx' : 'pdf';
    const actual = documentSignature(result.buffer);
    if (actual !== expected) throw new Error(`Stirling returned an unexpected ${actual} file (expected ${expected}).`);
    console.log(JSON.stringify({
      ok: true,
      operation: result.operation,
      serviceHost: status.baseHost,
      online: status.online,
      inputBytes: (await fs.stat(fixturePath)).size,
      outputBytes: result.buffer.length,
      outputSignature: actual,
      note: 'Synthetic one-line PDF only; no user document was uploaded.'
    }, null, 2));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Stirling round-trip failed: ${String(error?.message || error).slice(0, 320)}`);
  process.exitCode = 1;
});
