module.exports = {
  apps: [
    {
      name: 'realty-website',
      script: 'node_modules/.bin/next',
      args: 'start --hostname 127.0.0.1',
      cwd: '/var/www/realty-pandit/website',
      node_args: '--max-old-space-size=460',
      max_memory_restart: '512M',
      exp_backoff_restart_delay: 500,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
