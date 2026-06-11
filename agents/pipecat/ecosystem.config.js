module.exports = {
  apps: [
    {
      name: 'panditji-voice',
      script: 'main.py',
      interpreter: './venv/bin/python',
      cwd: '/var/www/realty-pandit/agents/pipecat',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        PYTHONUNBUFFERED: '1',
      },
      error_file: '../backend/logs/pipecat-error.log',
      out_file: '../backend/logs/pipecat-out.log',
    },
  ],
};
