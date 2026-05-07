module.exports = {
  apps: [{
    name:        'order-scrambler',
    script:      'src/server.js',
    cwd:         '/var/www/order-scrambler',
    instances:   1,
    autorestart: true,
    watch:       false,
    env: {
      NODE_ENV: 'production',
      PORT:     '3100',
      HOST:     'https://random-order-number.sala.ch',
    },
  }],
};
