import { Ollama } from 'ollama';
import fs from 'node:fs/promises';
import { config } from '../core/config.js';
import { docSchema } from '../schema/doc_schema.js';
import { reportSchema } from '../schema/report_schema.js';
import { ocrImageToText } from './ocr_tesseract.js';
import { normalizeDocType } from '../utils/normalize.js';

const ollama = new Ollama({ host: config.ollamaHost });

export async function ensureVisionModel() {
  const { models } = await ollama.list();
  const present = models.some(m => m.name === config.visionModel || m.name?.startsWith(config.visionModel + ':'));
  if (!present) throw new Error(`Модель ${config.visionModel} не найдена локально. Выполни: ollama pull ${config.visionModel}`);
}

function normStr(v) { return (v ?? '').toString().trim().replace(/\s+/g, ' '); }
function majorityVote(arr) { const m=new Map(); for (const v of arr.map(normStr).filter(Boolean)) m.set(v,(m.get(v)||0)+1); let b='',n=0; for (const [k,c] of m) if (c>n||(c===n&&k.length>b.length)){b=k;n=c;} return b || (arr.find(Boolean) ?? ''); }
function mergeTexts(texts) {
  const seen = new Set(); const out = [];
  for (const t of texts) {
    const lines = (t || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    for (const ln of lines) { const key = ln.toLowerCase(); if (!seen.has(key)) { seen.add(key); out.push(ln); } }
  }
  return out.join('\n');
}

export async function classifyFromImage(imagePath) {
  const img = await fs.readFile(imagePath);
  const b64 = img.toString('base64');

  const system = 'Определи тип документа (id_card, passport, receipt, invoice, letter, certificate, contract, other, unknown) и верни ТОЛЬКО JSON по схеме.';
  const resp = await ollama.chat({
    model: config.visionModel, stream: false, format: docSchema,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: 'Определи тип и извлеки ключевые поля (если есть). ТОЛЬКО JSON.', images: [b64] }
    ],
    options: { temperature: 0.0 }
  });

  const raw = resp?.message?.content?.trim() || '{}';
  let parsed; try { parsed = JSON.parse(raw); } catch { parsed = { doc_type: 'unknown', confidence: 0, summary: 'Failed to parse JSON', raw }; }
  parsed.doc_type = normalizeDocType(parsed.doc_type);

  const text = (parsed.extracted_text || '').trim();
  if (!text || text.length < 20) {
    try {
      const ocr = await ocrImageToText(imagePath, 'eng+rus+ukr+deu+fra');
      if (ocr && ocr.trim().length >= 10) parsed.extracted_text = (text ? (text + '\n') : '') + ocr.trim();
    } catch {}
  }

  return { version: '1.0', ...parsed };
}

export async function classifyImageMultiple(imagePath, passes = 3) {
  const runs = [];
  for (let i = 0; i < passes; i++) runs.push(await classifyFromImage(imagePath));
  const aggregated = aggregateRuns(runs);
  return { runs, aggregated };
}

export function aggregateRuns(runs) {
  const docTypes = runs.map(r => r.doc_type).filter(Boolean);
  const languages = runs.map(r => r.language).filter(Boolean);
  const confidences = runs.map(r => Number(r.confidence) || 0);
  const texts = runs.map(r => r.extracted_text || '');

  const allKeys = new Set();
  for (const r of runs) if (r.entities && typeof r.entities === 'object') Object.keys(r.entities).forEach(k => allKeys.add(k));
  const entities = {};
  for (const key of allKeys) {
    const vals = runs.map(r => r.entities?.[key]).filter(Boolean);
    if (vals.length) entities[key] = majorityVote(vals);
  }

  return {
    version: '1.0',
    doc_type: normalizeDocType(majorityVote(docTypes) || 'unknown'),
    language: majorityVote(languages) || '',
    confidence: confidences.length ? Number((confidences.reduce((a,b)=>a+b,0) / confidences.length).toFixed(3)) : 0,
    summary: majorityVote(runs.map(r => r.summary || '')),
    extracted_text: mergeTexts(texts),
    entities
  };
}

export function aggregateAcrossPages(pageAggregates) { return aggregateRuns(pageAggregates || []); }

export async function buildStructuredReport(imagePath, aggregated, imagesB64Override = null) {
  let images = imagesB64Override;
  if (!images || !images.length) {
    const img = await fs.readFile(imagePath);
    images = [img.toString('base64')];
  }
  const system = 'Верни ТОЛЬКО JSON по reportSchema: doc_type, language, confidence, summary, key_points[], important_fields[], entities{}, index_terms[], tags[]';
  const userContent = 'Агрегат:\n' + JSON.stringify(aggregated, null, 2);
  const resp = await ollama.chat({
    model: config.visionModel, stream: false, format: reportSchema,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent, images }
    ],
    options: { temperature: 0.05 }
  });
  const raw = resp?.message?.content?.trim() || '{}';
  try { return JSON.parse(raw); } catch { return { doc_type: aggregated.doc_type || 'unknown', summary: 'Failed to parse JSON', entities: {}, raw }; }
}

export async function buildStructuredReportFromImages(imagePaths, aggregated, maxImages = 3) {
  const imgs = [];
  for (const p of imagePaths.slice(0, maxImages)) {
    const b = await fs.readFile(p);
    imgs.push(b.toString('base64'));
  }
  return buildStructuredReport(null, aggregated, imgs);
}
