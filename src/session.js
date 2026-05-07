/**
 * Stateless short-lived session tokens for the embedded admin API.
 *
 * Token format (URL-safe): base64(shop + ':' + expiresAt) + '.' + hmac
 *
 * The HMAC-SHA256 covers both the payload and the app secret, so tokens
 * are unforgeable and bound to a specific shop + expiry window.
 * No server-side storage required.
 */
const crypto = require('crypto');
const config = require('./config');

const TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function issue(shop) {
  const expiresAt = Date.now() + TTL_MS;
  const payload   = Buffer.from(`${shop}:${expiresAt}`).toString('base64url');
  const sig       = crypto
    .createHmac('sha256', config.SHOPIFY_API_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig     = token.slice(dot + 1);
  const expected = crypto
    .createHmac('sha256', config.SHOPIFY_API_SECRET)
    .update(payload)
    .digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }
  const raw = Buffer.from(payload, 'base64url').toString('utf8');
  const colon = raw.lastIndexOf(':');
  const shop       = raw.slice(0, colon);
  const expiresAt  = parseInt(raw.slice(colon + 1), 10);
  if (Date.now() > expiresAt) return null;
  return shop;
}

module.exports = { issue, verify };
