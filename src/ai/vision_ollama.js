import { Ollama } from 'ollama';
import fs from 'node:fs/promises';
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

/**
 * Классифицирует изображение документа и достаёт ключевые поля.
 * Возвращает объект, соответствующий docSchema.
 */
export async function classifyFromImage(imagePath) {
  const img = await fs.readFile(imagePath);
  const b64 = img.toString('base64');

  // Системная инструкция + JSON-вывод
  const system = [
    'Ты — извлекатель структурированной информации из сканов/фото документов.',
    'Определи тип документа и верни только JSON по заданной схеме.',
    'Если уверенности мало — используй doc_type="unknown".',
    'Не добавляй никаких комментариев, только JSON.'
  ].join(' ');

  // Chat с изображением (images: [base64]) и format: JSON Schema
  const resp = await ollama.chat({
    model: config.visionModel,
    stream: false,
    format: docSchema, // structured outputs
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: 'Определи тип и извлеки ключевые поля (если есть). Верни только JSON.',
        images: [b64]
      }
    ],
    options: {
      temperature: 0  // стабильность
    }
  });

  // Ответ модели в message.content → JSON-строка
  const raw = resp?.message?.content?.trim() || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Если вдруг модель нарушила формат
    parsed = { doc_type: 'unknown', confidence: 0, summary: 'Failed to parse JSON', raw };
  }
  return {
    version: '1.0',
    ...parsed
  };
}
