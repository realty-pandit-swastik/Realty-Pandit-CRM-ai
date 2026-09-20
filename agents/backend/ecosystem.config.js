const appRoot = process.env.HOSTINGER_DEPLOY_PATH || '/var/www/realty-pandit';

module.exports = {
    apps: [
        {
            name: 'realty-backend',
      cwd: `${appRoot}/current/backend`,
      script: 'server-bootstrap.js',
            instances: 2,
            exec_mode: 'cluster',
            max_memory_restart: '1G',
            exp_backoff_restart_delay: 100,
            kill_timeout: 15000,         // Wait 15s for graceful shutdown before SIGKILL
            listen_timeout: 10000,       // Wait 10s for app to signal ready
            env: {
                NODE_ENV: 'production',
                PORT: 7071,
            },
        },
    ],
};
