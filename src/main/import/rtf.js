'use strict';
// A small RTF reader. It takes the text and the formatting an author cares about and skips the rest, including pictures.
// The old StoryTracker saved its chapters as RTF, so this is also the way home for that work.

const SKIPPED = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'headerf', 'headerl', 'headerr', 'footer', 'footerf', 'footerl', 'footerr', 'fldinst', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'xmlnstbl', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'mmathPr']);
const windows1252 = new TextDecoder('windows-1252');

function parseRtf(bytes) {
  const text = bytes.toString('latin1');
  if (!text.startsWith('{\\rtf')) throw new Error("That file doesn't look like RTF.");
  const blocks = [];
  let state = { bold: false, italic: false, underline: false, strike: false, skip: false, size: 24, unicodeSkip: 1 };
  const stack = [];
  let line = [];
  let align = null;
  let biggest = 0;
  let pictures = 0;
  let skipNext = 0;

  const add = (value) => {
    if (state.skip || !value) return;
    if (skipNext > 0) {
      const used = Math.min(skipNext, value.length);
      skipNext -= used;
      value = value.slice(used);
      if (!value) return;
    }
    const names = ['bold', 'italic', 'underline', 'strike'].filter((name) => state[name]);
    const last = line.at(-1);
    if (last?.type === 'text' && (last.marks ?? []).map((mark) => mark.type).join() === names.join()) last.text += value;
    else line.push({ type: 'text', text: value, ...(names.length ? { marks: names.map((type) => ({ type })) } : {}) });
    biggest = Math.max(biggest, state.size);
  };

  const endParagraph = () => {
    const content = line.filter((node) => node.type !== 'text' || node.text.trim() || line.length > 1);
    if (content.length) {
      const words = content.filter((node) => node.type === 'text');
      const allBold = words.length > 0 && words.every((node) => node.marks?.some((mark) => mark.type === 'bold'));
      const level = biggest >= 30 ? 1 : allBold && biggest >= 26 ? 2 : 0;
      const attrs = align ? { textAlign: align } : {};
      if (level) {
        const plain = content.map((node) => (node.type === 'text' ? { type: 'text', text: node.text } : node));
        blocks.push({ type: 'heading', attrs: { level, ...attrs }, content: plain });
      } else {
        blocks.push({ type: 'paragraph', ...(align ? { attrs } : {}), content });
      }
    }
    line = [];
    biggest = 0;
  };

  let at = 0;
  while (at < text.length) {
    const character = text[at];
    if (character === '{') {
      stack.push({ ...state });
      at += 1;
    } else if (character === '}') {
      state = stack.pop() ?? state;
      at += 1;
    } else if (character === '\\') {
      const next = text[at + 1];
      if (next === "'") {
        const start = at;
        let hex = '';
        while (text[at] === '\\' && text[at + 1] === "'") {
          hex += text.slice(at + 2, at + 4);
          at += 4;
        }
        if (at === start) at += 1;
        add(windows1252.decode(Buffer.from(hex, 'hex')));
      } else if (next === '\\' || next === '{' || next === '}') {
        add(next);
        at += 2;
      } else if (next === '~') {
        add(' ');
        at += 2;
      } else if (next === '-' || next === '_') {
        at += 2;
      } else if (next === '*') {
        state.skip = true;
        at += 2;
      } else if (next === '\n' || next === '\r') {
        if (!state.skip) endParagraph();
        at += 2;
      } else {
        const match = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(text.slice(at, at + 40));
        if (!match) {
          at += 2;
          continue;
        }
        at += match[0].length;
        const [, word, value] = match;
        const number = value === undefined ? null : Number(value);
        const on = number !== 0;
        if (SKIPPED.has(word)) {
          if (word === 'pict') pictures += 1;
          state.skip = true;
        } else if (word === 'par' || word === 'sect' || word === 'page') {
          if (!state.skip && word === 'par') endParagraph();
        } else if (word === 'line') {
          if (!state.skip) line.push({ type: 'hardBreak' });
        } else if (word === 'tab') {
          add(' ');
        } else if (word === 'pard') {
          align = null;
        } else if (word === 'plain') {
          Object.assign(state, { bold: false, italic: false, underline: false, strike: false, size: 24 });
        } else if (word === 'qc' || word === 'qr' || word === 'qj' || word === 'ql') {
          align = { qc: 'center', qr: 'right', qj: 'justify', ql: null }[word];
        } else if (word === 'b') {
          state.bold = on;
        } else if (word === 'i') {
          state.italic = on;
        } else if (word === 'ul') {
          state.underline = on;
        } else if (word === 'ulnone') {
          state.underline = false;
        } else if (word === 'strike') {
          state.strike = on;
        } else if (word === 'fs') {
          state.size = number ?? 24;
        } else if (word === 'uc') {
          state.unicodeSkip = number ?? 1;
        } else if (word === 'u') {
          if (state.skip) continue;
          const code = number < 0 ? number + 65536 : number;
          add(String.fromCharCode(code));
          skipNext = state.unicodeSkip;
        } else if (word === 'bullet') {
          add('•');
        } else if (word === 'emdash') {
          add('—');
        } else if (word === 'endash') {
          add('–');
        } else if (word === 'lquote' || word === 'rquote') {
          add(word === 'lquote' ? '‘' : '’');
        } else if (word === 'ldblquote' || word === 'rdblquote') {
          add(word === 'ldblquote' ? '“' : '”');
        }
      }
    } else if (character === '\n' || character === '\r') {
      at += 1;
    } else {
      let end = at;
      while (end < text.length && !'{}\\\n\r'.includes(text[end])) end += 1;
      add(windows1252.decode(Buffer.from(text.slice(at, end), 'latin1')));
      at = end;
    }
  }
  endParagraph();
  return { blocks, pictures };
}

module.exports = { parseRtf };
