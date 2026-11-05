// One Trash window for both kinds of thing: what's inside a project, and whole projects on the library screen.
import { el } from './dom.js';
import { icon } from './icons.js';

const days = (count) => (count === 1 ? '1 day left' : `${count} days left`);

export async function openTrash({ title, load, restore, onError }) {
  document.getElementById('trash')?.remove();
  const list = el('ul', { id: 'trash-list', class: 'trash-list' });

  async function show() {
    const items = await load();
    list.replaceChildren(
      ...(items.length
        ? items.map((item) =>
            el(
              'li',
              { class: 'trash-row' },
              el('span', { class: 'trash-title' }, item.title || 'Untitled'),
              el('span', { class: 'trash-note' }, days(item.daysLeft)),
              el(
                'button',
                {
                  'aria-label': `Restore ${item.title}`,
                  onclick: async () => {
                    try {
                      await restore(item.id);
                      await show();
                    } catch (error) {
                      onError(error.message);
                    }
                  },
                },
                icon('restore'),
                'Restore',
              ),
            ))
        : [el('li', { class: 'quiet-note' }, 'The Trash is empty.')]),
    );
  }

  const dialog = el(
    'dialog',
    { id: 'trash', class: 'dialog' },
    el('h2', {}, title),
    el('p', { class: 'quiet-note' }, 'Things wait here for 30 days, then they’re gone for good.'),
    list,
    el('div', { class: 'dialog-actions' }, el('button', { id: 'trash-close', class: 'primary', onclick: () => dialog.close() }, 'Done')),
  );
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  await show();
  dialog.showModal();
}
