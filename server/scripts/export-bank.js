'use strict';

/**
 * 题库导出 + 校验 + 六大板块打标。
 *
 * 输入：ACP模拟/questions.json（951 题，由 _build/parse.py 生成）
 * 输出：server/data/questions.ndjson      逐行 JSON，适合 mongoimport --mode=upsert
 *       server/data/questions.array.json  JSON 数组，适合 mongoimport --jsonArray
 *       server/data/topic-report.json     板块分布 / 低置信度清单（供抽样复核）
 *
 * 用法：
 *   npm run export:bank
 *   node scripts/export-bank.js --bank ../ACP模拟/questions.json --out data
 *
 * 可选人工修正：data/topic-overrides.json，格式 { "q123": "rag" }。
 * 修正优先于关键词规则，导出时会校验 key 必须是合法 topic。
 */

const fs = require('fs');
const path = require('path');
const { TOPICS, TOPIC_KEYS, TOPIC_NAME, QUESTION_TYPES } = require('../src/constants/topics');
const { classify } = require('./topic-rules');

const WORKSPACE_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_BANK = path.join(WORKSPACE_ROOT, 'ACP模拟/questions.json');
const DEFAULT_OUT = path.resolve(__dirname, '../data');
const LETTERS = 'ABCDEF';

function parseArgs(argv) {
  const args = { bank: DEFAULT_BANK, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--bank') args.bank = path.resolve(argv[i + 1]);
    else if (argv[i] === '--out') args.out = path.resolve(argv[i + 1]);
  }
  return args;
}

function fail(message, details) {
  console.error(`\n[export-bank] 校验失败：${message}`);
  if (details && details.length) {
    for (const item of details.slice(0, 20)) console.error(`  - ${item}`);
    if (details.length > 20) console.error(`  ... 其余 ${details.length - 20} 条`);
  }
  process.exit(1);
}

function loadOverrides(outDir) {
  const file = path.join(outDir, 'topic-overrides.json');
  if (!fs.existsSync(file)) return { file: null, map: {} };
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const map = {};
  for (const [id, topic] of Object.entries(raw)) {
    if (!TOPIC_KEYS.includes(topic)) fail(`topic-overrides.json 中 ${id} 的板块非法：${topic}`);
    map[id] = topic;
  }
  return { file, map };
}

function validate(questions) {
  const errors = [];
  const seen = new Set();
  let emptyExplanation = 0;

  questions.forEach((q, index) => {
    const at = `questions[${index}]${q && q.id ? `(${q.id})` : ''}`;
    if (!q || typeof q !== 'object') {
      errors.push(`${at} 不是对象`);
      return;
    }
    if (typeof q.id !== 'string' || !q.id.trim()) errors.push(`${at} 缺少 id`);
    else if (seen.has(q.id)) errors.push(`${at} id 重复`);
    else seen.add(q.id);
    if (!QUESTION_TYPES.includes(q.type)) errors.push(`${at} type 非法：${q.type}`);
    if (typeof q.question !== 'string' || !q.question.trim()) errors.push(`${at} 题干为空`);
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) {
      errors.push(`${at} options 数量应为 2-6，实际 ${Array.isArray(q.options) ? q.options.length : '非数组'}`);
    } else if (q.options.some((opt) => typeof opt !== 'string' || !opt.trim())) {
      errors.push(`${at} options 存在空选项`);
    }
    const optionCount = Array.isArray(q.options) ? q.options.length : 0;
    if (!Array.isArray(q.answer) || q.answer.length === 0) {
      errors.push(`${at} answer 为空或非数组`);
    } else {
      const unique = new Set(q.answer);
      if (unique.size !== q.answer.length) errors.push(`${at} answer 有重复字母`);
      for (const letter of q.answer) {
        if (typeof letter !== 'string' || !LETTERS.slice(0, optionCount).includes(letter)) {
          errors.push(`${at} answer 字母 ${letter} 超出选项范围 A-${LETTERS[optionCount - 1] || '?'}`);
        }
      }
      if (q.type === 'single' && q.answer.length !== 1) errors.push(`${at} 单选题答案应为 1 个`);
      if (q.type === 'multiple' && q.answer.length < 2) errors.push(`${at} 多选题答案应至少 2 个`);
    }
    if (q.explanation !== undefined && typeof q.explanation !== 'string') {
      errors.push(`${at} explanation 非字符串`);
    }
    if (!q.explanation || !String(q.explanation).trim()) emptyExplanation += 1;
    if (q.source !== undefined && typeof q.source !== 'string') errors.push(`${at} source 非字符串`);
    if (q.sourceUrl !== undefined && typeof q.sourceUrl !== 'string') errors.push(`${at} sourceUrl 非字符串`);
  });

  return { errors, emptyExplanation };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.bank)) fail(`题库文件不存在：${args.bank}`);
  const bank = JSON.parse(fs.readFileSync(args.bank, 'utf8'));
  const questions = Array.isArray(bank) ? bank : bank.questions;
  if (!Array.isArray(questions) || questions.length === 0) fail('题库中没有 questions 数组');

  const { errors, emptyExplanation } = validate(questions);
  if (errors.length) fail(`发现 ${errors.length} 个数据问题`, errors);

  fs.mkdirSync(args.out, { recursive: true });
  const { map: overrides } = loadOverrides(args.out);

  const docs = [];
  const report = {
    generatedAt: new Date().toISOString(),
    bankFile: path.relative(WORKSPACE_ROOT, args.bank).replace(/\\/g, '/'),
    total: questions.length,
    overridesApplied: 0,
    distribution: {},
    confidence: { high: 0, medium: 0, low: 0, none: 0 },
    lowConfidence: [],
  };
  for (const topic of TOPICS) {
    report.distribution[topic.key] = { name: topic.name, ratio: topic.ratio, count: 0, single: 0, multiple: 0 };
  }

  const unknownOverrides = new Set(Object.keys(overrides));

  for (const q of questions) {
    const result = classify(q);
    let topic = result.topic;
    let score = result.score;
    let source = 'rules';
    if (overrides[q.id]) {
      topic = overrides[q.id];
      score = 99;
      source = 'override';
      unknownOverrides.delete(q.id);
      report.overridesApplied += 1;
    }

    const doc = {
      _id: q.id,
      type: q.type,
      topic,
      question: q.question,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation || '',
      source: q.source || '',
      sourceUrl: q.sourceUrl || '',
    };
    docs.push(doc);

    report.distribution[topic].count += 1;
    report.distribution[topic][q.type] += 1;

    if (source === 'override' || score >= 12) report.confidence.high += 1;
    else if (score >= 6) report.confidence.medium += 1;
    else if (score > 0) report.confidence.low += 1;
    else report.confidence.none += 1;

    if (score > 0 && score < 6) {
      report.lowConfidence.push({
        id: q.id,
        topic,
        score,
        question: q.question.replace(/\s+/g, ' ').slice(0, 80),
      });
    }
  }

  if (unknownOverrides.size) {
    fail(`topic-overrides.json 中存在题库里没有的 id：${[...unknownOverrides].slice(0, 10).join(', ')}`);
  }

  const ndjson = docs.map((d) => JSON.stringify(d)).join('\n') + '\n';
  fs.writeFileSync(path.join(args.out, 'questions.ndjson'), ndjson, 'utf8');
  fs.writeFileSync(path.join(args.out, 'questions.array.json'), JSON.stringify(docs), 'utf8');
  fs.writeFileSync(path.join(args.out, 'topic-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`[export-bank] 题库校验通过：${docs.length} 题，0 异常`);
  console.log(`[export-bank] 解析为空：${emptyExplanation} 题（占 ${((emptyExplanation / docs.length) * 100).toFixed(1)}%）`);
  for (const topic of TOPICS) {
    const d = report.distribution[topic.key];
    const pct = ((d.count / docs.length) * 100).toFixed(1);
    console.log(
      `  ${topic.key.padEnd(9)} ${String(d.count).padStart(4)} 题 ${pct.padStart(5)}%  ` +
        `(蓝图 ${topic.ratio}%, single=${d.single}, multiple=${d.multiple})  ${TOPIC_NAME[topic.key]}`
    );
  }
  console.log(
    `[export-bank] 置信度 high=${report.confidence.high} medium=${report.confidence.medium} ` +
      `low=${report.confidence.low} none=${report.confidence.none}，人工覆盖=${report.overridesApplied}`
  );
  console.log(`[export-bank] 输出目录：${args.out}`);
}

if (require.main === module) main();
