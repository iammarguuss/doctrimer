// src/api/analyze.js (patch): добавлены эвристики doc_type и прочие параметры
import { config } from '../core/config.js';
import {
  ensureVisionModel,
  classifyImageMultiple,
  aggregateAcrossPages,
  buildStructuredReportFromImages,
} from '../ai/vision_ollama.js';
import { ensureEmbedModel, embedText } from '../ai/embed_ollama.js';
import { normalizeDocType } from '../utils/normalize.js';

function applyHeuristics(vote) {
  const t = (vote.extracted_text || '').toLowerCase();
  const idCardHints = [/titre\s*de\s*s[ée]jour/i, /date\s*de\s*naissance/i, /nom[, ]?pr[ée]nom/i, /aufenthalts/i, /permesso\s*di\s*soggiorno/i, /\bche\b/i, /\bua\d{6,}\b/i];
  const letterHints = [/\bректор(у|а)\b/i, /університет\w*/i, /директор/i, /печать|штамп/i];
  if (idCardHints.some(r => r.test(t))) vote.doc_type = 'id_card';
  else if (letterHints.some(r => r.test(t))) vote.doc_type = 'letter';
  return vote;
}

/**
 * @param {string[]} images
 * @param {object} options
 *  - passes (default 3)
 *  - models: { vision, embed }
 *  - report: { maxImages }
 *  - indexing: { enable: true }
 *  - include: { pages: true, runs: true }
 *  - pdf: { light: true }  -> для PDF: passes=1, runs=false
 *  - sourceType: 'pdf' | 'image'
 */
export async function analyzeImages(images, options = {}) {
  const {
    passes = 3,
    models = {},
    report = {},
    indexing = { enable: true },
    include = { pages: true, runs: true },
    pdf = { light: true },
    sourceType = 'image',
  } = options;

  const effectivePasses = (pdf?.light && sourceType === 'pdf') ? 1 : passes;
  const effectiveInclude = (pdf?.light && sourceType === 'pdf') ? { pages: true, runs: false } : include;
  const maxImages = report.maxImages ?? (sourceType === 'pdf' ? 1 : 3);

  const prevVision = config.visionModel;
  const prevEmbed  = config.embedModel;
  if (models.vision) config.visionModel = models.vision;
  if (models.embed)  config.embedModel  = models.embed;

  try {
    await ensureVisionModel();
    if (indexing.enable) { try { await ensureEmbedModel(); } catch {} }

    const pageResults = [];
    for (const imgPath of images) {
      const { runs, aggregated } = await classifyImageMultiple(imgPath, effectivePasses);
      pageResults.push({
        image: imgPath,
        ensemble: { runs: effectiveInclude.runs ? runs : undefined, vote: aggregated },
      });
    }

    let aggregatedDoc = aggregateAcrossPages(pageResults.map(p => p.ensemble.vote));
    aggregatedDoc = applyHeuristics(aggregatedDoc);

    const reportJson = await buildStructuredReportFromImages(images.slice(0, maxImages), aggregatedDoc, maxImages);
    if ((!aggregatedDoc.doc_type || aggregatedDoc.doc_type === 'unknown') && reportJson.doc_type) {
      aggregatedDoc.doc_type = normalizeDocType(reportJson.doc_type);
    }

    const indexText = [
      aggregatedDoc.summary || '',
      aggregatedDoc.extracted_text || '',
      JSON.stringify(aggregatedDoc.entities || {}, null, 0),
    ].join('\n');

    let embedding = { model: config.embedModel, dim: 0, vector: [] };
    if (indexing.enable) {
      try {
        const { vector, dim } = await embedText(indexText);
        embedding = { model: config.embedModel, dim, vector };
      } catch (e) { embedding.error = e.message || String(e); }
    }

    return {
      meta: {
        vision_model: config.visionModel,
        embed_model:  config.embedModel,
        ollama_host:  config.ollamaHost,
        pages_used:   images.length,
        passes_per_image: effectivePasses,
        pdf_light: (pdf?.light && sourceType === 'pdf') ? true : false
      },
      ...(effectiveInclude.pages ? { pages: pageResults } : {}),
      document: { vote: aggregatedDoc, report: reportJson },
      text_dump: aggregatedDoc.extracted_text,
      embedding,
    };
  } finally {
    config.visionModel = prevVision;
    config.embedModel  = prevEmbed;
  }
}
