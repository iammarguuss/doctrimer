PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  src_path TEXT NOT NULL,
  stored_path TEXT,
  index_name TEXT,
  mime TEXT,
  doc_type TEXT,
  language TEXT,
  summary TEXT,
  text TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

/* см. initVectorIndex для таблиц эмбеддингов */
