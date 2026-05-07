// Unambiguous chars — no 0/O, 1/I confusables
const ALPHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomAlpha(length) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHA_CHARS[Math.floor(Math.random() * ALPHA_CHARS.length)];
  }
  return out;
}

function randomNumeric(digits) {
  // Random number with exactly `digits` digits (no leading zero)
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

/**
 * Generate a scrambled order name from the shop config.
 * format: 'alphanumeric' → '#ORD-K7X4M2'
 *         'numeric'      → '#ORD-5829401'
 */
function generateOrderName({ format, prefix, length }) {
  const rand = format === 'numeric' ? randomNumeric(length) : randomAlpha(length);
  return `#${prefix}-${rand}`;
}

module.exports = { generateOrderName };
