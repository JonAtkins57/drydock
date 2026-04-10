module.exports = {
  apps: [{
    name: 'drydock',
    script: 'npx',
    args: 'tsx src/server.ts',
    cwd: '/home/jonat/dev/JonAtkins57/drydock',
    env: {
      NODE_ENV: 'development',
      PORT: 4400,
    },
    watch: false,
    instances: 1,
    autorestart: true,
    max_memory_restart: '512M',
    log_file: '/home/jonat/dev/JonAtkins57/drydock/logs/drydock.log',
    error_file: '/home/jonat/dev/JonAtkins57/drydock/logs/drydock-error.log',
    out_file: '/home/jonat/dev/JonAtkins57/drydock/logs/drydock-out.log',
    merge_logs: true,
    time: true,
  }],
};
