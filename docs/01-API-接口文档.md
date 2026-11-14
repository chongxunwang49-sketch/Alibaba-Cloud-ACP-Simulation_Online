# ACP 模拟考试后端 API 文档

Base URL：`http://<host>/api`（生产由 Nginx 反代到 `127.0.0.1:3004`）
数据格式：请求/响应均为 `application/json; charset=utf-8`

---

## 1. 通用约定

### 1.1 身份

匿名设备身份，前端首次启动生成 uuid v4 存入 `localStorage`，之后所有需要身份的请求携带：

```
X-Client-Id: 3f1c9a2e-8b7d-4c61-9f0a-2d5e6b8c1a34
```

- 缺失：`401 CLIENT_ID_REQUIRED`
- 格式非法：`400 VALIDATION_ERROR`
- 格式：uuid v4，或 8–64 位 `[A-Za-z0-9_-]` 设备串。浏览器在 `http://IP`（非安全上下文）下没有 `crypto.randomUUID()`，前端可降级为 `c-<时间戳>-<随机串>`，后端同样接受。
- 公开接口（health / meta / questions / practice/set）不强制携带；带上也不会报错。

### 1.2 响应包装

成功：

```json
{ "data": { } }
```

失败：

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "pageSize 不能超过 50" } }
```

### 1.3 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 参数/请求体不合法 |
| 400 | `INVALID_JSON` | 请求体不是合法 JSON |
| 401 | `CLIENT_ID_REQUIRED` | 缺少 `X-Client-Id` |
| 404 | `NOT_FOUND` | 资源不存在，或不属于当前设备 |
| 409 | `EXAM_NOT_SUBMITTED` | 未交卷就请求成绩报告 |
| 409 | `QUESTION_RETIRED` | 试卷中的题目已下线 |
| 409 | `DUPLICATE_KEY` | 唯一键冲突 |
| 413 | `PAYLOAD_TOO_LARGE` | 请求体超过 100 KB |
| 429 | `RATE_LIMITED` | 触发限流 |
| 500 | `INTERNAL_ERROR` | 未预期异常 |
| 503 | `NOT_READY` | 数据库未连接 |

限流：练习作答 120 次/分钟；开考、交卷各 20 次/10 分钟（按 IP）。

### 1.4 分页

请求：`?page=1&pageSize=20`（默认 20，上限 50）
响应：`{ items, page, pageSize, total, totalPages }`

---

## 2. 健康检查与元信息

### GET `/api/health`

无需身份。数据库可用返回 200，否则 503 `NOT_READY`。

```json
{
  "data": {
    "status": "ok",
    "db": "connected",
    "version": "1.0.0",
    "uptime": 128,
    "time": "2026-11-14T08:00:00.000Z"
  }
}
```

### GET `/api/meta`

考纲、题型、组卷规则与题库规模，前端用来渲染首页/骨架屏。

```json
{
  "data": {
    "topics": [
      { "key": "app-dev", "name": "大模型应用开发", "ratio": 17 },
      { "key": "prompt", "name": "大模型提示词工程", "ratio": 15 },
      { "key": "rag", "name": "大模型检索增强", "ratio": 20 },
      { "key": "finetune", "name": "大模型微调", "ratio": 16 },
      { "key": "agent", "name": "多 Agent 及多模态应用", "ratio": 16 },
      { "key": "prod", "name": "生产环境应用实践", "ratio": 16 }
    ],
    "types": [
      { "key": "single", "name": "单选题", "points": 1 },
      { "key": "multiple", "name": "多选题", "points": 2 }
    ],
    "exam": {
      "single": 50,
      "multiple": 25,
      "total": 75,
      "maxScore": 100,
      "durationLimitSec": null
    },
    "bank": {
      "total": 951,
      "single": 644,
      "multiple": 307,
      "explained": 299,
      "byTopic": [
        { "topic": "app-dev", "name": "大模型应用开发", "total": 211, "single": 144, "multiple": 67 }
      ]
    }
  }
}
```

> `durationLimitSec: null` 表示模拟考只正计时、不强制交卷；前端计时以本机开始时间为准，交卷上传 `durationSec`。

---

## 3. 题库

### GET `/api/questions`

分页浏览题库。**不返回 `answer` / `explanation`**。

| 参数 | 说明 |
| --- | --- |
| `page` / `pageSize` | 分页 |
| `type` | `single` / `multiple` |
| `topic` | 六大板块 key |
| `keyword` | 题干或选项模糊搜索，≤ 60 字 |

```json
{
  "data": {
    "items": [
      {
        "id": "q001",
        "type": "multiple",
        "topic": "prod",
        "topicName": "生产环境应用实践",
        "question": "以下哪三种场景更需要防范AI模型“幻觉”的风险？",
        "options": ["医疗诊断报告生成系统", "社交媒体趋势话题预测系统", "法律合同条款自动生成器", "教育领域历史知识问答系统"],
        "source": "mock_exam_2/03.md 题目 12",
        "sourceUrl": "https://github.com/…"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 951,
    "totalPages": 48
  }
}
```

### GET `/api/questions/:id`

单题题面（同样不含答案）。不存在返回 404。

---

## 4. 刷题练习

### GET `/api/practice/set`

随机抽题，不含答案。

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `topic` | 全部 | 板块过滤 |
| `type` | 全部 | 题型过滤 |
| `count` | 10 | 1–50 |

```json
{ "data": { "items": [ { "id": "q002", "type": "single", "topic": "rag", "topicName": "大模型检索增强", "question": "…", "options": ["…"], "source": "mock_exam_2/03.md 题目 12", "sourceUrl": "https://github.com/…" } ], "count": 10 } }
```

### POST `/api/practice/answer`

需要 `X-Client-Id`。服务端判分，返回正确答案与解析。

请求：

```json
{ "questionId": "q002", "selected": ["A", "C"] }
```

响应（`selected` 已去重排序；`correct` 为多选全对）：

```json
{
  "data": {
    "id": "q002",
    "type": "single",
    "topic": "rag",
    "topicName": "大模型检索增强",
    "question": "…",
    "options": ["…"],
    "answer": ["A"],
    "explanation": "…",
    "source": "mock_exam_2/03.md 题目 12",
    "sourceUrl": "https://github.com/…",
    "selected": ["A"],
    "correct": true
  }
}
```

行为：

- 答错：写入作答流水，并 upsert 错题本（`wrongCount + 1`）。
- 答对：只写作答流水；**不会自动把错题移出错题本**，需前端调用 `PATCH /api/wrong-questions/:id` 标记已掌握，或 `DELETE` 删除。
- `selected` 为空数组返回 400；字母超出本题选项范围返回 400。

---

## 5. 模拟考

### POST `/api/exams`

需要 `X-Client-Id`。按蓝图抽卷：50 单选（每题 1 分）+ 25 多选（每题 2 分），满分 100。每种题型内部按板块比例 17/15/20/16/16/16 配额抽题。

- 已有进行中的试卷：直接返回该卷，`200` + `resumed: true`（刷新/断点续考）。
- 否则新建：`201` + `resumed: false`。

```json
{
  "data": {
    "id": "6734a1f2c9e77b0012ab34cd",
    "status": "ongoing",
    "total": 75,
    "startedAt": "2026-11-14T08:00:00.000Z",
    "submittedAt": null,
    "durationSec": 0,
    "score": 0,
    "maxScore": 100,
    "correctCount": 0,
    "wrongCount": 0,
    "unansweredCount": 0,
    "byTopic": [],
    "resumed": false
  }
}
```

### GET `/api/exams`

需要身份。考试历史，按开考时间倒序。

| 参数 | 说明 |
| --- | --- |
| `status` | `ongoing` / `submitted`，可省略 |
| `page` / `pageSize` | 分页 |

### GET `/api/exams/:id`

需要身份，且只能访问自己的试卷（否则 404）。返回试卷与逐题作答状态；**交卷前 `correct` 均为 `null`**，任何阶段都不含答案。

```json
{
  "data": {
    "id": "6734…",
    "status": "ongoing",
    "total": 75,
    "score": 0,
    "maxScore": 100,
    "byTopic": [],
    "paper": [
      {
        "order": 1,
        "points": 1,
        "id": "q101",
        "type": "single",
        "topic": "app-dev",
        "topicName": "大模型应用开发",
        "question": "…",
        "options": ["…"],
        "selected": ["A"],
        "correct": null
      }
    ]
  }
}
```

### POST `/api/exams/:id/submit`

需要身份。服务端唯一判分入口，**幂等**：重复提交返回首次结果，`alreadySubmitted: true`，不会重复累计错题。

请求：

```json
{
  "answers": [
    { "questionId": "q101", "selected": ["A"] },
    { "questionId": "q102", "selected": ["A", "C"] }
  ],
  "durationSec": 1830
}
```

- `answers` 可省略或为空数组：全部按未作答处理。
- 未出现在 `answers` 中的题按未作答处理。
- `durationSec` 省略时由服务端按 `submittedAt - startedAt` 计算；上限 24 小时。
- `questionId` 不属于本卷：400。

响应：考试摘要（同 `GET /api/exams` 的单项）+ `alreadySubmitted`。

```json
{
  "data": {
    "id": "6734…",
    "status": "submitted",
    "total": 75,
    "score": 72,
    "maxScore": 100,
    "correctCount": 61,
    "wrongCount": 9,
    "unansweredCount": 5,
    "durationSec": 1830,
    "submittedAt": "2026-11-14T08:30:30.000Z",
    "byTopic": [
      { "topic": "app-dev", "name": "大模型应用开发", "total": 13, "correct": 11, "score": 12, "maxScore": 15 }
    ],
    "alreadySubmitted": false
  }
}
```

判分规则：

- 单选：选中唯一正确项才得分。
- 多选：**全对才得分**，少选/多选/错选均 0 分。
- 已答错（`selected` 非空且不正确）计入错题本并 `wrongCount + 1`。
- 未作答不计入错题本，只计入 `unansweredCount`。

### GET `/api/exams/:id/report`

需要身份。交卷后查看完整报告，含答案、解析、逐题对错。未交卷返回 `409 EXAM_NOT_SUBMITTED`。

```json
{
  "data": {
    "id": "6734…",
    "status": "submitted",
    "score": 72,
    "byTopic": [],
    "items": [
      {
        "order": 1,
        "points": 1,
        "id": "q101",
        "type": "single",
        "topic": "app-dev",
        "topicName": "大模型应用开发",
        "question": "…",
        "options": ["…"],
        "answer": ["A"],
        "explanation": "…",
        "source": "…",
        "sourceUrl": "…",
        "selected": ["A"],
        "correct": true
      }
    ]
  }
}
```

---

## 6. 错题本

### GET `/api/wrong-questions`

需要身份。按最近答错时间倒序。

| 参数 | 说明 |
| --- | --- |
| `mastered` | `true` / `false` |
| `topic` / `type` | 过滤 |
| `page` / `pageSize` | 分页 |

```json
{
  "data": {
    "items": [
      {
        "questionId": "q002",
        "type": "single",
        "topic": "rag",
        "topicName": "大模型检索增强",
        "question": "…",
        "options": ["…"],
        "wrongCount": 3,
        "lastSelected": ["B"],
        "lastWrongAt": "2026-11-14T08:20:00.000Z",
        "mastered": false
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 12,
    "totalPages": 1
  }
}
```

### GET `/api/wrong-questions/:questionId`

需要身份。错题详情（含 `answer` / `explanation`），供展开复习。未收录返回 404。

### PATCH `/api/wrong-questions/:questionId`

需要身份。标记已掌握 / 撤销。

```json
{ "mastered": true }
```

返回：`{ "data": { "questionId": "q002", "mastered": true } }`

### DELETE `/api/wrong-questions/:questionId`

需要身份。移出错题本。

返回：`{ "data": { "questionId": "q002", "deleted": true } }`

---

## 7. 统计

### GET `/api/stats/overview`

需要身份。首页/数据看板聚合。

```json
{
  "data": {
    "totals":  { "answered": 320, "correct": 240, "accuracy": 75.0 },
    "practice":{ "answered": 200, "correct": 160, "accuracy": 80.0 },
    "exam":    { "answered": 120, "correct": 80,  "accuracy": 66.7 },
    "exams": {
      "count": 2,
      "avgScore": 68.5,
      "bestScore": 72,
      "lastScore": 65,
      "lastSubmittedAt": "2026-11-14T08:30:30.000Z"
    },
    "wrongBook": {
      "active": 12,
      "mastered": 5,
      "byTopic": [
        { "topic": "rag", "name": "大模型检索增强", "count": 4 }
      ]
    },
    "byTopic": [
      { "topic": "app-dev", "name": "大模型应用开发", "answered": 60, "correct": 48, "accuracy": 80.0 }
    ],
    "last7Days": [
      { "date": "2026-11-08", "answered": 20, "correct": 15 }
    ]
  }
}
```

- `byTopic` 固定返回六个板块（无数据补 0），顺序与 `/api/meta` 一致。
- `last7Days` 固定 7 项，含今天，按 `APP_TIMEZONE`（默认 Asia/Shanghai）分日。
