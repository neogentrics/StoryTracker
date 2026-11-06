'use strict';
// Authenticator codes, as any authenticator app makes them (RFC 6238): six digits from a shared secret and the time.
// A code never opens anything by itself. See docs/design/passwords-and-recovery.md for why.
const crypto = require('node:crypto');

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;
const SECRET_BYTES = 20;
const ISSUER = 'RT Story Tracker';

function toBase32(bytes) {
  let bits = 0;
  let value = 0;
  let text = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      text += LETTERS[(value >> bits) & 31];
    }
    value &= (1 << bits) - 1;
  }
  return bits ? text + LETTERS[(value << (5 - bits)) & 31] : text;
}

function fromBase32(text) {
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const letter of text) {
    value = (value << 5) | LETTERS.indexOf(letter);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 255);
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(bytes);
}

function makeSecret() {
  return toBase32(crypto.randomBytes(SECRET_BYTES));
}

const stepAt = (time) => Math.floor(time / 1000 / STEP_SECONDS);

function codeFor(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = crypto.createHmac('sha1', fromBase32(secret)).update(counter).digest();
  const start = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(start) & 0x7fffffff) % 10 ** DIGITS).padStart(DIGITS, '0');
}

// Allows for a phone's clock being a little out. A code that has been used can't be used again.
function matchStep(secret, code, time, lastStep = 0) {
  const clean = String(code).replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const now = stepAt(time);
  for (const step of [now, now - 1, now + 1]) {
    const same = crypto.timingSafeEqual(Buffer.from(codeFor(secret, step)), Buffer.from(clean));
    if (same && step > lastStep) return step;
  }
  return null;
}

function setupLink(secret, label) {
  const name = encodeURIComponent(`${ISSUER}:${label}`);
  return `otpauth://totp/${name}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

module.exports = { codeFor, makeSecret, matchStep, setupLink, stepAt };
