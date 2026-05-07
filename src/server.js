const express = require('express');
const path = require('path');
const config = require('./config');

const authRoutes    = require('./auth');
const webhookRoutes = require('./webhooks');
const adminRoutes   = require('./admin');

const app = express();

app.use(express.json());
// Serve only public static assets (privacy page, etc.) — the admin UI is server-rendered
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

// OAuth
app.use('/', authRoutes);

// Webhooks (raw body parsing handled inside the router)
app.use('/webhooks', webhookRoutes);

// Admin UI + API
app.use('/', adminRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(config.PORT, () => {
  console.log(`Order Scrambler running on port ${config.PORT}`);
  console.log(`HOST: ${config.HOST}`);
  if (!config.SHOPIFY_API_KEY) {
    console.warn('⚠  SHOPIFY_API_KEY not set — copy .env.example → .env and fill it in');
  }
});
