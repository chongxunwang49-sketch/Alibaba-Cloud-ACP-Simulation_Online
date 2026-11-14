<script setup lang="ts">
import { computed } from 'vue'
import { api } from '@/api'
import { useAsync } from '@/composables/useAsync'
import type { ExamSummary } from '@/types'
import StatePanel from '@/components/StatePanel.vue'
import { fmtDate, fmtDuration } from '@/utils/format'

const { data, loading, error, run } = useAsync<ExamSummary[]>(() => api.exams())
const rows = computed(() => data.value ?? [])
const avg = computed(() => rows.value.length ? Math.round(rows.value.reduce((s, r) => s + r.score, 0) / rows.value.length) : 0)
const best = computed(() => rows.value.length ? Math.max(...rows.value.map((r) => r.score)) : 0)

function scoreTag(score: number): string {
  if (score >= 80) return 'tag--ok'
  if (score >= 60) return 'tag--brand'
  return 'tag--err'
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1 class="page-title">模拟考成绩</h1>
        <p class="page-desc">全真模拟考（50 单选 + 25 多选）历史成绩，按交卷时间倒序。</p>
      </div>
      <div class="page-actions"><RouterLink class="btn btn--accent" to="/exam">新的一场模拟考</RouterLink></div>
    </div>

    <StatePanel :loading="loading" :error="error" variant="table" @retry="run">
      <template v-if="rows.length">
        <div class="grid-cards" style="margin-bottom: 20px">
          <div class="metric"><div class="metric-label">考试次数</div><div class="metric-value">{{ rows.length }}<small>次</small></div></div>
          <div class="metric"><div class="metric-label">历史最高分</div><div class="metric-value">{{ best }}<small>分</small></div></div>
          <div class="metric"><div class="metric-label">平均分</div><div class="metric-value">{{ avg }}<small>分</small></div></div>
          <div class="metric"><div class="metric-label">及格率（≥60）</div><div class="metric-value">{{ Math.round((rows.filter((r) => r.score >= 60).length / rows.length) * 100) }}<small>%</small></div></div>
        </div>

        <div class="card card--flush">
          <div class="table-scroll">
            <table class="data-table table-scores">
              <thead>
                <tr>
                  <th style="width: 200px">试卷编号</th><th style="width: 160px">交卷时间</th>
                  <th style="width: 100px">得分</th><th style="width: 130px">答对 / 总题</th>
                  <th style="width: 120px">用时</th><th style="width: 100px">状态</th>
                  <th style="width: 110px; text-align: right">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="row.examId">
                  <td class="mono hint">{{ row.examId }}</td>
                  <td class="mono">{{ fmtDate(row.submittedAt) }}</td>
                  <td><span class="tag" :class="scoreTag(row.score)" style="font-size: 13px; font-weight: 600">{{ row.score }}</span></td>
                  <td class="cell-num">{{ row.correctCount }} / {{ row.total }}</td>
                  <td class="mono">{{ fmtDuration(row.durationSec) }}</td>
                  <td><span class="tag" :class="row.status === 'submitted' ? 'tag--ok' : 'tag--warn'">{{ row.status === 'submitted' ? '已交卷' : '进行中' }}</span></td>
                  <td class="cell-actions"><RouterLink class="btn btn--sm" :to="`/exam/${row.examId}/report`">查看报告</RouterLink></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="table-foot"><span>共 {{ rows.length }} 场考试</span><span>数据由 /api/exams 下发</span></div>
        </div>
      </template>

      <div v-else class="card state-box">
        <div class="state-art" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3v18h18M7 15l4-4 3 3 5-6" /></svg>
        </div>
        <h3 class="state-title">还没有模拟考记录</h3>
        <p class="state-desc">完成一场全真模拟考后，成绩摘要与逐题解析会显示在这里。</p>
        <div class="state-actions"><RouterLink class="btn btn--primary" to="/exam">开始第一场</RouterLink></div>
      </div>
    </StatePanel>
  </div>
</template>
