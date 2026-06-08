// PM2-конфиг для боевого запуска на VPS:  pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "mcladder-bot",
      script: "src/index.js",
      cwd: __dirname,
      exec_mode: "fork", // бот = одно gateway-соединение; cluster ему не нужен
      instances: 1, // строго 1 — иначе несколько процессов будут драться за сообщение-лидерборд
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: { NODE_ENV: "production" },
    },
  ],
};
