import chokidar from 'chokidar';
import path from 'node:path';
import { log } from '../core/logger.js';

export function watchInbox(inboxDir, onFile) {
  const watcher = chokidar.watch(inboxDir, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    depth: 0
  });
  watcher.on('add', async p => {
    log.info('Новый файл:', path.basename(p));
    try { await onFile(p); } catch (e) { log.error(e); }
  });
  return watcher;
}
