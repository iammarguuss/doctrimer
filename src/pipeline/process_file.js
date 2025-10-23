import path from 'node:path';
import { classifyImageMultiple } from '../ai/vision_ollama.js';
import { pdftoppmAvailable, rasterizePdfToPngs } from '../ingest/pdf.js';

function makeTagsFromAggregated(agg) {
  const tags = new Set();
  if (agg.doc_type) tags.add(String(agg.doc_type).toLowerCase());
  if (agg.language) tags.add(String(agg.language).toLowerCase());

  const stop = new Set(['the','and','of','de','la','le','au','du','des','et','a','à','les',
                        'и','в','на','по','с','к','для','до','из','от','за','о']);

  const pushTokens = (s) => {
    const toks = String(s || '')
      .toLowerCase()
      .split(/[^a-zA-Zа-яА-ЯёЁ0-9]+/).filter(Boolean);
    for (const t of toks) {
      if (t.length >= 2 && t.length <= 24 && !stop.has(t)) tags.add(t);
      if (tags.size >= 20) break;
    }
  };

  if (agg.entities && typeof agg.entities === 'object') {
    for (const [k, v] of Object.entries(agg.entities)) {
      pushTokens(k);
      pushTokens(v);
    }
  }
  // немного из текста
  pushTokens(agg.extracted_text || '');

  return Array.from(tags).slice(0, 20);
}

function makeSimpleReport(agg) {
  const importantCandidates = ['name','full_name','id_number','document_number','nationality','country',
                               'date_of_birth','birth_date','date_of_issue','issue_date','date_of_expiry','expiry_date','valid_until'];
  const important_fields = importantCandidates.filter(k => agg.entities?.[k]);

  let summary = agg.summary && agg.summary.trim();
  if (!summary) {
    const parts = [];
    if (agg.doc_type) parts.push(`Тип: ${agg.doc_type}`);
    if (important_fields.length) {
      parts.push('Поля: ' + important_fields.map(k => `${k}: ${agg.entities[k]}`).join(', '));
    }
    summary = parts.join('. ');
  }

  const key_points = [];
  if (agg.entities) {
    for (const [k, v] of Object.entries(agg.entities)) {
      key_points.push(`${k}: ${v}`);
      if (key_points.length >= 12) break;
    }
  }

  const tags = makeTagsFromAggregated(agg);
  return {
    version: '1.0',
    doc_type: agg.doc_type || 'unknown',
    language: agg.language || '',
    confidence: typeof agg.confidence === 'number' ? agg.confidence : 0,
    summary,
    key_points,
    important_fields,
    entities: agg.entities || {},
    index_terms: tags,
    tags
  };
}

/** Обработка изображения: 3-pass */
async function processImageFile(imagePath) {
  const { runs, aggregated } = await classifyImageMultiple(imagePath, 3, { timeoutMs: process.env.VISION_TIMEOUT_MS });
  const report = makeSimpleReport(aggregated);
  return {
    source: { kind: 'image', path: imagePath },
    ensemble: { runs, vote: aggregated },
    report,
    text_dump: aggregated.extracted_text || ''
  };
}

/** Обработка PDF: растеризация 1-й страницы → 3-pass */
async function processPdfFile(pdfPath) {
  if (!pdftoppmAvailable()) {
    return {
      source: { kind: 'pdf', path: pdfPath },
      error: 'pdftoppm (Poppler) не найден. Для визуального анализа PDF установи Poppler и пропиши PDFTOPPM_PATH в .env.',
      report: { version: '1.0', doc_type: 'document', summary: '', entities: {}, key_points: [], important_fields: [], index_terms: [], tags: [] },
      text_dump: ''
    };
  }
  const outDir = path.join(path.dirname(pdfPath), '.tmp_images');
  const pages = await rasterizePdfToPngs(pdfPath, outDir, 1, 200);
  if (!pages.length) {
    return {
      source: { kind: 'pdf', path: pdfPath },
      error: 'Не удалось растеризовать первую страницу PDF.',
      report: { version: '1.0', doc_type: 'document', summary: '', entities: {}, key_points: [], important_fields: [], index_terms: [], tags: [] },
      text_dump: ''
    };
  }
  const first = pages[0];
  const { runs, aggregated } = await classifyImageMultiple(first, 3, { timeoutMs: process.env.VISION_TIMEOUT_MS });
  const report = makeSimpleReport(aggregated);
  return {
    source: { kind: 'pdf', path: pdfPath, page_image: first },
    ensemble: { runs, vote: aggregated },
    report,
    text_dump: aggregated.extracted_text || ''
  };
}

/** Универсальный вход */
export async function processSingleFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return processImageFile(filePath);
  }
  if (ext === '.pdf') {
    return processPdfFile(filePath);
  }
  return { source: { kind: 'unknown', path: filePath }, error: 'Unsupported file type' };
}
