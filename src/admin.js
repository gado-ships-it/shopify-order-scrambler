const crypto = require('crypto');
const path = require('path');
const { Router } = require('express');
const config = require('./config');
const db = require('./db');

const router = Router();

// Verify that a request genuinely comes from Shopify (legacy signed params)
function verifyShopifyRequest(query) {
  const { hmac, ...rest } = query;
  if (!hmac) return false;
  const message = Object.entries(rest)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const computed = crypto
    .createHmac('sha256', config.SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hmac, 'hex'));
  } catch {
    return false;
  }
}

// Embedded admin page
router.get('/app', (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.redirect(`/auth?shop=${shop}`);
  if (!verifyShopifyRequest(req.query)) {
    // Could be a direct browser hit without Shopify params — redirect to install
    return res.redirect(`/auth?shop=${shop}`);
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// REST API — get config
router.get('/api/config', (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'Missing shop' });
  res.json(db.getConfig(shop));
});

// REST API — save config
router.post('/api/config', (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'Missing shop' });
  const { format, prefix, length } = req.body;
  if (!['alphanumeric', 'numeric'].includes(format)) {
    return res.status(400).json({ error: 'Invalid format' });
  }
  const cleanPrefix = (prefix || 'ORD').replace(/[^A-Z0-9]/gi, '').slice(0, 8).toUpperCase();
  const cleanLength = Math.min(12, Math.max(4, parseInt(length, 10) || 6));
  db.saveConfig(shop, { format, prefix: cleanPrefix, length: cleanLength });
  res.json({ ok: true, config: db.getConfig(shop) });
});

// REST API — recent scramble log
router.get('/api/logs', (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'Missing shop' });
  res.json(db.recentLogs(shop, 50));
});

module.exports = router;
