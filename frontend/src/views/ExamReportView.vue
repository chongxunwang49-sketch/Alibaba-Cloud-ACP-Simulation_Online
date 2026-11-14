<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/api'
import { useAsync } from '@/composables/useAsync'
import type { ExamReport } from '@/types'
import StatePanel from '@/components/StatePanel.vue'
import { fmtDate, letterOf, TOPIC_LABEL, TYPE_LABEL } from '@/utils/format'

const route = useRoute()
const examId = computed(() => String(route.params.id ?? ''))
const { data, loading, error, run } = useAsync<ExamReport>(() => api.examReport(examId.value))

const items = computed(() => data.value?.items ?? [])
const correctCount = computed(() => items.value.filter((i) => i.correct).length)
// 未作答单独计数：后端 wrongCount 只含“答了但错”，不要把它算进答错题。
const wrongCount = computed(() => items.value.filter((i) => !i.correct && i.selected.length > 0).length)
const unansweredCount = computed(() => items.value.filter((i) => i.selected.length === 0).length)
const accuracy = computed(() => items.value.length ? Math.round((correctCount.value / items.value.length) * 100) : 0)
const byTopic = computed(() => {
  const keys = ['app-dev', 'prompt', 'rag', 'finetune', 'agent', 'prod'] as const
  return keys.map((key) => {
    const list = items.value.filter((i) => i.topic === key)
    return { key, total: list.length, correct: list.filter((i) => i.correct).length }
  }).filter((t) => t.total > 0)
})
function optClass(selected: string[], answer: string[], letter: string): string {
  if (answer.includes(letter)) return 'is-answer'
  if (selected.includes(letter)) return 'is-chosen-wrong'
  return ''
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1 class="page-title">成绩报告</h1>
        <p class="page-desc">试卷 {{ examId }} · 交卷时间 {{ data ? fmtDate(data.submittedAt) : '—' }}</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/scores">返回成绩列表</RouterLink>
        <RouterLink class="btn btn--primary" to="/wrong">查看错题本</RouterLink>
      </div>
    </div>

    <StatePanel
      :loading="loading" :error="error" variant="table"
      :empty="!items.length"
      empty-title="该场考试暂无逐题解析"
      empty-desc="历史演示记录未保存逐题快照。新完成的模拟考会生成完整解析，此处不做推测性补全。"
      @retry="run"
    >
      <template #action><RouterLink class="btn btn--primary" to="/exam">再考一场</RouterLink></template>

      <template v-if="items.length">
        <div class="grid-cards" style="margin-bottom: 20px">
          <div class="metric"><div class="metric-label">本场得分</div><div class="metric-value">{{ data?.score ?? 0 }}<small>分</small></div></div>
          <div class="metric"><div class="metric-label">答对题数</div><div class="metric-value">{{ correctCount }}<small>/ {{ items.length }}</small></div></div>
          <div class="metric"><div class="metric-label">答错题数</div><div class="metric-value">{{ wrongCount }}<small>题（未答 {{ unansweredCount }}）</small></div></div>
          <div class="metric"><div class="metric-label">正确率</div><div class="metric-value">{{ accuracy }}<small>%</small></div></div>
        </div>

        <section class="card" style="margin-bottom: 20px">
          <div class="card-head"><h2 class="card-title">板块表现</h2><span class="hint">答对 / 该题数</span></div>
          <div class="card-body" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px">
            <div v-for="t in byTopic" :key="t.key" class="ratio-row" style="grid-template-columns: 1fr 60px">
              <span class="ratio-name">{{ TOPIC_LABEL[t.key] }}</span>
              <span class="ratio-value">{{ t.correct }}/{{ t.total }}</span>
              <span class="ratio-track">
                <span class="ratio-fill" :style="{ width: `${t.total ? (t.correct / t.total) * 100 : 0}%`, background: t.correct / t.total < 0.6 ? 'var(--err)' : 'var(--brand)' }" />
              </span>
            </div>
          </div>
        </section>

        <div class="page-head" style="margin-bottom: 12px"><div><h2 class="card-title">逐题解析</h2></div></div>

        <article v-for="(it, i) in items" :key="it.id" class="card" style="margin-bottom: 12px">
          <div class="q-head">
            <span class="tag" :class="it.correct ? 'tag--ok' : 'tag--err'">{{ it.correct ? '回答正确' : '回答错误' }}</span>
            <span class="tag">{{ TYPE_LABEL[it.type] }}</span>
            <span class="tag">{{ TOPIC_LABEL[it.topic] }}</span>
            <span class="q-index" style="margin-left: auto">第 {{ i + 1 }} 题</span>
          </div>
          <h3 style="font-size: 15px; line-height: 1.7; margin-bottom: 12px">{{ it.question }}</h3>
          <div style="margin-bottom: 12px">
            <div v-for="(opt, oi) in it.options" :key="oi" class="report-option" :class="optClass(it.selected, it.answer, letterOf(oi))">
              <span class="mono" style="font-weight: 600">{{ letterOf(oi) }}</span><span>{{ opt }}</span>
            </div>
          </div>
          <div class="analysis-row"><span class="label">你的作答</span><span class="value mono">{{ it.selected.join('、') || '未作答' }}</span></div>
          <div class="analysis-row"><span class="label">正确答案</span><span class="value mono">{{ it.answer.join('、') }}</span></div>
          <p class="analysis-text" :class="{ 'is-empty': !it.explanation.trim() }">
            {{ it.explanation.trim() || '该题库原题未附带解析（全库 951 题中 299 题含原解析），此处不做推测性补全。' }}
          </p>
        </article>
      </template>
    </StatePanel>
  </div>
</template>
