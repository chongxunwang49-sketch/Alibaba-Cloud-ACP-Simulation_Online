# ACP 模拟考试后端（server/）

Node.js + Express 4 + MongoDB(Mongoose) 实现的题库、练习判分、模拟考、错题本与统计服务。
完整接口说明见 [`../docs/01-API-接口文档.md`](../docs/01-API-接口文档.md)，上线步骤见
[`../docs/02-部署手册.md`](../docs/02-部署手册.md)。

## 目录

```
server/
├─ src/
│  ├─ app.js                 Express 应用（helmet/compression/json/CORS/路由/错误处理）
│  ├─ server.js              入口：连库 → 导入题库 → 建索引 → 监听 → 优雅退出
│  ├─ config/{env,db}.js     环境变量、Mongoose 连接
│  ├─ constants/topics.js    六大板块、题型、分值、组卷蓝图
│  ├─ middleware/            客户端身份（X-Client-Id）、错误处理、限流
│  ├─ models/                Question / User / Exam / AnswerRecord / WrongQuestion
│  ├─ routes/                health, meta, questions, practice, exams, wrong-questions, stats
│  ├─ services/              业务逻辑（组卷、判分、错题、统计、seed）
│  └─ utils/                 错误类型、参数校验、异步包装
├─ scripts/
│  ├─ export-bank.js         题库校验 + 导出（含板块打标）
│  ├─ topic-rules.js         板块关键词规则
│  ├─ dev-memory.js          内存 MongoDB 启动开发服务器
│  └─ smoke.js               11 项冒烟检查
├─ test/api.test.js          12 个接口测试（内存 MongoDB）
└─ data/                     questions.array.json / .ndjson / topic-report.json
```

## 本地运行

无需本机安装 MongoDB，用内存库即可：

```bash
cd server
npm install
npm run dev:memory      # http://127.0.0.1:3004，自动导入 951 题
curl http://127.0.0.1:3004/api/health
```

连真实 MongoDB：

```bash
cp .env.example .env    # 按需改 MONGODB_URI
npm start
```

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm start` | 生产启动 |
| `npm run dev` | 开发启动（需本机 MongoDB） |
| `npm run dev:memory` | 内存 MongoDB + 开发模式（端口 3004） |
| `npm run export:bank` | 校验 `../ACP模拟/questions.json`，重新生成 `data/` |
| `npm test` | 接口测试（内存库，12 用例） |
| `npm run smoke` | 对运行中的服务跑 11 项冒烟 |

## 数据与判分

- 题库文档 `_id` 即题库 id（`q001`…），导入只读；`data/questions.array.json` 由 `npm run export:bank` 生成。
- 题库接口**不下发** `answer`/`explanation`，判分只在服务端；交卷幂等。
- 单选 1 分、多选 2 分（全对才得分），50 单选 + 25 多选 = 100 分；组卷按板块比例 17/15/20/16/16/16 配额。
- 错题在答错时写入，答对不会自动移除，需前端标记已掌握或删除。
- 匿名身份：请求头 `X-Client-Id`（uuid v4），首次访问自动建 `users` 记录。

## 题库更新

```bash
# 1. 改 ACP模拟/questions.json 或 _source 后重新导出
npm run export:bank

# 2. 重启并强制覆盖（或 mongoimport --mode=upsert --upsertFields=_id）
SEED_FORCE=1 npm start
```

板块由 `scripts/topic-rules.js` 关键词规则打标，可用 `data/topic-overrides.json`
（形如 `{"q123": "rag"}`）人工修正后重新导出。
