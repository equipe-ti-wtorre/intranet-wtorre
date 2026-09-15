module.exports = {
  apps: [
    {
      name: 'IntranetWTorreBackend',
      script: 'src/server.js',
      cwd: '/www/wwwroot/IntranetWTorre/backend',
      interpreter: '/www/server/nodejs/v24.16.0/bin/node',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
