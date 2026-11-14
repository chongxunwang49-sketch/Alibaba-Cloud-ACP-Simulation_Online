# 角色与任务
你是资深的 Node.js 后端与运维开发工程师。请协助我完成“阿里云ACP模拟考试”项目的后端逻辑梳理、功能补齐与部署脚本生成，目标是将本地 Demo 推向公网。

# 第一步：环境探索（必须执行）
请先读取我本地项目的现有代码结构。查看当前的 `package.json`、后端入口文件（如 `app.js` / `server.js`）、本地题库数据格式（如 JSON）及数据库连接配置。
*注意：技术栈必须严格锁定为 Node.js (Express/Koa) + MongoDB，禁止擅自更换为 Python/SQLite/MySQL，因为我的线上教程环境是 CentOS + MongoDB。*

# 第二步：现状评估与方案汇报（交给我审阅）
1. 汇报当前后端代码是否支持：单选题/多选题数据获取、答题记录提交、错题记录接口、模拟考交卷接口。
2. 如果缺少核心接口，请列出需要新增的 API 路由列表（如 `GET /api/questions`, `POST /api/submit`, `GET /api/wrong-questions`），**先不要写代码，交给我确认**。
3. 检查本地是否有 MongoDB 数据的导出脚本（对应我的笔记：旧库导出 .js 或 .json，用于线上 `mongoimport`）。

# 第三步：工程化改造任务（待我确认方案后执行）
1. **配置生产环境**：创建或修改 `.env` 文件，分离本地和线上数据库配置。
2. **编写 PM2 守护配置**：生成 `ecosystem.config.js`，确保启动端口为 `3004`，host 为 `0.0.0.0`。
3. **Nginx 配置模板**：帮我写一份 `nginx.conf` 模板。
   - 监听 80 端口，指向前端打包后的 `dist` 目录。
   - 开启 Vue history 模式（`try_files $uri $uri/ /index.html;`）。
   - `/api` 路径反向代理到 `http://127.0.0.1:3004`。
4. **一键部署脚本**：写一个 `deploy.sh` 脚本，包含：连接服务器（利用环境变量）、上传前端 `dist` 和后端代码、在服务器上执行 `npm install --production`、执行 `pm2 restart`。

# 规则约束
- 所有涉及 API 结构和配置模板的变动，请以代码块形式输出，并告诉我为什么这么改。大的架构调整必须等我回复“同意”后再继续。