'use strict';

/**
 * 关键词规则打标（离线，一次性）。
 *
 * 规则来源：对 951 道题的题干/选项做词面统计 + 人工归纳，
 * 目标不是 100% 准确，而是让六大板块过滤、板块掌握度可用；
 * 低置信度题目会写入 data/topic-report.json 供抽样复核。
 *
 * 权重：3 = 强特征词（几乎只在某板块出现）；1 = 弱特征词（跨板块常见）。
 * 同一关键词只计一次分；题干命中按 2 倍计，仅选项命中按 1 倍计，
 * 避免选项里的干扰项把题目带偏。
 */

const RULES = {
  'app-dev': {
    strong: [
      '函数调用', 'function calling', 'function call', '结构化输出',
      'json mode', 'json 模式', '流式输出', '流式返回', '流式响应', '流式',
      'sse', '上下文窗口', '上下文长度', '上下文管理',
      'api 调用', 'api调用', 'sdk', '模型选型', '模型选择',
      '通义千问', 'qwen', '百炼', 'dashscope', 'openai 兼容',
      '工具调用', 'temperature', 'top_p', 'max_tokens',
      '多轮对话', '会话管理', '调用大模型', '大模型 api',
    ],
    weak: [
      '接口', '参数', '返回', '请求', '代码片段', 'python',
      '集成', '消息', 'system', 'assistant', 'api', '应用', '输出',
    ],
  },
  prompt: {
    strong: [
      '提示词', 'prompt', 'few-shot', 'few shot', '少样本', '零样本',
      'zero-shot', '思维链', 'chain-of-thought', 'cot', '系统提示',
      'system prompt', '角色设定', '提示词模板', '提示模板', '提示词注入',
      'prompt injection', '输出格式', '分隔符', '提示工程', '提示词设计',
      '提示词优化', '指令遵循', '结构化提示', 'react', '受众',
    ],
    weak: ['模板', '示例', '角色', '指令', '约束', '格式', '一致性', '提示'],
  },
  rag: {
    strong: [
      '检索增强', '向量数据库', '向量化', 'embedding', '嵌入', '知识库',
      '召回', '重排', 'rerank', '粗排', '精排', '分块', '切片', 'chunk',
      '语义检索', '语义搜索', '相似度', 'cosine', '余弦', 'bm25',
      '混合检索', '多路召回', '文档解析', '文本分割', '索引构建', '向量检索',
      '检索器', '查询改写', 'query 改写', 'hyde', 'graphrag', '知识图谱', 'faq',
      'ragas', 'context recall', 'context precision', 'faithfulness',
      'answer relevancy', '忠实度', '答案相关性', '检索质量',
    ],
    weak: ['检索', '文档', '知识', '向量', '索引', '排序', 'top-k', 'topk', 'rag'],
  },
  finetune: {
    strong: [
      '微调', 'fine-tune', 'finetune', 'fine tuning', 'lora', 'qlora',
      'p-tuning', 'prefix-tuning', 'adapter', 'sft', '监督微调', 'rlhf',
      'dpo', 'ppo', '奖励模型', '训练集', '验证集', '测试集', '学习率',
      'epoch', 'batch size', '过拟合', '欠拟合', '损失函数', 'loss function',
      'cost function', '梯度', '反向传播', '蒸馏', '量化', '剪枝',
      '全参数', '增量预训练', '继续预训练', '预训练', '数据标注', '标注数据',
      '显存', '收敛', '训练损失', '验证损失',
    ],
    weak: ['训练', '数据集', '精度', '权重', '标注', '拟合', 'gpu'],
  },
  agent: {
    strong: [
      'agent', '智能体', '多智能体', 'multi-agent', '多 agent', '单agent',
      '单 agent', 'mcp', '规划', '反思', '记忆', '多模态', '图像生成',
      '文生图', '图生文', '视觉', '语音', '视频', 'ocr', 'tts', 'asr',
      'whisper', 'stable diffusion', 'sora', '视觉问答', '音视频',
      '图像识别', '图片', '音频', '数字人', '具身', '机器人', '任务分解',
      '协作', '编排', '工作流', '子任务', '角色分工', '协商', '共识',
    ],
    weak: ['插件', '工具', '动作', '观察', '推理', '决策', '自主'],
  },
  prod: {
    strong: [
      '监控', '告警', '可观测', '日志', '安全', '合规', '隐私', '个人信息',
      '内容安全', '审核', '成本', '计费', '限流', '熔断', '降级', '缓存',
      '高可用', '容灾', '灾备', '灰度', '发布', '上线', '评测', '评估',
      'a/b', '性能', '延迟', '吞吐', '并发', 'sla', '运维', '故障',
      '脱敏', '越权', '注入', '备案', '版权', '伦理', '偏见', '歧视',
      '数据安全', '数据隐私', '加密', '权限', '审计', '幻觉', '鲁棒',
      '兜底', '应急', '超时', '重试', '幂等', '压测', '容量', '数据泄露',
      'token 成本',
    ],
    weak: ['部署', '资源', '稳定性', 'qps', '规模', '生产'],
  },
};

const TOPIC_ORDER = ['app-dev', 'prompt', 'rag', 'finetune', 'agent', 'prod'];

function normalize(text) {
  return String(text || '').toLowerCase();
}

/**
 * @param {{question:string, options?:string[]}} q
 * @returns {{topic:string, score:number, strongHits:number, hits:string[]}}
 */
function classify(q) {
  const stem = normalize(q.question);
  const options = normalize((q.options || []).join(' '));
  let best = { topic: TOPIC_ORDER[0], score: 0, strongHits: 0, hits: [] };

  for (const topic of TOPIC_ORDER) {
    const rule = RULES[topic];
    let score = 0;
    let strongHits = 0;
    const hits = [];

    for (const kw of rule.strong) {
      const inStem = stem.includes(kw);
      const inOptions = options.includes(kw);
      if (inStem || inOptions) {
        score += (inStem ? 6 : 3);
        if (inStem) strongHits += 1;
        hits.push(kw);
      }
    }
    for (const kw of rule.weak) {
      const inStem = stem.includes(kw);
      const inOptions = options.includes(kw);
      if (inStem || inOptions) {
        score += inStem ? 2 : 1;
        hits.push(kw);
      }
    }

    if (
      score > best.score ||
      (score === best.score && strongHits > best.strongHits)
    ) {
      best = { topic, score, strongHits, hits };
    }
  }

  return best;
}

module.exports = { RULES, TOPIC_ORDER, classify };
