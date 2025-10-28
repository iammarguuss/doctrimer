// Запуск: node tests/test_reader_v2_three_pass.js ./path/to/image.jpg [--model qwen2.5vl:7b]
import { Ollama } from 'ollama';
import fs from 'node:fs/promises';
import { config } from '../src/core/config.js';
import { classifyImageMultiple, buildStructuredReport } from '../src/ai/vision_ollama.js';
import { embedText, ensureEmbedModel } from '../src/ai/embed_ollama.js';
import { normalizeDocType } from '../src/utils/normalize.js';

const args = process.argv.slice(2);
if (!args[0]) {
  console.error('Укажи путь к изображению: node tests/test_reader_v2_three_pass.js ./samples/id.jpg');
  process.exit(2);
}
const imagePath = args[0];
const modelArgIndex = args.indexOf('--model');
const model = modelArgIndex >= 0 ? args[modelArgIndex + 1] : (process.env.VISION_MODEL || config.visionModel);

const host = process.env.OLLAMA_HOST || config.ollamaHost;
const ollama = new Ollama({ host });

async function main() {
  try {
    const r = await fetch(`${host}/api/version`);
    if (!r.ok) throw new Error('Ollama /api/version недоступен');
    const v = await r.json();
    console.log('[ok] Ollama version:', v.version);
  } catch (e) {
    console.error('Не могу достучаться до Ollama. Проверь, запущен ли сервис и переменная OLLAMA_HOST.', e.message);
    process.exit(2);
  }

  const list = await ollama.list();
  const present = list.models.some(m => (m.name === model) || (m.name?.startsWith(model + ':')));
  if (!present) {
    console.error(`Модель ${model} не найдена локально. Выполни: ollama pull ${model}`);
    process.exit(2);
  }

  // 3 прохода + агрегат
  const { runs, aggregated } = await classifyImageMultiple(imagePath, 3);
  let vote = { ...aggregated };

  // Отчёт модели на базе агрегата
  const report = await buildStructuredReport(imagePath, vote);

  // Если doc_type неизвестен — подмешаем из отчёта
  if (!vote.doc_type || vote.doc_type === 'unknown') {
    vote.doc_type = normalizeDocType(report.doc_type || 'unknown');
  }

  // Индексируемый текст
  const indexText = [
    vote.summary || '',
    vote.extracted_text || '',
    JSON.stringify(vote.entities || {}, null, 0)
  ].join('\n');

  // Эмбеддинг
  let vector = []; let dim = 0;
  try {
    await ensureEmbedModel();
    const emb = await embedText(indexText);
    vector = emb.vector; dim = emb.dim;
  } catch (e) {
    console.warn('[warn] Embedding unavailable:', e.message);
  }

  const final = {
    meta: {
      vision_model: model,
      ollama_host: host,
      passes: 3,
      embed_model: process.env.EMBED_MODEL || 'all-minilm',
      embedding_dim: dim
    },
    ensemble: { runs, vote },
    report,
    text_dump: vote.extracted_text,
    embedding: { model: process.env.EMBED_MODEL || 'all-minilm', dim, vector }
  };

  console.log('=== ENSEMBLE REPORT (JSON) ===\n', JSON.stringify(final, null, 2));
}

main().catch(e => {
  console.error('Ошибка в test_reader_v2_three_pass:', e);
  process.exit(1);
});
