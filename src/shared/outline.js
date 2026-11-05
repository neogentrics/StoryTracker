'use strict';
// What can hold what. A project holds series and books, and a book holds parts and chapters. Kinds only ever nest
// downward, so a move can't put something inside itself.

const CHILD_KINDS = {
  project: ['series', 'book', 'attachment'],
  series: ['book', 'attachment'],
  book: ['part', 'chapter', 'attachment'],
  part: ['chapter', 'attachment'],
  chapter: ['comment', 'attachment'],
};

function canHold(parentKind, childKind) {
  return CHILD_KINDS[parentKind]?.includes(childKind) ?? false;
}

function indexTree(root) {
  const index = new Map();
  const walk = (node, parent) => {
    index.set(node.id, { node, parent });
    node.children.forEach((child) => walk(child, node));
  };
  walk(root, null);
  return index;
}

function findNode(root, id) {
  return indexTree(root).get(id)?.node ?? null;
}

function isInside(index, id, ancestorId) {
  for (let entry = index.get(id); entry; entry = entry.parent && index.get(entry.parent.id)) {
    if (entry.node.id === ancestorId) return true;
  }
  return false;
}

function besideTarget(target, parent, draggedId, place) {
  const siblings = parent.children.filter((child) => child.id !== draggedId);
  const at = siblings.findIndex((child) => child.id === target.id);
  const before = place === 'after' ? siblings[at + 1] : siblings[at];
  return { parentId: parent.id, beforeId: before?.id ?? null };
}

// Where a dragged row lands. `place` is before, after or into. A row dropped somewhere it can't sit moves up to the
// nearest spot that can take it, so a part dropped on a chapter lands beside that chapter's part.
function resolveDrop(root, draggedId, targetId, place) {
  const index = indexTree(root);
  const dragged = index.get(draggedId)?.node;
  const entry = index.get(targetId);
  if (!dragged || !entry || isInside(index, targetId, draggedId)) return null;
  const { node: target, parent } = entry;

  if (place === 'into' && canHold(target.kind, dragged.kind)) return { parentId: target.id, beforeId: null };
  if (parent && canHold(parent.kind, dragged.kind)) return besideTarget(target, parent, draggedId, place);
  if (canHold(target.kind, dragged.kind)) return { parentId: target.id, beforeId: null };

  for (let above = parent; above; above = index.get(above.id).parent) {
    const holder = index.get(above.id).parent;
    if (holder && canHold(holder.kind, dragged.kind)) return besideTarget(above, holder, draggedId, place);
  }
  return null;
}

// One step up or down among its siblings, for the keyboard.
function resolveStep(root, id, step) {
  const { parent } = indexTree(root).get(id) ?? {};
  if (!parent) return null;
  const at = parent.children.findIndex((child) => child.id === id);
  const target = parent.children[at + step];
  if (!target) return null;
  return besideTarget(target, parent, id, step > 0 ? 'after' : 'before');
}

module.exports = { CHILD_KINDS, canHold, findNode, indexTree, resolveDrop, resolveStep };
