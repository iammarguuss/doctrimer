import { Ollama } from 'ollama';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { config } from '../core/config.js';
import { docSchema } from '../schema/doc_schema.js';

const ollama = new Ollama({ host: config.ollamaHost });

export async function ensureVisionModel() {
  const { models } = await ollama.list();
  const present = models.some(m => m.name === config.visionModel);
  if (!present) {
    throw new Error(
      `Модель ${config.visionModel} не найдена локально. Выполни:\n` +
      `  ollama pull ${config.visionModel}\n` +
      `И убедись, что сервис Ollama запущен (${config.ollamaHost}).`
    );
  }
}

// ------- утилиты -------

function withTimeout(promise, ms, label = 'timeout') {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

async function imageToBase64Jpeg(imagePath) {
  // лёгкая препроцессинг-компрессия, чтобы VLM не зависала на огромных фото
  const buf = await sharp(imagePath)
    .rotate()
    .resize(1600, 1600, { fit: 'inside', fastShrinkOnLoad: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  return buf.toString('base64');
}

function normStr(v) {
  return (v ?? '').toString().trim().replace(/\s+/g, ' ');
}
function majorityVote(arr) {
  const counts = new Map();
  for (const v of arr.map(normStr).filter(Boolean)) {
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = ''; let bestN = 0;
  for (const [k, n] of counts.entries()) {
    if (n > bestN || (n === bestN && k.length > best.length)) { best = k; bestN = n; }
  }
  return best || (arr.find(Boolean) ?? '');
}
function mergeTexts(texts) {
  const seen = new Set();
  const out = [];
  for (const t of texts) {
    const lines = (t || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    for (const ln of lines) {
      const key = ln.toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push(ln); }
    }
  }
  return out.join('\n');
}

function normalizeEntities(parsed) {
  const e = {};
  const sources = [];
  if (parsed && typeof parsed === 'object') {
    if (parsed.entities && typeof parsed.entities === 'object') sources.push(parsed.entities);
    if (parsed.fields && typeof parsed.fields === 'object') sources.push(parsed.fields);
    if (parsed.key_fields && typeof parsed.key_fields === 'object') sources.push(parsed.key_fields);
  }
  for (const src of sources) {
    for (const [k, v] of Object.entries(src)) {
      const val = v == null ? '' : String(v).trim();
      if (val) e[k] = val;
    }
  }
  return e;
}

// ------- основное -------

/**
 * Один проход по изображению: строго JSON по docSchema.
 * Возвращает уже нормализованный объект (entities/summary/extracted_text).
 */
export async function classifyFromImage(imagePath, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs ?? config.visionTimeoutMs ?? 60000);
  const b64 = await imageToBase64Jpeg(imagePath);

  const system = [
    'Ты — извлекатель структурированной информации из фото/сканов документов.',
    'Верни ТОЛЬКО JSON по указанной схеме (docSchema).',
    'Если уверенности мало — doc_type="unknown".',
    'Обязательно заполни extracted_text кратким OCR-подобным текстом (до 5000 символов), если он читается.',
    'Поля клади в "entities"; не используй "fields" или "key_fields".'
  ].join(' ');

  const req = ollama.chat({
    model: config.visionModel,
    stream: false,
    format: docSchema,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: 'Определи тип документа, извлеки ключевые поля в "entities" и добавь extracted_text. Только JSON.', images: [b64] }
    ],
    options: { temperature: 0.1 }
  });

  const resp = await withTimeout(req, timeoutMs, 'VLM classify timeout');
  const raw = resp?.message?.content?.trim() || '{}';

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch {
    parsed = { doc_type: 'unknown', confidence: 0, summary: 'Failed to parse JSON', raw };
  }

  // нормализация
  const entities = normalizeEntities(parsed);
  const extracted_text = parsed.extracted_text || parsed.text || '';
  const language = parsed.language || parsed.lang || '';
  const summary = parsed.summary || '';

  return { version: '1.0', ...parsed, entities, extracted_text, language, summary };
}

/** Мультипроход (по умолчанию 3) */
export async function classifyImageMultiple(imagePath, passes = 3, opts = {}) {
  const runs = [];
  for (let i = 0; i < passes; i++) {
    // можно варьировать seed, но многие VLM игнорируют; оставим константный темп и таймаут
    const r = await classifyFromImage(imagePath, opts);
    runs.push(r);
  }
  const aggregated = aggregateRuns(runs);
  return { runs, aggregated };
}

/** Аггрегация нескольких прогонов */
export function aggregateRuns(runs) {
  const docTypes = runs.map(r => r.doc_type).filter(Boolean);
  const languages = runs.map(r => r.language).filter(Boolean);
  const confidences = runs.map(r => Number(r.confidence) || 0);
  const texts = runs.map(r => r.extracted_text || '');

  const allKeys = new Set();
  for (const r of runs) {
    const ent = normalizeEntities(r);
    Object.keys(ent).forEach(k => allKeys.add(k));
  }

  const entities = {};
  for (const key of allKeys) {
    const vals = runs.map(r => normalizeEntities(r)[key]).filter(Boolean);
    if (vals.length) entities[key] = majorityVote(vals);
  }

  return {
    version: '1.0',
    doc_type: majorityVote(docTypes) || 'unknown',
    language: majorityVote(languages) || '',
    confidence: confidences.length ? Number((confidences.reduce((a,b)=>a+b,0) / confidences.length).toFixed(3)) : 0,
    summary: majorityVote(runs.map(r => r.summary || '')),
    extracted_text: mergeTexts(texts),
    entities
  };
}
