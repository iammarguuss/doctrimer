import { Ollama } from 'ollama';
import { config } from '../core/config.js';
import { reportSchema } from '../schema/report_schema.js';

const ollama = new Ollama({ host: config.ollamaHost });

export async function ensureTextModel() {
  const { models } = await ollama.list();
  const present = models.some(m => m.name === config.textModel);
  if (!present) {
    throw new Error(
      `Модель для текста ${config.textModel} не найдена локально. Выполни:\n` +
      `  ollama pull ${config.textModel}`
    );
  }
}

/**
 * Построить отчёт по тексту документа (summary, key_points, tags, index_terms, entities).
 * Возвращает JSON по reportSchema.
 */
export async function buildReportFromText(text, hints = {}) {
  const system = [
    'Ты — аналитик документов.',
    'Вход — сырой текст документа.',
    'Задача — вернуть ТОЛЬКО JSON по reportSchema:',
    'doc_type (угадай по содержимому), language (ISO-код или явное имя), confidence (0..1),',
    'summary (краткая выжимка), key_points[], important_fields[], entities{ключ:значение},',
    'index_terms[] (для поиска), tags[] (короткие).'
  ].join(' ');

  const payload = {
    text: String(text || '').slice(0, 100000),
    hints
  };

  const resp = await ollama.chat({
    model: config.textModel,
    stream: false,
    format: reportSchema,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(payload, null, 2) }
    ],
    options: { temperature: 0.1 }
  });

  const raw = resp?.message?.content?.trim() || '{}';
  try {
    const parsed = JSON.parse(raw);
    return { version: '1.0', ...parsed };
  } catch {
    return { version: '1.0', doc_type: 'unknown', summary: 'Failed to parse JSON', entities: {}, raw };
  }
}
