import { config } from './core/config.js';
import { log } from './core/logger.js';
import { openDb, runMigrations } from './db/sqlite.js';
import { initVectorIndex } from './db/vector_index.js';
import { watchInbox } from './ingest/watcher.js';
import { processSingleFile } from './pipeline/process_file.js';
import { ensureVisionModel } from './ai/vision_ollama.js';

async function main() {
  await ensureVisionModel();
  const db = openDb();
  runMigrations(db);
  initVectorIndex(db);

  watchInbox(config.dirs.inbox, async (file) => {
    const out = await processSingleFile(file);
    log.info('Результат обработки:', out);
    // TODO: сохранить в БД + дублировать файлы под индексными именами
  });

  log.info('doctrimer запущен. Смотри папку:', config.dirs.inbox);
}

main().catch(e => {
  log.error(e);
  process.exit(1);
});
