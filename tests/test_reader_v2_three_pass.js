// Запуск: node tests/test_reader_v2_three_pass.js ./path/to/image.jpg [--model qwen2.5vl:7b]
import { Ollama } from 'ollama';
import fs from 'node:fs/promises';
import { config } from '../src/core/config.js';
import { classifyImageMultiple, buildStructuredReport } from '../src/ai/vision_ollama.js';
import { embedText, ensureEmbedModel } from '../src/ai/embed_ollama.js';

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
  // Проверка Ollama
  try {
    const r = await fetch(`${host}/api/version`);
    if (!r.ok) throw new Error('Ollama /api/version недоступен');
    const v = await r.json();
    console.log('[ok] Ollama version:', v.version);
  } catch (e) {
    console.error('Не могу достучаться до Ollama. Проверь, запущен ли сервис и переменная OLLAMA_HOST.', e.message);
    process.exit(2);
  }

  // Проверка модели
  const list = await ollama.list();
  const present = list.models.some(m => m.name === model);
  if (!present) {
    console.error(`Модель ${model} не найдена локально. Выполни: ollama pull ${model}`);
    process.exit(2);
  }

  // Эмбеддинг-модель
  try { await ensureEmbedModel(); } catch (e) { console.warn('[warn]', e.message); }

  // 3 прохода + агрегация
  const { runs, aggregated } = await classifyImageMultiple(imagePath, 3);

  // Отчёт модели на базе агрегата
  const report = await buildStructuredReport(imagePath, aggregated);

  // Текст для индекса: агрегированный текст + сводка + entities
  const indexText = [
    aggregated.summary || '',
    aggregated.extracted_text || '',
    JSON.stringify(aggregated.entities || {}, null, 0)
  ].join('\n');
  const { vector, dim } = await embedText(indexText).catch(() => ({ vector: [], dim: 0 }));

  const final = {
    meta: {
      vision_model: model,
      ollama_host: host,
      passes: 3,
      embed_model: process.env.EMBED_MODEL || 'all-minilm',
      embedding_dim: dim
    },
    ensemble: {
      runs,
      vote: aggregated
    },
    report,
    text_dump: aggregated.extracted_text,
    embedding: {
      model: process.env.EMBED_MODEL || 'all-minilm',
      dim,
      vector
    }
  };

  console.log('=== ENSEMBLE REPORT (JSON) ===\n', JSON.stringify(final, null, 2));
}

main().catch(e => {
  console.error('Ошибка в test_reader_v2_three_pass:', e);
  process.exit(1);
});
