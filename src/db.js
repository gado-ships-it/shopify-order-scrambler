const path = require('path');

// node:sqlite ships in Node 22+; fall back to better-sqlite3 on Node 20.
const major = parseInt(process.version.slice(1).split('.')[0], 10);
let Database;
if (major >= 22) {
  ({ DatabaseSync: Database } = require('node:sqlite'));
} else {
  Database = require('better-sqlite3');
}

const db = new Database(path.join(__dirname, '..', 'sessions.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    shop         TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    scope        TEXT,
    installed_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS shop_config (
    shop    TEXT    PRIMARY KEY,
    format  TEXT    NOT NULL DEFAULT 'alphanumeric',
    prefix  TEXT    NOT NULL DEFAULT 'ORD',
    length  INTEGER NOT NULL DEFAULT 6
  );
  CREATE TABLE IF NOT EXISTS scramble_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    shop          TEXT    NOT NULL,
    order_id      INTEGER NOT NULL,
    original_name TEXT,
    new_name      TEXT    NOT NULL,
    created_at    INTEGER DEFAULT (strftime('%s','now'))
  );
`);

const stmts = {
  upsertSession: db.prepare(`INSERT OR REPLACE INTO sessions (shop, access_token, scope) VALUES (?, ?, ?)`),
  getSession:    db.prepare(`SELECT * FROM sessions WHERE shop = ?`),
  deleteSession: db.prepare(`DELETE FROM sessions WHERE shop = ?`),
  getConfig:     db.prepare(`SELECT * FROM shop_config WHERE shop = ?`),
  upsertConfig:  db.prepare(`INSERT OR REPLACE INTO shop_config (shop, format, prefix, length) VALUES (?, ?, ?, ?)`),
  insertLog:     db.prepare(`INSERT INTO scramble_log (shop, order_id, original_name, new_name) VALUES (?, ?, ?, ?)`),
  recentLogs:    db.prepare(`SELECT * FROM scramble_log WHERE shop = ? ORDER BY created_at DESC LIMIT ?`),
};

module.exports = {
  saveSession(shop, accessToken, scope) {
    stmts.upsertSession.run(shop, accessToken, scope);
  },
  getSession(shop) {
    return stmts.getSession.get(shop) || null;
  },
  deleteSession(shop) {
    stmts.deleteSession.run(shop);
  },
  getConfig(shop) {
    return stmts.getConfig.get(shop) || { shop, format: 'alphanumeric', prefix: 'ORD', length: 6 };
  },
  saveConfig(shop, { format, prefix, length }) {
    stmts.upsertConfig.run(shop, format, prefix, parseInt(length, 10));
  },
  logScramble(shop, orderId, originalName, newName) {
    stmts.insertLog.run(shop, orderId, originalName, newName);
  },
  recentLogs(shop, limit = 20) {
    return stmts.recentLogs.all(shop, limit);
  },
};
