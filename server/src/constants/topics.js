'use strict';

/**
 * 六大板块（考纲常量）。ratio 为考试蓝图占比，合计 100。
 * key 用于数据库与 API，name 用于展示。
 */
const TOPICS = [
  { key: 'app-dev', name: '大模型应用开发', ratio: 17 },
  { key: 'prompt', name: '大模型提示词工程', ratio: 15 },
  { key: 'rag', name: '大模型检索增强', ratio: 20 },
  { key: 'finetune', name: '大模型微调', ratio: 16 },
  { key: 'agent', name: '多 Agent 及多模态应用', ratio: 16 },
  { key: 'prod', name: '生产环境应用实践', ratio: 16 },
];

const TOPIC_KEYS = TOPICS.map((t) => t.key);
const TOPIC_NAME = Object.fromEntries(TOPICS.map((t) => [t.key, t.name]));

const QUESTION_TYPES = ['single', 'multiple'];
const POINTS = { single: 1, multiple: 2 };

const EXAM_BLUEPRINT = { single: 50, multiple: 25 };

module.exports = {
  TOPICS,
  TOPIC_KEYS,
  TOPIC_NAME,
  QUESTION_TYPES,
  POINTS,
  EXAM_BLUEPRINT,
};
