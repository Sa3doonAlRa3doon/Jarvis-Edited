import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';

const TYPES = Object.freeze({ pptx: 'PowerPoint', docx: 'Word document', xlsx: 'Excel workbook' });

function clean(value, limit = 2000) {
  return String(value ?? '').replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function slug(value) {
  return clean(value, 80).normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'jarvis-artifact';
}

export function artifactIntent(prompt) {
  const text = String(prompt || '');
  const create = /\b(?:create|make|build|generate|prepare|design|write|draft)\b/i.test(text);
  if (!create) return '';
  if (/\b(?:power\s*point|pptx|slide\s*deck|presentation|slides?)\b/i.test(text)) return 'pptx';
  if (/\b(?:excel|xlsx|spreadsheet|workbook)\b/i.test(text)) return 'xlsx';
  if (/\b(?:word\s+document|docx|document|report|letter)\b/i.test(text)) return 'docx';
  return '';
}

export function fallbackArtifactPlan(prompt, type) {
  const text = clean(prompt, 500);
  const topic = clean(text
    .replace(/\b(?:please|jarvis|create|make|build|generate|prepare|design|write|draft|me|a|an|the|power\s*point|pptx|slide\s*deck|presentation|slides?|excel|xlsx|spreadsheet|workbook|word\s+document|docx|document|report)\b/gi, ' ')
    .replace(/\s+/g, ' '), 120) || 'JARVIS Briefing';
  const title = topic.replace(/\b\w/g, (value) => value.toUpperCase());
  const sections = [
    { heading: 'Overview', points: [`Purpose and scope of ${topic}`, 'Key context and intended outcome'] },
    { heading: 'Key Information', points: ['Primary facts, requirements, and assumptions', 'Important dependencies and constraints'] },
    { heading: 'Action Plan', points: ['Recommended next steps', 'Ownership, timing, and verification'] }
  ];
  return { type, title, subtitle: `Prepared locally by JARVIS • ${new Date().toLocaleDateString('en-AE')}`, sections };
}

export function parseArtifactPlan(value, prompt, type) {
  let parsed = value && typeof value === 'object' ? value : null;
  if (!parsed) {
    const match = String(value || '').match(/\{[\s\S]*\}/);
    if (match) try { parsed = JSON.parse(match[0]); } catch {}
  }
  const fallback = fallbackArtifactPlan(prompt, type);
  const sections = Array.isArray(parsed?.sections) ? parsed.sections.slice(0, 10).map((section, index) => ({
    heading: clean(section?.heading || `Section ${index + 1}`, 120),
    points: (Array.isArray(section?.points) ? section.points : [section?.content]).map((point) => clean(point, 500)).filter(Boolean).slice(0, 12)
  })).filter((section) => section.heading && section.points.length) : fallback.sections;
  return {
    type,
    title: clean(parsed?.title || fallback.title, 160),
    subtitle: clean(parsed?.subtitle || fallback.subtitle, 240),
    sections: sections.length ? sections : fallback.sections
  };
}

async function createPptx(plan, outputPath) {
  const deck = new PptxGenJS();
  deck.layout = 'LAYOUT_WIDE';
  deck.author = 'JARVIS'; deck.company = 'Local JARVIS Workspace'; deck.subject = plan.title; deck.title = plan.title;
  deck.lang = 'en-AE'; deck.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' };
  const title = deck.addSlide();
  title.background = { color: '02070B' };
  title.addShape(deck.ShapeType.arc, { x: 8.75, y: 0.5, w: 3.7, h: 3.7, line: { color: '64E8FF', transparency: 18, width: 2 }, adjustPoint: 0.24, rotate: 28 });
  title.addText('JARVIS // GENERATED BRIEFING', { x: 0.75, y: 0.7, w: 7.4, h: 0.35, fontFace: 'Aptos', fontSize: 10, color: '64E8FF', charSpacing: 2.2, bold: true });
  title.addText(plan.title, { x: 0.75, y: 1.45, w: 9.8, h: 1.55, fontFace: 'Aptos Display', fontSize: 30, color: 'EAFBFF', bold: true, breakLine: false, margin: 0 });
  title.addText(plan.subtitle, { x: 0.78, y: 3.25, w: 8.2, h: 0.7, fontFace: 'Aptos', fontSize: 13, color: '8EB7C2', margin: 0 });
  title.addShape(deck.ShapeType.line, { x: 0.75, y: 4.35, w: 11.6, h: 0, line: { color: '173B45', width: 1 } });
  title.addText('PRIVATE LOCAL ARTIFACT', { x: 0.78, y: 4.58, w: 3.4, h: 0.3, fontSize: 9, color: '5B8390', charSpacing: 1.5 });
  for (const [index, section] of plan.sections.entries()) {
    const slide = deck.addSlide(); slide.background = { color: '03090E' };
    slide.addText(String(index + 1).padStart(2, '0'), { x: 0.55, y: 0.45, w: 0.7, h: 0.4, fontSize: 13, bold: true, color: '64E8FF' });
    slide.addText(section.heading, { x: 1.3, y: 0.4, w: 10.7, h: 0.6, fontSize: 25, bold: true, color: 'EAFBFF', margin: 0 });
    slide.addShape(deck.ShapeType.line, { x: 0.6, y: 1.2, w: 12, h: 0, line: { color: '1B4651', width: 1 } });
    const runs = section.points.map((point) => ({ text: point, options: { bullet: { indent: 16 }, breakLine: true, color: 'C5DCE2', fontSize: 18, paraSpaceAfterPt: 15 } }));
    slide.addText(runs, { x: 0.95, y: 1.6, w: 11.25, h: 4.7, valign: 'mid', margin: 0.08, breakLine: false });
    slide.addText(`JARVIS • ${index + 1}/${plan.sections.length}`, { x: 9.9, y: 6.85, w: 2.4, h: 0.25, fontSize: 8, color: '507781', align: 'right' });
  }
  await deck.writeFile({ fileName: outputPath });
}

async function createDocx(plan, outputPath) {
  const children = [
    new Paragraph({ text: plan.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: plan.subtitle, color: '39717D', italics: true })], spacing: { after: 360 } })
  ];
  for (const section of plan.sections) {
    children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1, spacing: { before: 260, after: 100 } }));
    for (const point of section.points) children.push(new Paragraph({ text: point, bullet: { level: 0 }, spacing: { after: 90 } }));
  }
  children.push(new Paragraph({ children: [new TextRun({ text: 'Generated locally by JARVIS', color: '777777', italics: true })], spacing: { before: 360 } }));
  const document = new Document({ creator: 'JARVIS', title: plan.title, description: plan.subtitle, sections: [{ properties: {}, children }] });
  await fs.writeFile(outputPath, await Packer.toBuffer(document));
}

async function createXlsx(plan, outputPath) {
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'JARVIS'; workbook.title = plan.title; workbook.subject = plan.subtitle;
  const sheet = workbook.addWorksheet('JARVIS Briefing', { views: [{ state: 'frozen', ySplit: 3 }] });
  sheet.columns = [{ header: 'SECTION', key: 'section', width: 28 }, { header: 'ITEM', key: 'item', width: 72 }, { header: 'STATUS / NOTES', key: 'notes', width: 34 }];
  sheet.insertRow(1, [plan.title]); sheet.mergeCells('A1:C1');
  sheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FFEAFBFF' } }; sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF02070B' } };
  sheet.getRow(2).values = [plan.subtitle]; sheet.mergeCells('A2:C2'); sheet.getCell('A2').font = { italic: true, color: { argb: 'FF39717D' } };
  sheet.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF126274' } };
  for (const section of plan.sections) for (const point of section.points) sheet.addRow({ section: section.heading, item: point, notes: '' });
  sheet.autoFilter = 'A3:C3'; sheet.eachRow((row, number) => { if (number > 3 && number % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF6F8' } }; row.alignment = { vertical: 'top', wrapText: true }; });
  await workbook.xlsx.writeFile(outputPath);
}

export class ArtifactStudio {
  constructor(directory) { this.directory = path.resolve(directory); }

  async create(plan) {
    if (!TYPES[plan?.type]) throw new Error('Unsupported artifact type.');
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const id = crypto.randomUUID(); const fileName = `${id}-${slug(plan.title)}.${plan.type}`; const outputPath = path.join(this.directory, fileName);
    if (plan.type === 'pptx') await createPptx(plan, outputPath);
    else if (plan.type === 'docx') await createDocx(plan, outputPath);
    else await createXlsx(plan, outputPath);
    const stat = await fs.stat(outputPath);
    return { id, type: plan.type, label: TYPES[plan.type], title: plan.title, subtitle: plan.subtitle, fileName: fileName.slice(id.length + 1), bytes: stat.size, outline: plan.sections.map((section) => section.heading), downloadUrl: `/api/artifacts/${id}/download` };
  }

  async resolve(id) {
    const key = String(id || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) return null;
    const files = await fs.readdir(this.directory).catch(() => []);
    const file = files.find((name) => name.startsWith(`${key}-`) && /\.(?:pptx|docx|xlsx)$/i.test(name));
    if (!file) return null;
    const resolved = path.resolve(this.directory, file);
    if (!resolved.startsWith(`${this.directory}${path.sep}`)) return null;
    return { path: resolved, fileName: file.slice(key.length + 1) };
  }
}
