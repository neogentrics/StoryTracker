'use strict';
// Tables change in numbered steps, and a step that has shipped never changes. Add a new one instead.
// Rules from docs/design/working-with-rt-markdown-reader.md: every item has a permanent random ID, every change is
// logged, and a removal leaves a marker, because sync can't be added to a database that didn't record these.

const { countWords, plainText } = require('../../shared/text');

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
  {
    // The word count is worked out from the body on every save, so it's never logged or synced as a change.
    version: 2,
    up(db) {
      db.exec('ALTER TABLE items ADD COLUMN words INTEGER NOT NULL DEFAULT 0');
      const update = db.prepare('UPDATE items SET words = ? WHERE id = ?');
      for (const row of db.prepare("SELECT id, body FROM items WHERE body != ''").all()) {
        update.run(countWords(plainText(row.body)), row.id);
      }
    },
  },
  {
    // A goal is a word target: per day on the project, and per chapter on a chapter. Words written each day are kept by
    // the local date, because a goal for "today" means the author's today.
    version: 3,
    up(db) {
      db.exec(`
        ALTER TABLE items ADD COLUMN goal INTEGER NOT NULL DEFAULT 0;
        CREATE TABLE writing_days (
          day TEXT PRIMARY KEY,
          words INTEGER NOT NULL DEFAULT 0
        );
      `);
    },
  },
  {
    // Trash is a date on the item, and everything under it hides with it. Versions are whole copies of a chapter, kept
    // beside it. They aren't logged as changes: history belongs to this copy of the project.
    version: 4,
    up(db) {
      db.exec(`
        ALTER TABLE items ADD COLUMN trashed_at TEXT;
        CREATE TABLE versions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          words INTEGER NOT NULL,
          reason TEXT NOT NULL,
          at TEXT NOT NULL
        );
        CREATE INDEX versions_by_item ON versions (item_id, id);
      `);
    },
  },
  {
    // A book's details are what stores ask for. Covers are pictures, so they sit apart from the writing.
    version: 5,
    up(db) {
      db.exec(`
        ALTER TABLE items ADD COLUMN details TEXT NOT NULL DEFAULT '';
        CREATE TABLE covers (
          item_id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          data BLOB NOT NULL,
          width INTEGER NOT NULL,
          height INTEGER NOT NULL
        );
      `);
    },
  },
  {
    // An attachment is an item, so it gets the Trash and sync for free, and this table says which stored file holds it.
    // Two items with the same contents share a file. A folder import writes down each file as it goes, so it can resume.
    version: 6,
    up(db) {
      db.exec(`
        CREATE TABLE attachment_files (
          sha256 TEXT PRIMARY KEY,
          file TEXT NOT NULL,
          size INTEGER NOT NULL
        );
        CREATE TABLE folder_imports (
          id TEXT PRIMARY KEY,
          root TEXT NOT NULL,
          state TEXT NOT NULL,
          status TEXT NOT NULL,
          started_at TEXT NOT NULL,
          finished_at TEXT
        );
        CREATE TABLE folder_import_files (
          import_id TEXT NOT NULL,
          file_id TEXT NOT NULL,
          outcome TEXT NOT NULL,
          item_id TEXT,
          note TEXT NOT NULL DEFAULT '',
          PRIMARY KEY (import_id, file_id)
        );
      `);
    },
  },
];

module.exports = { STEPS };
