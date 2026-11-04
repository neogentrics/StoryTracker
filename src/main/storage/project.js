'use strict';
const crypto = require('node:crypto');
const { copyDatabase, databaseInfo } = require('./database');

const REMOVAL_MARKER_DAYS = 90;
const FIELDS = ['kind', 'parentId', 'position', 'title', 'body'];
const COLUMNS = { kind: 'kind', parentId: 'parent_id', position: 'position', title: 'title', body: 'body' };

function toItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    parentId: row.parent_id,
    position: row.position,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deviceId: row.device_id,
  };
}

class Project {
  constructor(db, { id, file, deviceId, now = () => new Date() }) {
    this.db = db;
    this.id = id;
    this.file = file;
    this.deviceId = deviceId;
    this.now = now;
  }

  log(itemId, op, fields, at) {
    this.db
      .prepare('INSERT INTO changes (item_id, op, fields, device_id, at) VALUES (?, ?, ?, ?, ?)')
      .run(itemId, op, JSON.stringify(fields), this.deviceId, at);
  }

  putItem(input) {
    return this.db.transaction(() => {
      const at = this.now().toISOString();
      const id = input.id ?? crypto.randomUUID();
      if (this.db.prepare('SELECT 1 FROM removals WHERE item_id = ?').get(id)) {
        throw new Error("This item was removed, so it can't be saved under the same ID.");
      }
      const existing = this.getItem(id);
      if (!existing) {
        if (!input.kind) throw new Error('A new item needs a kind.');
        const item = { parentId: null, position: 0, title: '', body: '', ...input };
        this.db
          .prepare(`INSERT INTO items (id, kind, parent_id, position, title, body, created_at, updated_at, device_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, item.kind, item.parentId, item.position, item.title, item.body, at, at, this.deviceId);
        this.log(id, 'put', FIELDS, at);
        return this.getItem(id);
      }
      const changed = FIELDS.filter((field) => field in input && input[field] !== existing[field]);
      if (changed.length === 0) return existing;
      const sets = changed.map((field) => `${COLUMNS[field]} = ?`).join(', ');
      this.db
        .prepare(`UPDATE items SET ${sets}, updated_at = ?, device_id = ? WHERE id = ?`)
        .run(...changed.map((field) => input[field]), at, this.deviceId, id);
      this.log(id, 'put', changed, at);
      return this.getItem(id);
    })();
  }

  getItem(id) {
    return toItem(this.db.prepare('SELECT * FROM items WHERE id = ?').get(id));
  }

  listChildren(parentId) {
    return this.db
      .prepare('SELECT * FROM items WHERE parent_id IS ? ORDER BY position, created_at')
      .all(parentId)
      .map(toItem);
  }

  // Removes an item and everything under it. Each one leaves a marker, so a device that was switched off can't bring
  // it back. No screen calls this yet: an author needs a way to undo it before any delete button ships.
  removeItem(id) {
    return this.db.transaction(() => {
      const at = this.now().toISOString();
      const rows = this.db
        .prepare(`WITH RECURSIVE tree(id) AS (
                    SELECT id FROM items WHERE id = ?
                    UNION
                    SELECT items.id FROM items JOIN tree ON items.parent_id = tree.id
                  )
                  SELECT items.id, items.kind FROM items JOIN tree ON items.id = tree.id`)
        .all(id);
      for (const row of rows) {
        this.db.prepare('DELETE FROM items WHERE id = ?').run(row.id);
        this.db
          .prepare('INSERT INTO removals (item_id, kind, removed_at, device_id) VALUES (?, ?, ?, ?)')
          .run(row.id, row.kind, at, this.deviceId);
        this.log(row.id, 'remove', [], at);
      }
      return rows.length;
    })();
  }

  changesSince(seq = 0) {
    return this.db
      .prepare('SELECT * FROM changes WHERE seq > ? ORDER BY seq')
      .all(seq)
      .map((row) => ({
        seq: row.seq,
        itemId: row.item_id,
        op: row.op,
        fields: JSON.parse(row.fields),
        deviceId: row.device_id,
        at: row.at,
      }));
  }

  removalMarkers() {
    return this.db
      .prepare('SELECT item_id AS itemId, kind, removed_at AS removedAt, device_id AS deviceId FROM removals')
      .all();
  }

  pruneRemovalMarkers() {
    const cutoff = new Date(this.now().getTime() - REMOVAL_MARKER_DAYS * 86400000).toISOString();
    return this.db.prepare('DELETE FROM removals WHERE removed_at < ?').run(cutoff).changes;
  }

  title() {
    return this.getItem(this.id)?.title ?? '';
  }

  backupTo(destination) {
    copyDatabase(this.db, this.file, destination);
  }

  check() {
    return this.db.pragma('integrity_check', { simple: true }) === 'ok';
  }

  info() {
    return databaseInfo(this.db);
  }

  close() {
    this.db.close();
  }
}

module.exports = { Project, REMOVAL_MARKER_DAYS };
