// Запуск: node tests/test_reader_universal_v1.js ./path/to/file.(jpg|png|webp|pdf)
import { config } from '../src/core/config.js';
import { processSingleFile } from '../src/pipeline/process_file.js';

const args = process.argv.slice(2);
if (!args[0]) {
  console.error('Укажи путь к файлу: node tests/test_reader_universal_v1.js ./samples/pm1.jpg');
  process.exit(2);
}

const filePath = args[0];
const host = process.env.OLLAMA_HOST || config.ollamaHost;

async function main() {
  // Проверка Ollama
  try {
    const r = await fetch(`${host}/api/version`);
    if (!r.ok) throw new Error('Ollama /api/version недоступен');
    const v = await r.json();
    console.log('[ok] Ollama version:', v.version);
  } catch (e) {
    console.error('Не могу достучаться до Ollama. Проверь, запущен ли сервис и OLLAMA_HOST.', e.message);
  }

  const out = await processSingleFile(filePath);
  console.log('=== UNIVERSAL REPORT JSON ===\n', JSON.stringify(out, null, 2));
}

main().catch(e => {
  console.error('Ошибка в universal-тесте:', e);
  process.exit(1);
});
