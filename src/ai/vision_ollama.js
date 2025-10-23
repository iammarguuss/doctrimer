import { Ollama } from 'ollama';
import fs from 'node:fs/promises';
import { config } from '../core/config.js';
import { docSchema } from '../schema/doc_schema.js';
import { reportSchema } from '../schema/report_schema.js';

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
    if (n > bestN || (n === bestN && k.length > best.length)) {
      best = k; bestN = n;
    }
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
      if (!seen.has(key)) {
        seen.add(key);
        out.push(ln);
      }
    }
  }
  // Плюс цельный абзац, если коротко
  return out.join('\n');
}

/**
 * Один проход: классифицирует изображение документа и достаёт ключевые поля.
 * Возвращает объект по docSchema.
 */
export async function classifyFromImage(imagePath) {
  const img = await fs.readFile(imagePath);
  const b64 = img.toString('base64');

  const system = [
    'Ты — извлекатель структурированной информации из сканов/фото документов.',
    'Определи тип документа и верни только JSON по заданной схеме.',
    'Если уверенности мало — используй doc_type="unknown".',
    'Не добавляй никаких комментариев, только JSON.'
  ].join(' ');

  const resp = await ollama.chat({
    model: config.visionModel,
    stream: false,
    format: docSchema,
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: 'Определи тип и извлеки ключевые поля (если есть). Верни только JSON.',
        images: [b64]
      }
    ],
    options: { temperature: 0.2 }
  });

  const raw = resp?.message?.content?.trim() || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { doc_type: 'unknown', confidence: 0, summary: 'Failed to parse JSON', raw };
  }
  return { version: '1.0', ...parsed };
}

/**
 * Несколько проходов с ансамблированием (по умолчанию 3).
 * Возвращает { runs: [...], aggregated: {...} }.
 */
export async function classifyImageMultiple(imagePath, passes = 3) {
  const runs = [];
  for (let i = 0; i < passes; i++) {
    const r = await classifyFromImage(imagePath);
    runs.push(r);
  }
  const aggregated = aggregateRuns(runs);
  return { runs, aggregated };
}

/**
 * Агрегирует несколько прогонов модели.
 */
export function aggregateRuns(runs) {
  const docTypes = runs.map(r => r.doc_type).filter(Boolean);
  const languages = runs.map(r => r.language).filter(Boolean);
  const confidences = runs.map(r => Number(r.confidence) || 0);
  const texts = runs.map(r => r.extracted_text || '');

  const allKeys = new Set();
  for (const r of runs) {
    if (r.entities && typeof r.entities === 'object') {
      Object.keys(r.entities).forEach(k => allKeys.add(k));
    }
  }
  const entities = {};
  for (const key of allKeys) {
    const vals = runs.map(r => r.entities?.[key]).filter(Boolean);
    if (!vals.length) continue;
    entities[key] = majorityVote(vals);
  }

  const aggregated = {
    version: '1.0',
    doc_type: majorityVote(docTypes) || 'unknown',
    language: majorityVote(languages) || '',
    confidence: confidences.length ? Number((confidences.reduce((a,b)=>a+b,0) / confidences.length).toFixed(3)) : 0,
    summary: majorityVote(runs.map(r => r.summary || '')),
    extracted_text: mergeTexts(texts),
    entities
  };
  return aggregated;
}

/**
 * Построить финальный отчёт с помощью модели по изображению и агрегированным данным.
 * Возвращает JSON по reportSchema.
 */
export async function buildStructuredReport(imagePath, aggregated) {
  const img = await fs.readFile(imagePath);
  const b64 = img.toString('base64');

  const system = [
    'Ты — аналитик документов.',
    'Вход: изображение документа и предварительно агрегированные извлечения.',
    'Задача: вернуть только JSON по заданной схеме reportSchema:',
    'doc_type, language, confidence (оценка 0..1), summary, key_points[], important_fields[], entities{...}, index_terms[].',
    'index_terms — короткие ключевые слова/имена для поиска.'
  ].join(' ');

  const userContent = [
    'Вот агрегированные извлечения:',
    JSON.stringify(aggregated, null, 2),
    'На основе изображения и этих данных верни ТОЛЬКО JSON отчёта.'
  ].join('\n');

  const resp = await ollama.chat({
    model: config.visionModel,
    stream: false,
    format: reportSchema,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent, images: [b64] }
    ],
    options: { temperature: 0.1 }
  });

  const raw = resp?.message?.content?.trim() || '{}';
  try {
    return JSON.parse(raw);
  } catch {
    return { doc_type: aggregated.doc_type || 'unknown', summary: 'Failed to parse JSON', entities: {}, raw };
  }
}
