import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * node:sqlite (builtin, Node >=22.13, sin flag) en vez de better-sqlite3: cero compilacion
 * nativa -> cero toolchain C++/Python como requisito de "pnpm install" (mandato reproducibilidad
 * sin pasos manuales no documentados). Desviacion documentada respecto a la mencion literal
 * "better-sqlite3" de SPEC-PIXELFORGE-PLATFORM §3/§13.3.
 */
export function openDb(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  if (dbPath !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function runMigrations(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    db
      .prepare('SELECT id FROM _migrations')
      .all()
      .map((row) => (row as { id: string }).id),
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (@id, @appliedAt)').run({
        id: file,
        appliedAt: new Date().toISOString(),
      });
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
