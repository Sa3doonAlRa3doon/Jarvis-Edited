import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ArtifactStudio, artifactIntent, parseArtifactPlan } from '../lib/artifact-studio.mjs';

test('recognizes explicit Office artifact creation requests', () => {
  assert.equal(artifactIntent('Create a PowerPoint about renewable energy'), 'pptx');
  assert.equal(artifactIntent('Make an Excel workbook for expenses'), 'xlsx');
  assert.equal(artifactIntent('Write a Word document report'), 'docx');
  assert.equal(artifactIntent('Explain what PowerPoint is'), '');
});

test('normalizes model plans and falls back safely', () => {
  const plan = parseArtifactPlan('{"title":"Launch","sections":[{"heading":"Plan","points":["One","Two"]}]}', 'Create a presentation about launch', 'pptx');
  assert.equal(plan.title, 'Launch'); assert.equal(plan.sections[0].points.length, 2);
  assert.ok(parseArtifactPlan('not-json', 'Create an Excel workbook for inventory', 'xlsx').sections.length >= 3);
});

test('creates real PPTX, DOCX, and XLSX zip-based files in a private directory', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-artifacts-'));
  try {
    const studio = new ArtifactStudio(directory);
    for (const type of ['pptx', 'docx', 'xlsx']) {
      const plan = parseArtifactPlan({ title: `Test ${type}`, subtitle: 'Local QA', sections: [{ heading: 'Overview', points: ['First item', 'Second item'] }] }, '', type);
      const artifact = await studio.create(plan); const resolved = await studio.resolve(artifact.id);
      assert.ok(resolved); assert.match(artifact.downloadUrl, new RegExp(artifact.id));
      const bytes = await fs.readFile(resolved.path); assert.equal(bytes.subarray(0, 2).toString('ascii'), 'PK'); assert.ok(bytes.length > 2_000);
    }
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
