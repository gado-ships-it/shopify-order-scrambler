require('./env');

module.exports = {
  SHOPIFY_API_KEY:    process.env.SHOPIFY_API_KEY    || '',
  SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET || '',
  SCOPES:             'write_orders,read_orders',
  HOST:               (process.env.HOST || 'http://localhost:3000').replace(/\/$/, ''),
  PORT:               parseInt(process.env.PORT || '3000', 10),
};
