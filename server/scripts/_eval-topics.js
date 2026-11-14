'use strict';
// 临时评估脚本：打印板块分布/置信度/抽样，用于调规则，完成后删除。
const path = require('path');
const bank = require(path.resolve(__dirname, '../../ACP模拟/questions.json'));
const { TOPICS } = require('../src/constants/topics');
const { classify } = require('./topic-rules');

const rows = bank.questions.map((q) => ({ q, r: classify(q) }));
const overall = {};
const byType = {};
for (const { q, r } of rows) {
  overall[r.topic] = (overall[r.topic] || 0) + 1;
  byType[r.topic] = byType[r.topic] || { single: 0, multiple: 0 };
  byType[r.topic][q.type] += 1;
}

console.log('total', rows.length);
for (const t of TOPICS) {
  const n = overall[t.key] || 0;
  console.log(
    `${t.key.padEnd(9)} ${String(n).padStart(4)}  ${((n / rows.length) * 100).toFixed(1)}%  (blueprint ${t.ratio}%)  single=${byType[t.key].single} multiple=${byType[t.key].multiple}`
  );
}

const buckets = { 0: 0, '1-2': 0, '3-5': 0, '6-9': 0, '10+': 0 };
for (const { r } of rows) {
  if (r.score === 0) buckets[0] += 1;
  else if (r.score <= 2) buckets['1-2'] += 1;
  else if (r.score <= 5) buckets['3-5'] += 1;
  else if (r.score <= 9) buckets['6-9'] += 1;
  else buckets['10+'] += 1;
}
console.log('confidence', buckets);

for (const t of TOPICS) {
  console.log(`\n--- ${t.key} 抽样 ---`);
  const list = rows.filter((x) => x.r.topic === t.key);
  const step = Math.max(1, Math.floor(list.length / 8));
  for (let i = 0; i < list.length && i / step < 8; i += step) {
    const { q, r } = list[i];
    console.log(`[${r.score}] ${q.id} ${q.question.replace(/\s+/g, ' ').slice(0, 70)}`);
  }
}
