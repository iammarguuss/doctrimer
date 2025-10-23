import 'dotenv/config';

export const config = {
  ollamaHost: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
  visionModel: process.env.VISION_MODEL || 'qwen2.5vl:7b',
  embedModel: process.env.EMBED_MODEL || 'all-minilm',
  sqlitePath: process.env.SQLITE_PATH || './data/doctrimer.db',
  dirs: {
    inbox: process.env.INBOX_DIR || './data/inbox',
    objects: process.env.OBJECTS_DIR || './data/objects',
    byIndex: process.env.BY_INDEX_DIR || './data/by-index',
  }
};
