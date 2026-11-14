'use strict';

const path = require('path');

/**
 * PM2 配置：单实例 fork 模式（2 GiB 机器 + 同机 mongod，不宜多实例）。
 * cwd 以本文件位置推导，仓库放在 /opt/acp 或其他目录都能直接用。
 */
module.exports = {
  apps: [
    {
      name: 'acp-api',
      cwd: path.resolve(__dirname, '..', 'server'),
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      kill_timeout: 5000,
      time: true,
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
