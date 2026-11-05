'use strict';
// Run by crash.test.cjs: saves chapters as fast as it can and reports each one only after the save has returned.
const { Library } = require('../src/main/storage/library');

const [root, id, round] = process.argv.slice(2);
const project = new Library(root).openProject(id);
for (let i = 0; ; i += 1) {
  const item = project.putItem({ kind: 'chapter', parentId: id, title: `${round}-${i}`, body: 'word '.repeat(2000) });
  process.stdout.write(`${item.id}\n`);
}
