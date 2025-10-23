import * as sqliteVec from 'sqlite-vec'; // загружает SQL-функции/VT
// Документация: загрузка расширения и работа через better-sqlite3. :contentReference[oaicite:16]{index=16}

export function initVectorIndex(db) {
  sqliteVec.load(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS doc_texts (
      id TEXT PRIMARY KEY,
      doc_path TEXT NOT NULL,
      doc_type TEXT,
      language TEXT,
      summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS doc_embeddings
    USING vec0(
      id TEXT PRIMARY KEY,
      embedding float[384]      -- размер зависит от выбранной модели
    );
  `);
}
