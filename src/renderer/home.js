import { el, words } from './dom.js';

const STATE_NOTES = {
  locked: 'Locked',
  damaged: "This project didn't open.",
};

function projectRow(project, { onOpen, onRemoveSample }) {
  const ready = project.state === 'ready';
  return el(
    'li',
    { class: 'project-row' },
    el(
      'button',
      { class: 'project-open', disabled: !ready, onclick: () => onOpen(project.id) },
      el('span', { class: 'project-title' }, project.title ?? 'Project'),
      el('span', { class: 'project-note' }, ready ? words(project.words) : STATE_NOTES[project.state]),
    ),
    project.sample
      ? el('button', { class: 'quiet', onclick: () => onRemoveSample(project.id) }, 'Remove sample')
      : null,
  );
}

export function renderHome(root, { projects, onOpen, onCreate, onSample, onRemoveSample }) {
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
    el('button', { id: 'start-project', class: 'primary', type: 'submit' }, 'Start a project'),
  );

  root.replaceChildren(
    el(
      'main',
      { class: 'home' },
      el(
        'section',
        { class: 'home-card' },
        el('p', { class: 'brand' }, 'RT Story Tracker'),
        el('h1', {}, first ? 'Where do you want to start?' : 'Your library'),
        first ? el('p', { class: 'lead' }, 'Everything saves by itself, on this computer. There’s nothing to set up.') : null,
        first ? null : el('ul', { class: 'project-list' }, projects.map((item) => projectRow(item, { onOpen, onRemoveSample }))),
        form,
        hasSample ? null : el('button', { id: 'try-sample', class: 'link', onclick: onSample }, 'Or try a sample first'),
      ),
    ),
  );
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
        el('p', { class: 'brand' }, 'RT Story Tracker'),
        el('h1', {}, 'The library didn’t open'),
        el('p', { id: 'failure', class: 'lead' }, message),
      ),
    ),
  );
}
