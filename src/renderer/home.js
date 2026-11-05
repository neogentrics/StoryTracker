import { el, words } from './dom.js';
import { icon } from './icons.js';

const STATE_NOTES = {
  locked: 'Locked',
  damaged: "This project didn't open.",
};

function projectRow(project, { onOpen, onRemoveSample, onTrashProject }) {
  const ready = project.state === 'ready';
  return el(
    'li',
    { class: 'project-row' },
    el(
      'button',
      { class: 'project-open', disabled: !ready, onclick: () => onOpen(project.id) },
      icon('book'),
      el('span', { class: 'project-title' }, project.title ?? 'Project'),
      el('span', { class: 'project-note' }, ready ? words(project.words) : STATE_NOTES[project.state]),
    ),
    project.sample
      ? el('button', { class: 'quiet', onclick: () => onRemoveSample(project.id) }, 'Remove sample')
      : el(
          'button',
          { class: 'quiet icon-only', title: 'Move to Trash', 'aria-label': `Move ${project.title} to Trash`, onclick: () => onTrashProject(project) },
          icon('trash'),
        ),
  );
}

export function renderHome(root, { projects, onOpen, onCreate, onSample, onRemoveSample, onOpenFile, onTrashProject, onShowTrash }) {
  const first = projects.length === 0;
  const hasSample = projects.some((project) => project.sample);
  const title = el('input', {
    id: 'new-title',
    type: 'text',
    placeholder: 'The name of your book or series',
    'aria-label': 'Project name',
    maxlength: '500',
  });
  const form = el(
    'form',
    {
      class: 'start-form',
      onsubmit: (event) => {
        event.preventDefault();
        onCreate(title.value);
      },
    },
    title,
    el('button', { id: 'start-project', class: 'primary', type: 'submit' }, icon('plus'), 'Start a project'),
  );

  root.replaceChildren(
    el(
      'main',
      { class: 'home' },
      el(
        'section',
        { class: 'home-card' },
        el('div', { class: 'brand' }, el('img', { src: 'icon.png', alt: '', width: '40', height: '40' }), 'RT Story Tracker'),
        el('h1', {}, first ? 'Where do you want to start?' : 'Your library'),
        first ? el('p', { class: 'lead' }, 'Everything saves by itself, on this computer. There’s nothing to set up.') : null,
        first
          ? null
          : el('ul', { class: 'project-list' }, projects.map((item) => projectRow(item, { onOpen, onRemoveSample, onTrashProject }))),
        form,
        el(
          'div',
          { class: 'home-links' },
          hasSample ? null : el('button', { id: 'try-sample', class: 'link' }, icon('sample'), 'Try a sample'),
          el('button', { id: 'open-file', class: 'link', onclick: onOpenFile }, icon('open'), 'Open a project file'),
          el('button', { id: 'open-trash', class: 'link', onclick: onShowTrash }, icon('trash'), 'Trash'),
        ),
      ),
    ),
  );
  root.querySelector('#try-sample')?.addEventListener('click', onSample);
  if (first) title.focus();
}

export function renderFailure(root, message) {
  root.replaceChildren(
    el(
      'main',
      { class: 'home' },
      el(
        'section',
        { class: 'home-card' },
        el('div', { class: 'brand' }, el('img', { src: 'icon.png', alt: '', width: '40', height: '40' }), 'RT Story Tracker'),
        el('h1', {}, 'That didn’t work'),
        el('p', { id: 'failure', class: 'lead' }, message),
        el('button', { class: 'primary', onclick: () => window.location.reload() }, 'Try again'),
      ),
    ),
  );
}
