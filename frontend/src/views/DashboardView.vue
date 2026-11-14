<script setup lang="ts">
import { computed } from 'vue'
import { api } from '@/api'
import { useAsync } from '@/composables/useAsync'
import { TOPICS } from '@/mock'
import StatePanel from '@/components/StatePanel.vue'
import { TOPIC_LABEL, fmtPercent } from '@/utils/format'

const { data, loading, error, run } = useAsync(() => api.overview())
const maxTrend = computed(() => Math.max(1, ...(data.value?.trend.map((t) => t.count) ?? [1])))
const topicName = (key: string) => TOPIC_LABEL[key as keyof typeof TOPIC_LABEL] ?? TOPICS.find((t) => t.key === key)?.name ?? key
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1 class="page-title">备考概览</h1>
        <p class="page-desc">阿里云大模型 ACP 认证 · 951 道社区题库 · 六大考纲板块</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/questions">浏览题库</RouterLink>
        <RouterLink class="btn btn--primary" to="/practice">开始专项练习</RouterLink>
        <RouterLink class="btn btn--accent" to="/exam">进入全真模拟考</RouterLink>
      </div>
    </div>

    <StatePanel :loading="loading" :error="error" variant="card" :rows="4" @retry="run">
      <template v-if="data">
        <div class="grid-cards" style="margin-bottom: 20px">
          <div class="metric"><div class="metric-label">累计答题</div><div class="metric-value">{{ data.answered }}<small>题</small></div><div class="metric-foot">含练习与模拟考</div></div>
          <div class="metric"><div class="metric-label">总体正确率</div><div class="metric-value">{{ data.accuracy }}<small>%</small></div><div class="metric-foot">按已判分作答统计</div></div>
          <div class="metric"><div class="metric-label">待复盘错题</div><div class="metric-value">{{ data.wrongCount }}<small>题</small></div><div class="metric-foot">不含已掌握</div></div>
          <div class="metric"><div class="metric-label">模拟考次数</div><div class="metric-value">{{ data.examCount }}<small>次</small></div><div class="metric-foot">历史最高 {{ data.bestScore }} 分</div></div>
        </div>

        <div class="grid-cards" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))">
          <section class="card">
            <div class="card-head"><h2 class="card-title">六大板块掌握度</h2><span class="hint">按考纲蓝图</span></div>
            <div class="card-body">
              <div v-for="t in data.byTopic" :key="t.topic" class="ratio-row" style="grid-template-columns: 1fr 68px">
                <span class="ratio-name">{{ topicName(t.topic) }}</span>
                <span class="ratio-value">{{ t.correct }}/{{ t.total }} · {{ fmtPercent(t.total ? (t.correct / t.total) * 100 : 0) }}</span>
                <span class="ratio-track">
                  <span class="ratio-fill" :style="{ width: `${t.total ? (t.correct / t.total) * 100 : 0}%` }" />
                </span>
              </div>
            </div>
          </section>

          <section class="card">
            <div class="card-head"><h2 class="card-title">近 7 天练习量</h2><span class="hint">题 / 天</span></div>
            <div class="card-body">
              <div style="display: flex; align-items: flex-end; gap: 10px; height: 132px">
                <div v-for="t in data.trend" :key="t.date" style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0">
                  <span class="mono hint" style="font-size: 10px">{{ t.count }}</span>
                  <div :style="{ height: `${Math.max(6, (t.count / maxTrend) * 88)}px`, width: '100%', maxWidth: '36px', background: 'var(--brand)', opacity: .85, borderRadius: '3px 3px 0 0' }" />
                  <span class="hint" style="font-size: 10px">{{ t.date.slice(5) }}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section class="card" style="margin-top: 20px">
          <div class="card-head"><h2 class="card-title">考试说明</h2><span class="tag tag--brand">50 单选 + 25 多选</span></div>
          <div class="card-body">
            <p class="muted" style="line-height: 1.9">
              正式模拟考按 ACP 考纲蓝图组卷：50 道单选（1 分/题）+ 25 道多选（2 分/题），满分 100 分。
              答案由服务端判分，前端不下发正确答案；交卷后生成成绩摘要与逐题解析，错题自动进入错题本。
              板块占比 17 / 15 / 20 / 16 / 16 / 16 来自考纲常量，由 <code class="mono">/api/meta</code> 下发。
            </p>
          </div>
        </section>
      </template>
    </StatePanel>
  </div>
</template>
