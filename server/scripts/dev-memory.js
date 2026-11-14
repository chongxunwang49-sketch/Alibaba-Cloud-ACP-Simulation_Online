'use strict';

// 本地无 MongoDB 时的演示/联调入口：启动内存版 mongod，再走正常启动流程。
// 仅开发使用（依赖 devDependencies 中的 mongodb-memory-server）。
process.env.USE_MEMORY_DB = '1';
require('../src/server');
