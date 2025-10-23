import Database from 'better-sqlite3';
import fs from 'node:fs';
import { config } from '../core/config.js';
import { log } from '../core/logger.js';

export function openDb() {
  const db = new Database(config.sqlitePath);
  return db;
}

export function runMigrations(db) {
  const sql = fs.readFileSync('./migrations/001_init.sql', 'utf-8');
  db.exec(sql);
  log.info('Миграции применены.');
}
