const crypto = require('crypto');
const path = require('path');
const { Router } = require('express');
const config  = require('./config');
const db      = require('./db');
const session = require('./session');

const router = Router();

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

// Middleware: verify session token on /api/* routes
function requireSession(req, res, next) {
  const token = req.headers['x-session-token'] || req.query._tok;
  const shop  = session.verify(token);
  if (!shop) return res.status(401).json({ error: 'Invalid or expired session' });
  req.shop = shop;
  next();
}

// Embedded admin page — must arrive with valid Shopify HMAC params
router.get('/app', (req, res) => {
  const { shop, hmac } = req.query;

  // No Shopify params at all → redirect to install
  if (!shop) return res.redirect('/install');

  // Invalid HMAC → could be a direct URL hit, redirect to OAuth
  if (!hmac || !verifyShopifyRequest(req.query)) {
    return res.redirect(`/auth?shop=${encodeURIComponent(shop)}`);
  }

  // Check the shop is actually installed
  if (!db.getSession(shop)) {
    return res.redirect(`/auth?shop=${encodeURIComponent(shop)}`);
  }

  // Issue a session token and inject it into the page
  const tok = session.issue(shop);
  res.send(buildPage(tok, shop));
});

// Install landing page (for direct visitors who haven't installed yet)
router.get('/install', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Install Order Scrambler</title>
<style>body{font-family:-apple-system,sans-serif;max-width:480px;margin:80px auto;padding:0 24px;text-align:center}
h1{font-size:22px;margin-bottom:8px}p{color:#6d7175;margin-bottom:24px}
input{width:100%;padding:10px;border:1px solid #c9cccf;border-radius:6px;font-size:15px;margin-bottom:12px}
button{background:#008060;color:#fff;border:none;border-radius:6px;padding:12px 24px;font-size:15px;cursor:pointer;width:100%}
</style></head><body>
<h1>Order Scrambler</h1>
<p>Enter your Shopify store URL to install.</p>
<input id="shop" placeholder="yourstore.myshopify.com" autocomplete="off"/>
<button onclick="go()">Install</button>
<script>
function go(){
  var s=document.getElementById('shop').value.trim().replace(/^https?:\\/\\//,'').replace(/\\/$/,'');
  if(s)location.href='/auth?shop='+encodeURIComponent(s);
}
document.getElementById('shop').addEventListener('keydown',function(e){if(e.key==='Enter')go();});
</script></body></html>`);
});

// REST API — all require a valid session token

router.get('/api/config', requireSession, (req, res) => {
  res.json(db.getConfig(req.shop));
});

router.post('/api/config', requireSession, (req, res) => {
  const { format, prefix, length } = req.body;
  if (!['alphanumeric', 'numeric'].includes(format)) {
    return res.status(400).json({ error: 'Invalid format' });
  }
  const cleanPrefix = (prefix || 'ORD').replace(/[^A-Z0-9]/gi, '').slice(0, 8).toUpperCase();
  const cleanLength = Math.min(12, Math.max(4, parseInt(length, 10) || 6));
  db.saveConfig(req.shop, { format, prefix: cleanPrefix, length: cleanLength });
  res.json({ ok: true, config: db.getConfig(req.shop) });
});

router.get('/api/logs', requireSession, (req, res) => {
  res.json(db.recentLogs(req.shop, 50));
});

// Inject session token into the admin HTML at serve time
function buildPage(tok, shop) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Order Scrambler</title>
  <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f6f7;color:#202223;padding:24px}
    .page{max-width:760px;margin:0 auto}
    h1{font-size:20px;font-weight:600;margin-bottom:4px}
    .subtitle{color:#6d7175;font-size:14px;margin-bottom:24px}
    .card{background:#fff;border:1px solid #e1e3e5;border-radius:8px;padding:20px;margin-bottom:16px}
    .card h2{font-size:15px;font-weight:600;margin-bottom:16px}
    label{display:block;font-size:14px;font-weight:500;margin-bottom:6px}
    .hint{font-size:12px;color:#6d7175;margin-top:4px}
    input[type=text],input[type=number],select{width:100%;padding:8px 10px;border:1px solid #c9cccf;border-radius:6px;font-size:14px;background:#fff}
    .row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px}
    .preview{background:#f6f6f7;border:1px dashed #c9cccf;border-radius:6px;padding:12px 16px;font-family:monospace;font-size:22px;font-weight:600;text-align:center;letter-spacing:3px;color:#202223}
    .preview-label{text-align:center;font-size:12px;color:#6d7175;margin-top:6px}
    button{background:#008060;color:#fff;border:none;border-radius:6px;padding:10px 20px;font-size:14px;font-weight:500;cursor:pointer}
    button:hover{background:#006e52}
    button:disabled{background:#c9cccf;cursor:default}
    .saved{color:#008060;font-size:13px;margin-left:12px;display:none}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{text-align:left;padding:8px 10px;border-bottom:1px solid #e1e3e5;color:#6d7175;font-weight:500}
    td{padding:8px 10px;border-bottom:1px solid #f6f6f7;font-family:monospace}
    td.name{font-family:inherit}
    .empty{text-align:center;color:#6d7175;padding:24px;font-family:inherit}
    .badge{display:inline-block;background:#f1f8f5;color:#008060;border:1px solid #b7ddd0;border-radius:100px;font-size:11px;font-weight:600;padding:2px 8px;margin-left:8px}
    .footer{text-align:center;font-size:12px;color:#6d7175;margin-top:24px}
    .footer a{color:#6d7175}
  </style>
</head>
<body>
<div class="page">
  <h1>Order Scrambler <span class="badge">Active</span></h1>
  <p class="subtitle">Rewrites customer-facing order IDs to random strings — competitors can no longer infer your order volume.</p>
  <div class="card">
    <h2>Configuration</h2>
    <div class="row">
      <div>
        <label for="format">Format</label>
        <select id="format">
          <option value="alphanumeric">Alphanumeric (ORD-K7X4M2)</option>
          <option value="numeric">Numeric (ORD-5829401)</option>
        </select>
        <p class="hint">Alphanumeric is harder to guess.</p>
      </div>
      <div>
        <label for="prefix">Prefix</label>
        <input type="text" id="prefix" maxlength="8" placeholder="ORD"/>
        <p class="hint">Letters/numbers only, max 8 chars.</p>
      </div>
      <div>
        <label for="length">Code length</label>
        <input type="number" id="length" min="4" max="12"/>
        <p class="hint">Random chars after prefix (4–12).</p>
      </div>
    </div>
    <div class="preview" id="preview">#ORD-K7X4M2</div>
    <p class="preview-label">Preview (live)</p>
    <div style="margin-top:16px">
      <button id="save-btn">Save settings</button>
      <span class="saved" id="saved-msg">Saved!</span>
    </div>
  </div>
  <div class="card">
    <h2>Recent scrambles</h2>
    <table>
      <thead><tr><th>Order ID</th><th>Original</th><th>Scrambled to</th><th>When</th></tr></thead>
      <tbody id="log-body">
        <tr><td colspan="4" class="empty">No orders scrambled yet. Place a test order to verify.</td></tr>
      </tbody>
    </table>
  </div>
  <p class="footer"><a href="/privacy" target="_blank">Privacy Policy</a> &middot; <a href="https://github.com/gado-ships-it/shopify-order-scrambler" target="_blank">GitHub</a></p>
</div>
<script>
  const TOK  = ${JSON.stringify(tok)};
  const SHOP = ${JSON.stringify(shop)};
  const H    = { 'Content-Type': 'application/json', 'x-session-token': TOK };

  if (window.shopify) { try { window.shopify.init(); } catch(_) {} }

  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = (chars, n) =>
    Array.from({length:n}, () => chars[Math.floor(Math.random()*chars.length)]).join('');

  function buildPreview(format, prefix, length) {
    const p = (prefix||'ORD').toUpperCase();
    const n = Math.min(12, Math.max(4, parseInt(length)||6));
    const r = format==='numeric'
      ? String(Math.floor(Math.random()*(Math.pow(10,n)-Math.pow(10,n-1)))+Math.pow(10,n-1))
      : rand(ALPHA,n);
    return '#'+p+'-'+r;
  }
  function updatePreview() {
    document.getElementById('preview').textContent =
      buildPreview(document.getElementById('format').value,
                   document.getElementById('prefix').value,
                   document.getElementById('length').value);
  }
  ['format','prefix','length'].forEach(id =>
    document.getElementById(id).addEventListener('input', updatePreview));

  async function loadConfig() {
    try {
      const r = await fetch('/api/config', {headers: H});
      if (!r.ok) return;
      const c = await r.json();
      document.getElementById('format').value = c.format;
      document.getElementById('prefix').value = c.prefix;
      document.getElementById('length').value = c.length;
      updatePreview();
    } catch(_) {}
  }

  async function saveConfig() {
    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    try {
      const r = await fetch('/api/config', {
        method: 'POST', headers: H,
        body: JSON.stringify({
          format: document.getElementById('format').value,
          prefix: document.getElementById('prefix').value,
          length: document.getElementById('length').value,
        }),
      });
      if (r.ok) {
        const msg = document.getElementById('saved-msg');
        msg.style.display = 'inline';
        setTimeout(() => { msg.style.display = 'none'; }, 2000);
      }
    } finally { btn.disabled = false; }
  }

  async function loadLogs() {
    try {
      const r = await fetch('/api/logs', {headers: H});
      if (!r.ok) return;
      const logs = await r.json();
      if (!logs.length) return;
      document.getElementById('log-body').innerHTML = logs.map(row => \`
        <tr>
          <td>\${row.order_id}</td>
          <td class="name">\${row.original_name||'—'}</td>
          <td>\${row.new_name}</td>
          <td class="name">\${new Date(row.created_at*1000).toLocaleString()}</td>
        </tr>\`).join('');
    } catch(_) {}
  }

  document.getElementById('save-btn').addEventListener('click', saveConfig);
  loadConfig();
  loadLogs();
</script>
</body>
</html>`;
}

module.exports = router;
