'use strict';
// Tables change in numbered steps, and a step that has shipped never changes. Add a new one instead.
// Rules from docs/design/working-with-rt-markdown-reader.md: every item has a permanent random ID, every change is
// logged, and a removal leaves a marker, because sync can't be added to a database that didn't record these.

const STEPS = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE items (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          parent_id TEXT,
          position REAL NOT NULL DEFAULT 0,
          title TEXT NOT NULL DEFAULT '',
          body TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          device_id TEXT NOT NULL
        );
        CREATE INDEX items_by_parent ON items (parent_id, position);

        CREATE TABLE changes (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id TEXT NOT NULL,
          op TEXT NOT NULL CHECK (op IN ('put', 'remove')),
          fields TEXT NOT NULL,
          device_id TEXT NOT NULL,
          at TEXT NOT NULL
        );
        CREATE INDEX changes_by_item ON changes (item_id, seq);

        CREATE TABLE removals (
          item_id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          removed_at TEXT NOT NULL,
          device_id TEXT NOT NULL
        );
      `);
    },
  },
];

module.exports = { STEPS };
