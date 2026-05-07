const crypto = require('crypto');
const { Router } = require('express');
const config = require('./config');
const db = require('./db');
const { shopifyRequest } = require('./api');

const router = Router();

// In-memory nonce store: state → { shop, expires }
// Fine for single-instance; use Redis for multi-instance.
const pendingStates = new Map();

// Clean stale nonces every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingStates) {
    if (now > v.expires) pendingStates.delete(k);
  }
}, 15 * 60 * 1000);

function verifyShopDomain(shop) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

// Step 1 — redirect to Shopify OAuth consent screen
router.get('/auth', (req, res) => {
  const { shop } = req.query;
  if (!shop || !verifyShopDomain(shop)) {
    return res.status(400).send('Missing or invalid shop parameter');
  }

  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { shop, expires: Date.now() + 10 * 60 * 1000 });

  const params = new URLSearchParams({
    client_id:          config.SHOPIFY_API_KEY,
    scope:              config.SCOPES,
    redirect_uri:       `${config.HOST}/auth/callback`,
    state,
    'grant_options[]':  'per-user',
  });

  res.redirect(`https://${shop}/admin/oauth/authorize?${params}`);
});

// Step 2 — exchange code for token
router.get('/auth/callback', async (req, res) => {
  const { shop, code, state, hmac } = req.query;

  if (!shop || !verifyShopDomain(shop)) return res.status(400).send('Invalid shop');

  // Validate state / nonce
  const record = pendingStates.get(state);
  if (!record || record.shop !== shop || Date.now() > record.expires) {
    return res.status(403).send('Invalid or expired state');
  }
  pendingStates.delete(state);

  // Validate HMAC
  const message = Object.entries(req.query)
    .filter(([k]) => k !== 'hmac')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const computed = crypto
    .createHmac('sha256', config.SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hmac, 'hex'))) {
    return res.status(403).send('HMAC validation failed');
  }

  // Exchange code → access token
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     config.SHOPIFY_API_KEY,
      client_secret: config.SHOPIFY_API_SECRET,
      code,
    }),
  });
  const { access_token, scope } = await tokenRes.json();
  if (!access_token) return res.status(500).send('Token exchange failed');

  db.saveSession(shop, access_token, scope);
  await registerWebhooks(shop, access_token);

  // Redirect into the embedded app
  res.redirect(`https://${shop}/admin/apps/${config.SHOPIFY_API_KEY}`);
});

async function registerWebhooks(shop, accessToken) {
  const topics = [
    { topic: 'orders/create',             address: `${config.HOST}/webhooks/orders/create` },
    { topic: 'customers/data_request',    address: `${config.HOST}/webhooks/gdpr/customers-data-request` },
    { topic: 'customers/redact',          address: `${config.HOST}/webhooks/gdpr/customers-redact` },
    { topic: 'shop/redact',               address: `${config.HOST}/webhooks/gdpr/shop-redact` },
  ];

  for (const { topic, address } of topics) {
    await shopifyRequest(shop, accessToken, 'POST', '/webhooks.json', {
      webhook: { topic, address, format: 'json' },
    });
  }
}

module.exports = router;
