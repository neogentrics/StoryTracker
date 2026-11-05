// The door to a locked project, or a locked project file. It only ever asks: the app decides whether an answer is right.
import { el } from './dom.js';
import { icon } from './icons.js';

function secretInput(id, label, type = 'password') {
  return el('input', { id, type, 'aria-label': label, placeholder: label, autocomplete: 'off', spellcheck: 'false' });
}

// computer: { on, code, quick }. open({ how, secret, code, forgot }) rejects with the words to show.
export function renderLock(root, { title, computer, open, onBack }) {
  const opensHere = computer.on && computer.quick && !computer.code;
  const problem = el('p', { id: 'lock-error', class: 'lock-error', role: 'alert', hidden: true });
  const body = el('div', { class: 'lock-body' });

  const attempt = async (button, request) => {
    problem.hidden = true;
    button.disabled = true;
    try {
      await open(request);
    } catch (error) {
      problem.textContent = error.message;
      problem.hidden = false;
      button.disabled = false;
    }
  };

  const form = (id, input, label, request) => {
    const button = el('button', { id: `${id}-open`, class: 'primary', type: 'submit' }, icon('lock'), label);
    return el('form', { class: 'start-form', onsubmit: (event) => {
      event.preventDefault();
      if (input.value) attempt(button, request());
    } }, input, button);
  };

  const link = (id, label, onclick) => el('button', { id, class: 'link', type: 'button', onclick }, label);

  function show(content, focus) {
    problem.hidden = true;
    body.replaceChildren(...content);
    focus?.focus();
  }

  function showPassword() {
    const input = secretInput('lock-password', 'Password');
    show([
      form('lock', input, 'Open', () => ({ how: 'password', secret: input.value })),
      el('div', { class: 'home-links' },
        opensHere ? link('lock-here', 'Open on this computer', (event) => attempt(event.currentTarget, { how: 'computer' })) : null,
        link('lock-forgot', 'Forgot your password?', showForgot),
        computer.on && computer.code && computer.quick ? link('lock-use-code', 'Use a code', showCode) : null),
    ], input);
  }

  function showCode() {
    const input = secretInput('lock-code', 'Code from your authenticator', 'text');
    show([
      form('lock-code', input, 'Open', () => ({ how: 'computer', code: input.value })),
      el('div', { class: 'home-links' }, link('lock-use-password', 'Use my password', showPassword), link('lock-forgot', 'Forgot your password?', showForgot)),
    ], input);
  }

  function showForgot() {
    const recovery = secretInput('lock-recovery', 'Recovery key', 'text');
    const code = secretInput('lock-forgot-code', 'Code from your authenticator', 'text');
    const here = el('button', { id: 'lock-computer', class: 'primary', type: 'submit' }, icon('lock'), 'Use this computer');
    const useComputer = el('form', { class: 'start-form', onsubmit: (event) => {
      event.preventDefault();
      if (!computer.code || code.value) attempt(here, { how: 'computer', code: code.value, forgot: true });
    } }, computer.code ? code : null, here);
    show([
      el('p', { class: 'quiet-note' }, 'Your recovery key works on any computer. You’ll set a new password as soon as you’re in.'),
      form('lock-recovery', recovery, 'Open', () => ({ how: 'recovery', secret: recovery.value })),
      computer.on ? el('p', { class: 'quiet-note' }, computer.code ? 'Or use this computer, with a code from your authenticator.' : 'Or use this computer, which you’ve trusted.') : null,
      computer.on ? useComputer : null,
      el('p', { class: 'quiet-note' }, 'If every way in is lost, nobody can open this project. There’s no account and no spare key anywhere.'),
      el('div', { class: 'home-links' }, link('lock-back-password', 'I remember it', showPassword)),
    ], recovery);
  }

  root.replaceChildren(
    el(
      'main',
      { class: 'home' },
      el(
        'section',
        { id: 'lock-screen', class: 'home-card' },
        el('div', { class: 'brand' }, el('img', { src: 'icon.png', alt: '', width: '40', height: '40' }), 'RT Story Tracker'),
        el('h1', { id: 'lock-title' }, title),
        body,
        problem,
        el('div', { class: 'home-links' }, el('button', { id: 'lock-library', class: 'link', onclick: onBack }, icon('library'), 'Back to the library')),
      ),
    ),
  );
  if (computer.on && computer.code && computer.quick) showCode();
  else showPassword();
}
