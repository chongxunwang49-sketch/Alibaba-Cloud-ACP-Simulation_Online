# 阿里云 ACP 大模型模拟考试

面向阿里云 ACP（大模型方向）的模拟考试系统：951 道题的题库 + 50 单选/25 多选组卷 + 服务端判分 + 错题本 + 成绩统计。

- GitHub：<https://github.com/chongxunwang49-sketch/Alibaba-Cloud-ACP-Simulation_Online>
- Gitee：<https://gitee.com/wcx547379191/alibaba-cloud-acp-simulation_-online>
- 线上：<http://120.55.234.224/>（手机可直接打开）

```
浏览器 ──80──> web 容器（Nginx + Vue dist）
                   └──/api──> api 容器（Express + Mongoose，3004 仅内网）
                                   └──> mongo 容器（MongoDB 7，27017 仅内网）
```

对外只开 80（SSH 22 仅对运维 IP），3004 与 27017 不映射宿主机。编排见 `docker-compose.yml`。

## 目录

| 目录 | 说明 |
| --- | --- |
| `server/` | Express + Mongoose 后端，16 个 API（见 `docs/01-API-接口文档.md`） |
| `server/src/` | config / models / routes / services / middleware |
| `server/scripts/` | 题库导出、内存库启动、冒烟脚本 |
| `server/data/` | `questions.array.json`（导入源）、`questions.ndjson`、`topic-report.json` |
| `server/test/` | `node:test` + supertest + mongodb-memory-server，13 个用例 |
| `frontend/` | Vue 3 + Vite 控制台（已完成，7 个视图；`npm run build` 产物在 `frontend/dist/`） |
| `deploy/` | Docker 版 `nginx.conf`、Windows 上传脚本 `push-docker.ps1`；宿主机旧方案归档在 `deploy/legacy-host/` |
| `docker-compose.yml` / `.env.example` | 三容器编排（web/api/mongo）与环境变量模板 |
| `frontend/Dockerfile` / `server/Dockerfile` | 前端多阶段构建、后端非 root 运行镜像 |
| `deploy.sh` | 服务器一键构建、启动并等待三个服务 healthy |
| `docs/` | 00 现状评估 / 01 API 文档 / 02 宿主机部署（已归档）/ 03 前端总结 / 04 Docker 部署 |
| `ACP模拟/` | 原始单文件版页面与题库构建脚本（只读参考，不参与部署） |

## 本地运行

要求 Node.js >= 16.20.1（建议 22.x）。

```bash
cd server
npm install
npm run dev:memory     # 内置内存 MongoDB，自动导入 951 题，监听 3004
```

另开终端验证：

```bash
curl http://127.0.0.1:3004/api/health
curl http://127.0.0.1:3004/api/meta
```

需要身份态的接口带一个稳定的设备 ID：

```bash
CID=11111111-1111-4111-8111-111111111111
curl -H "X-Client-Id: $CID" http://127.0.0.1:3004/api/stats/overview
```

已有本机 MongoDB 时用 `npm run dev`（默认 `mongodb://127.0.0.1:27017/acp`）。本地没有 `server/.env`，`src/config/env.js` 会使用开发默认值（端口 3004、seed 开启）；生产环境由部署脚本从 `.env.example` 生成。

## 前端本地运行

```bash
cd frontend
npm install
npm run dev        # 默认 http://127.0.0.1:5173，/api 代理到 127.0.0.1:3004
npm run build      # 产物 frontend/dist/，由 Nginx 托管
```

开发态后端未启动时，`VITE_USE_MOCK=auto` 会回退到 24 题离线样本（页面顶部显示“本地演示样本”徽标）；接上后端或设 `VITE_USE_MOCK=off` 即关闭，生产构建不会启用 mock。

## Docker 本地运行

需 Docker Desktop（Linux 容器）。在仓库根目录：

```bash
cp .env.example .env      # 把 MONGO_ROOT_PASSWORD 改成至少 12 位字母数字
docker compose up -d --build
docker compose ps         # 三个服务都应为 healthy
```

默认打开 `http://localhost/`；若本机 80 被占用，用 `WEB_PORT=8080 docker compose up -d --build`，
再访问 `http://localhost:8080/`。详细步骤、运维与排障见 [docs/04-Docker部署.md](docs/04-Docker部署.md)。

界面截图见 `docs/screenshots/`（概览 / 专项练习 / 提交解析 / 题库浏览 / 模拟考 / 成绩报告 / 错题本 / 成绩列表）。

## 常用命令（`server/` 下）

| 命令 | 作用 |
| --- | --- |
| `npm run dev:memory` | 内存 MongoDB + 自动导题，适合本机试跑 |
| `npm run dev` | 连本机 mongod 启动 |
| `npm test` | 13 个接口用例（内存库，约 2–3 s） |
| `npm run smoke` | 对运行中的 3004 做 11 项冒烟 |
| `npm run smoke:prod` | 以 production 模式起子进程，验证导题/CORS/限流/优雅退出 |
| `npm run export:bank` | 从 `ACP模拟/questions.json` 重新生成 `server/data/`（含板块打标） |

题库：951 题（单选 644 / 多选 307），六板块按考纲比例 17/15/20/16/16/16 组卷；板块由关键词规则离线打标，人工修正可写 `server/data/topic-overrides.json` 后重跑 `export:bank`。

## API

统一前缀 `/api`，成功 `{ "data": ... }`，失败 `{ "error": { "code", "message" } }`。完整契约、错误码与示例见 [docs/01-API-接口文档.md](docs/01-API-接口文档.md)。

## 部署

推荐 Docker Compose，见 [docs/04-Docker部署.md](docs/04-Docker部署.md)。要点：

1. ECS 2 vCPU / 2 GiB，Ubuntu 22.04 或 Alibaba Cloud Linux 3；安全组只开 80（22 仅运维 IP）；
2. 安装 Docker Engine + Compose 插件，配阿里云镜像加速和 2 GiB swap；
3. 上传代码：`powershell -ExecutionPolicy Bypass -File deploy\push-docker.ps1 -Server root@<IP>`，或服务器上 `git clone`；
4. `bash deploy.sh`，等 `docker compose ps` 三个服务 `healthy`，打开 `http://<公网IP>/`。

宿主机裸装（Node + PM2 + 系统 Nginx）方案已归档到 `deploy/legacy-host/`，手册见
[docs/02-部署手册.md](docs/02-部署手册.md)，只作回退参考。

### 线上实例

- 地址：<http://120.55.234.224/>（阿里云杭州，2 vCPU / 2 GiB，Ubuntu 22.04，安全组只开 80 与 SSH）
- 状态（2026-11-14）：`acp-api` / `acp-mongo` / `acp-web` 三容器 `healthy`，`restart=always`，
  951 题自动导入，`/api/meta` 返回 `total=951`、`explained=299`
- 截图：`docs/screenshots/public-home.png`、`public-practice.png`、`docker-compose-ps.png`

## 移动端适配

- 断点：`1200px`（刷题右栏收成抽屉）、`980px`（左侧导航收成汉堡抽屉）、`720px`（顶栏/表格/模拟考顶栏精简）。
- 手机端效果：侧栏抽屉 + 遮罩、答题卡/解析抽屉、选项大按钮、表格只保留关键列、模拟考顶栏只留计时/退出/交卷，页面无横向滚动。
- 验收尺寸：390 × 844（iPhone 14/15 逻辑像素），所有页面 `document.documentElement.scrollWidth === 390`。
- 截图：[mobile-home.png](docs/screenshots/mobile-home.png)、[mobile-practice.png](docs/screenshots/mobile-practice.png)、[mobile-exam.png](docs/screenshots/mobile-exam.png)、[mobile-questions.png](docs/screenshots/mobile-questions.png)。
- 手机扫码：[qr.png](docs/screenshots/qr.png)（内容即 <http://120.55.234.224/>）。

## 已知限制

- 本机的 `server/.env` 被安全策略拦截，未能创建；服务器上由 `deploy.sh` 从 `.env.example` 生成，本地用开发默认值。
- Docker Compose 方案已在本地与真实 ECS 两处起栈验证：三服务 `healthy`、951 题自动导入、考试交卷与统计通过（ECS 记录见 `docs/04` §14）。
- SSH 22 目前仍对 `0.0.0.0/0` 开放，建议改成固定运维 IP；80 已对公网开放。
- 宿主机裸装脚本在 `deploy/legacy-host/`，未在真实 ECS 上执行过，仅作回退参考。
- git 仓库还没有第一个 commit（全部文件 untracked），上线前建议先建基线提交，便于回滚。
- 板块标签是关键词规则离线打标（951 题中高置信 340 / 中 439 / 低 160 / 无 12），非官方标注；可在 `server/data/topic-overrides.json` 人工修正。
