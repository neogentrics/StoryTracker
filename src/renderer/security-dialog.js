// Setting a password and looking after the ways in. Everything here is checked again by the app, in src/main/security.js.
import { el } from './dom.js';
import { icon } from './icons.js';

const MIN_PASSWORD = 8;

let progressShown = null;
let listening = false;

function listenForProgress(api) {
  if (listening) return;
  listening = true;
  api.onLockProgress((progress) => progressShown?.(progress));
}

function passwordField(id, label) {
  return el('label', { class: 'field' }, el('span', {}, label), el('input', { id, type: 'password', autocomplete: 'new-password', spellcheck: 'false' }));
}

function makeDialog(id) {
  document.getElementById(id)?.remove();
  const dialog = el('dialog', { id, class: 'dialog' });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  return dialog;
}

// A password or recovery key, asked for before anything that changes a way in or takes the writing out of the encryption.
export async function ensurePass(api, why) {
  const status = await api.securityStatus();
  if (!status.locked || status.pass) return true;
  return new Promise((resolve) => {
    const dialog = makeDialog('confirm-password');
    const input = el('input', { id: 'confirm-secret', type: 'password', 'aria-label': 'Password', autocomplete: 'off', spellcheck: 'false' });
    const problem = el('p', { id: 'confirm-error', class: 'lock-error', role: 'alert', hidden: true });
    let answer = false;
    dialog.addEventListener('close', () => resolve(answer));
    dialog.append(
      el('h2', {}, 'Enter your password'),
      el('p', { class: 'quiet-note' }, why),
      el('form', {
        onsubmit: async (event) => {
          event.preventDefault();
          try {
            await api.confirmPassword(input.value);
            answer = true;
            dialog.close();
          } catch (error) {
            problem.textContent = error.message;
            problem.hidden = false;
          }
        },
      }, input, problem, el('div', { class: 'dialog-actions' },
        el('button', { type: 'button', onclick: () => dialog.close() }, 'Cancel'),
        el('button', { id: 'confirm-ok', class: 'primary', type: 'submit' }, 'Continue'))),
    );
    dialog.showModal();
    input.focus();
  });
}

function checkNewPassword(first, second) {
  if ([...first].length < MIN_PASSWORD) return `A password needs at least ${MIN_PASSWORD} characters. A few unrelated words are strong and easy to remember.`;
  return first === second ? null : 'Those two passwords don’t match.';
}

function recoveryScreen(api, text, label, { action, onAction, onCancel }) {
  const saved = el('input', { id: 'recovery-saved', type: 'checkbox', onchange: () => { go.disabled = !saved.checked; } });
  const go = el('button', { id: 'recovery-continue', class: 'primary', disabled: true, onclick: onAction }, action);
  const note = el('p', { id: 'recovery-note', class: 'quiet-note', role: 'status' });
  return [
    el('h2', {}, 'Your recovery key'),
    el('p', { class: 'quiet-note' }, 'This opens the project if you forget your password, on any computer. It’s shown this once. Keep it away from this computer: on paper, or in a password manager.'),
    el('p', { id: 'recovery-key', class: 'recovery-key' }, text),
    el('div', { class: 'word-form' },
      el('button', { id: 'recovery-copy', onclick: async () => {
        await navigator.clipboard.writeText(text);
        note.textContent = 'Copied. Paste it somewhere safe, then copy something else, so it doesn’t stay on the clipboard.';
      } }, 'Copy'),
      el('button', { id: 'recovery-file', onclick: async () => {
        const file = await api.saveRecovery({ text, label });
        if (file) note.textContent = `Saved to ${file}`;
      } }, 'Save to a file…'),
      el('button', { id: 'recovery-print', onclick: () => api.printRecovery(text) }, 'Print…')),
    note,
    el('label', { class: 'check' }, saved, 'I’ve saved my recovery key somewhere safe'),
    el('div', { class: 'dialog-actions' }, onCancel ? el('button', { onclick: onCancel }, 'Cancel') : null, go),
  ];
}

function offersScreen({ api, dialog, result, status, onDone }) {
  const note = el('p', { id: 'security-note', class: 'quiet-note', role: 'status' });
  const trust = el('button', { id: 'offer-trust', onclick: async () => {
    await api.trustComputer();
    trust.disabled = true;
    note.textContent = 'This computer is now a way back in if you forget your password. You can add an authenticator from Password and Lock.';
  } }, 'Trust this computer');
  const drop = el('button', { id: 'offer-drop', onclick: async () => {
    if (!window.confirm('Delete the backups made before this project was locked? This can’t be undone.')) return;
    await api.dropEarlierBackups();
    drop.disabled = true;
    note.textContent = 'The older backups are gone.';
  } }, 'Delete them');
  return [
    el('h2', {}, 'This project is locked'),
    el('p', { class: 'quiet-note' }, 'Everything in it now needs your password or recovery key, including its backups from here on.'),
    status.computer.available
      ? el('section', {}, el('h3', {}, 'Trust this computer?'), el('p', { class: 'quiet-note' }, 'If you forget your password, you could get back in here through your login. It’s easier, but weaker: anyone using your login could do the same.'), trust)
      : null,
    result.earlierBackups
      ? el(
        'section',
        {},
        el('h3', {}, 'Older backups'),
        el('p', { class: 'quiet-note' }, `${result.earlierBackups === 1 ? '1 backup' : `${result.earlierBackups} backups`} made before today can still be opened by anyone, and the folder has this project’s name on it. Deleting them is the only way to change that.`),
        result.newBackup
          ? el('p', { class: 'quiet-note' }, 'A new locked backup has been made.')
          : el('p', { class: 'quiet-note' }, 'The new locked backup didn’t work, so keep these for now. Try Back up now in Preferences.'),
        result.newBackup ? drop : null,
      )
      : null,
    el('p', { class: 'quiet-note' }, 'Any other copy you made before today isn’t locked either. Delete those yourself if they matter.'),
    note,
    el('div', { class: 'dialog-actions' }, el('button', { id: 'security-done', class: 'primary', onclick: () => {
      dialog.close();
      onDone();
    } }, 'Done')),
  ];
}

function workingScreen(words) {
  const bar = el('progress', { id: 'security-progress', max: '1', value: '0' });
  progressShown = ({ done, total }) => { bar.value = total ? done / total : 0; };
  return [el('h2', {}, words), el('p', { class: 'quiet-note' }, 'Every file is being encrypted again, so a big project can take a minute or two. Please leave the app open.'), bar];
}

function setPasswordFlow({ api, dialog, beforeChange, onChanged, onError }) {
  const first = passwordField('new-password', 'Password');
  const second = passwordField('new-password-again', 'The same again');
  const label = el('input', { id: 'locked-label', type: 'text', maxlength: '60', placeholder: 'Locked project' });
  const problem = el('p', { id: 'security-error', class: 'lock-error', role: 'alert', hidden: true });
  const read = (field) => field.querySelector('input').value;

  async function lock(password) {
    dialog.replaceChildren(...workingScreen('Locking this project…'));
    try {
      await beforeChange();
      const result = await api.setPassword({ password, label: label.value });
      onChanged(result.opened);
      const now = await api.securityStatus();
      dialog.replaceChildren(...offersScreen({ api, dialog, result, status: now, onDone: () => {} }));
    } catch (error) {
      dialog.close();
      onError(error.message);
    }
  }

  async function next() {
    const trouble = checkNewPassword(read(first), read(second));
    if (trouble) {
      problem.textContent = trouble;
      problem.hidden = false;
      return;
    }
    const password = read(first);
    const text = await api.makeRecovery();
    dialog.replaceChildren(...recoveryScreen(api, text, label.value, { action: 'Lock this project', onAction: () => lock(password), onCancel: () => dialog.close() }));
  }

  dialog.replaceChildren(
    el('h2', {}, 'Password and lock'),
    el('p', { class: 'quiet-note' }, 'Right now this project is encrypted with a key built into the app. That keeps out other programs, but not someone determined. With a password, the files are a garbled mess to anyone without it.'),
    first,
    second,
    el('label', { class: 'field' }, el('span', {}, 'Name shown while it’s locked'), label),
    el('p', { class: 'quiet-note' }, 'Anyone can see this name, so don’t use one that gives anything away. Your title stays inside the lock.'),
    el('p', { class: 'quiet-note' }, 'There’s no account and no spare key. If you lose your password and every other way in, nobody can open this project.'),
    problem,
    el('div', { class: 'dialog-actions' },
      el('button', { onclick: () => dialog.close() }, 'Cancel'),
      el('button', { id: 'security-next', class: 'primary', onclick: next }, 'Next')),
  );
}

function changePasswordScreen({ api, dialog, heading, words, onDone, canCancel = true }) {
  const first = passwordField('new-password', 'New password');
  const second = passwordField('new-password-again', 'The same again');
  const problem = el('p', { id: 'security-error', class: 'lock-error', role: 'alert', hidden: true });
  const read = (field) => field.querySelector('input').value;
  dialog.replaceChildren(
    el('h2', {}, heading),
    words ? el('p', { class: 'quiet-note' }, words) : null,
    first,
    second,
    problem,
    el('div', { class: 'dialog-actions' },
      canCancel ? el('button', { onclick: onDone }, 'Cancel') : null,
      el('button', { id: 'security-save-password', class: 'primary', onclick: async () => {
        const trouble = checkNewPassword(read(first), read(second));
        try {
          if (trouble) throw new Error(trouble);
          await api.changePassword(read(first));
          onDone();
        } catch (error) {
          problem.textContent = error.message;
          problem.hidden = false;
        }
      } }, 'Save password')),
  );
}

function authenticatorScreen({ api, dialog, setup, onDone }) {
  const code = el('input', { id: 'authenticator-code', type: 'text', inputmode: 'numeric', 'aria-label': 'Code', autocomplete: 'off' });
  const problem = el('p', { id: 'security-error', class: 'lock-error', role: 'alert', hidden: true });
  dialog.replaceChildren(
    el('h2', {}, 'Add an authenticator'),
    el('p', { class: 'quiet-note' }, 'Scan this with any authenticator app, or type the key in. After that, this computer asks for a code before it opens the project.'),
    el('img', { id: 'authenticator-picture', class: 'authenticator-picture', src: setup.picture, alt: 'A code to scan with an authenticator app' }),
    el('p', { id: 'authenticator-secret', class: 'recovery-key small' }, setup.secret),
    el('p', { class: 'quiet-note' }, 'A code can’t open the project on any other computer, or replace your password. It guards this computer’s way in.'),
    el('form', { onsubmit: async (event) => {
      event.preventDefault();
      try {
        await api.confirmAuthenticator(code.value);
        onDone();
      } catch (error) {
        problem.textContent = error.message;
        problem.hidden = false;
      }
    } },
    el('label', { class: 'field' }, el('span', {}, 'The code it shows now'), code),
    problem,
    el('div', { class: 'dialog-actions' },
      el('button', { type: 'button', onclick: onDone }, 'Cancel'),
      el('button', { id: 'authenticator-confirm', class: 'primary', type: 'submit' }, 'Add it'))),
  );
  code.focus();
}

async function waysScreen(context) {
  const { api, dialog, beforeChange, onChanged, onLock, onError } = context;
  const status = await api.securityStatus();
  const { computer } = status;
  const again = () => waysScreen(context);
  const why = 'This changes how the project can be opened.';
  const guarded = (work) => async () => {
    try {
      if (await ensurePass(api, why)) await work();
    } catch (error) {
      onError(error.message);
    }
  };

  const row = (title, note, ...actions) => el('li', { class: 'way-row' }, el('div', {}, el('strong', {}, title), el('small', {}, note)), el('div', { class: 'way-actions' }, actions));
  const quick = el('input', { id: 'computer-quick', type: 'checkbox', checked: computer.quick, onchange: guarded(async () => {
    await api.setQuickOpen(quick.checked);
    await again();
  }) });
  const label = el('input', { id: 'locked-label', type: 'text', maxlength: '60', value: status.label, placeholder: 'Locked project', onchange: () => api.renameLocked(label.value) });

  dialog.replaceChildren(
    el('h2', {}, 'Password and lock'),
    el('p', { class: 'quiet-note' }, 'This project is locked. These are the ways in.'),
    el('ul', { id: 'ways', class: 'way-list' },
      row('Password', 'For every day.', el('button', { id: 'way-change-password', onclick: guarded(() => changePasswordScreen({ api, dialog, heading: 'Change your password', onDone: again })) }, 'Change')),
      row('Recovery key', 'For when you forget your password, on any computer.', el('button', { id: 'way-new-recovery', onclick: guarded(async () => {
        const text = await api.makeRecovery();
        dialog.replaceChildren(...recoveryScreen(api, text, status.label, {
          action: 'Use this key',
          onAction: async () => {
            await api.replaceRecovery();
            await again();
          },
          onCancel: again,
        }));
      }) }, 'Make a new one')),
      computer.available
        ? row('This computer', computer.on ? 'Trusted, through your login here.' : 'Not trusted. Easier if you do, but weaker.', computer.on
          ? el('button', { id: 'way-untrust', onclick: guarded(async () => {
            await api.untrustComputer();
            await again();
          }) }, 'Stop trusting')
          : el('button', { id: 'way-trust', onclick: guarded(async () => {
            await api.trustComputer();
            await again();
          }) }, 'Trust'))
        : row('This computer', 'It has no safe place to keep a key, so it can’t be trusted.'),
      computer.on
        ? row('Authenticator', computer.code ? 'A code is needed before this computer opens the project.' : 'Asks for a code before this computer opens the project.', computer.code
          ? el('button', { id: 'way-remove-code', onclick: guarded(async () => {
            await api.removeAuthenticator();
            await again();
          }) }, 'Remove')
          : el('button', { id: 'way-add-code', onclick: guarded(async () => {
            authenticatorScreen({ api, dialog, setup: await api.beginAuthenticator(), onDone: again });
          }) }, 'Add'))
        : null),
    computer.on ? el('label', { class: 'check' }, quick, computer.code ? 'On this computer, ask for a code in place of the password' : 'On this computer, open without asking') : null,
    el('label', { class: 'field' }, el('span', {}, 'Name shown while it’s locked'), label),
    el('div', { class: 'dialog-actions spread' },
      el('button', { id: 'security-remove', class: 'quiet', onclick: guarded(async () => {
        if (!window.confirm('Remove the password? Anyone who gets these files could then read them. Backups made while it was locked keep their own password.')) return;
        dialog.replaceChildren(...workingScreen('Removing the password…'));
        await beforeChange();
        const { opened } = await api.removeLock();
        onChanged(opened);
        dialog.close();
      }) }, 'Remove the password'),
      el('div', { class: 'way-actions' },
        el('button', { id: 'security-lock-now', onclick: () => {
          dialog.close();
          onLock();
        } }, icon('lock'), 'Lock now'),
        el('button', { id: 'security-close', class: 'primary', onclick: () => dialog.close() }, 'Close'))),
  );
}

export async function openSecurity({ api, beforeChange, onChanged, onLock, onError }) {
  listenForProgress(api);
  const status = await api.securityStatus();
  const dialog = makeDialog('security');
  if (status.locked) await waysScreen({ api, dialog, beforeChange, onChanged, onLock, onError });
  else setPasswordFlow({ api, dialog, beforeChange, onChanged, onError });
  dialog.showModal();
}

// After getting in another way, the old password is gone, so a new one comes before anything else.
export function askNewPassword(api) {
  return new Promise((resolve) => {
    const dialog = makeDialog('new-password-dialog');
    dialog.addEventListener('cancel', (event) => event.preventDefault());
    dialog.addEventListener('close', resolve);
    changePasswordScreen({
      api,
      dialog,
      heading: 'Set a new password',
      words: 'You’re in. Choose a new password now, so you have one for next time. Your recovery key still works.',
      canCancel: false,
      onDone: () => dialog.close(),
    });
    dialog.showModal();
  });
}
