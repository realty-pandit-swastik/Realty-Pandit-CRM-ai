const appRoot = process.env.HOSTINGER_DEPLOY_PATH || '/var/www/realty-pandit';

module.exports = {
  apps: [
    {
      name: 'realty-website',
      script: 'node_modules/.bin/next',
      args: 'start --hostname 127.0.0.1',
      cwd: `${appRoot}/current/website`,
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
