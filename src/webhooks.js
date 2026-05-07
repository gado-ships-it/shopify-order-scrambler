const crypto = require('crypto');
const { Router } = require('express');
const config = require('./config');
const db = require('./db');
const { shopifyRequest } = require('./api');
const { generateOrderName } = require('./scrambler');

const router = Router();

// Capture raw body before JSON.parse so HMAC verification works
function rawBody(req, res, next) {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    req.rawBody = Buffer.concat(chunks);
    try { req.body = JSON.parse(req.rawBody.toString('utf8')); }
    catch { req.body = {}; }
    next();
  });
}

function verifyHmac(req) {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!hmac) return false;
  const computed = crypto
    .createHmac('sha256', config.SHOPIFY_API_SECRET)
    .update(req.rawBody)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmac));
  } catch {
    return false;
  }
}

// Main scrambler webhook
router.post('/orders/create', rawBody, async (req, res) => {
  if (!verifyHmac(req)) return res.status(401).send('Unauthorized');

  const shop = req.headers['x-shopify-shop-domain'];
  const order = req.body;

  // Respond immediately — Shopify requires <5s
  res.status(200).send('OK');

  const session = db.getSession(shop);
  if (!session) return;

  const shopConfig = db.getConfig(shop);
  const newName = generateOrderName(shopConfig);

  const result = await shopifyRequest(
    shop,
    session.access_token,
    'PUT',
    `/orders/${order.id}.json`,
    { order: { id: order.id, name: newName } }
  );

  if (result.status === 200) {
    db.logScramble(shop, order.id, order.name, newName);
  }
});

// GDPR mandatory webhooks (no personal data stored — no-op bodies)
router.post('/gdpr/customers-data-request', rawBody, (req, res) => {
  if (!verifyHmac(req)) return res.status(401).send('Unauthorized');
  res.status(200).send('OK');
});

router.post('/gdpr/customers-redact', rawBody, (req, res) => {
  if (!verifyHmac(req)) return res.status(401).send('Unauthorized');
  res.status(200).send('OK');
});

router.post('/gdpr/shop-redact', rawBody, (req, res) => {
  if (!verifyHmac(req)) return res.status(401).send('Unauthorized');
  const shop = req.body?.shop_domain;
  if (shop) db.deleteSession(shop);
  res.status(200).send('OK');
});

module.exports = router;
