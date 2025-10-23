// Запуск: node tests/test_reader_v1.js ./path/to/image.jpg [--model qwen2.5vl:7b]
import { Ollama } from 'ollama';
import fs from 'node:fs/promises';

const args = process.argv.slice(2);
if (!args[0]) {
  console.error('Укажи путь к изображению: node tests/test_reader_v1.js ./samples/id.jpg');
  process.exit(2);
}
const imagePath = args[0];
const modelArgIndex = args.indexOf('--model');
const model = modelArgIndex >= 0 ? args[modelArgIndex + 1] : (process.env.VISION_MODEL || 'qwen2.5vl:7b');

const host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const ollama = new Ollama({ host });

const schema = {
  type: 'object',
  properties: {
    version: { type: 'string' },
    doc_type: { type: 'string', enum: ['id_card', 'receipt', 'invoice', 'passport', 'other', 'unknown'] },
    language: { type: 'string' },
    confidence: { type: 'number' },
    summary: { type: 'string' },
    extracted_text: { type: 'string' },
    entities: { type: 'object', additionalProperties: true }
  },
  required: ['doc_type', 'confidence'],
  additionalProperties: true
};

async function main() {
  // Быстрая проверка, жив ли Ollama
  try {
    const r = await fetch(`${host}/api/version`);
    if (!r.ok) throw new Error('Ollama /api/version недоступен');
    const v = await r.json();
    console.log('[ok] Ollama version:', v.version);
  } catch (e) {
    console.error('Не могу достучаться до Ollama. Проверь, запущен ли сервис и переменная OLLAMA_HOST.', e.message);
    process.exit(2);
  }

  // Убедимся, что модель доступна локально
  const list = await ollama.list();
  const present = list.models.some(m => m.name === model);
  if (!present) {
    console.error(`Модель ${model} не найдена локально. Выполни: ollama pull ${model}`);
    process.exit(2);
  }

  // Загрузка изображения → base64
  const buf = await fs.readFile(imagePath);
  const b64 = buf.toString('base64');

  const system = [
    'Ты — извлекатель структурированных данных из изображений документов.',
    'Верни только JSON по схеме: doc_type, confidence, language, summary, extracted_text, entities.*'
  ].join(' ');

  const resp = await ollama.chat({
    model,
    stream: false,
    format: schema,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: 'Определи тип документа и извлеки ключевые поля. Только JSON.', images: [b64] }
    ],
    options: { temperature: 0 }
  });

  const raw = resp?.message?.content?.trim() || '{}';
  try {
    const parsed = JSON.parse(raw);
    console.log('=== RESULT JSON ===\n', JSON.stringify(parsed, null, 2));
  } catch {
    console.log('Модель вернула нередактируемый текст, печатаю сырой ответ:\n', raw);
  }
}

main().catch(e => {
  console.error('Ошибка в тесте:', e);
  process.exit(1);
});
