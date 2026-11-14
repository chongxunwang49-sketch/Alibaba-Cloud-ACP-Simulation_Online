<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '@/api'
import { useAsync } from '@/composables/useAsync'
import { TOPICS } from '@/mock'
import type { WrongQuestion } from '@/types'
import StatePanel from '@/components/StatePanel.vue'
import { TOPIC_LABEL, TYPE_LABEL, fmtDate } from '@/utils/format'

const topic = ref('all')
const type = ref('all')
const mastered = ref('all')
const actionError = ref<string | null>(null)

const { data, loading, error, run } = useAsync<WrongQuestion[]>(() =>
  api.wrongQuestions({
    topic: topic.value,
    type: type.value,
    mastered: mastered.value === 'all' ? undefined : mastered.value === 'yes',
  }),
)
watch([topic, type, mastered], () => { void run() })

const rows = computed(() => data.value ?? [])
const pendingCount = computed(() => rows.value.filter((r) => !r.mastered).length)

async function act(fn: () => Promise<unknown>): Promise<void> {
  actionError.value = null
  try { await fn(); await run() }
  catch (err) { actionError.value = err instanceof Error ? err.message : '操作失败，请重试' }
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1 class="page-title">错题本</h1>
        <p class="page-desc">练习与模拟考中答错的题目自动归集，支持按板块、题型和掌握状态筛选。</p>
      </div>
      <div class="page-actions"><span class="tag tag--warn">待复盘 {{ pendingCount }} 题</span></div>
    </div>

    <div class="toolbar">
      <select v-model="topic" class="select" aria-label="板块筛选"><option value="all">全部板块</option><option v-for="t in TOPICS" :key="t.key" :value="t.key">{{ t.name }}</option></select>
      <select v-model="type" class="select" aria-label="题型筛选"><option value="all">全部题型</option><option value="single">单选题</option><option value="multiple">多选题</option></select>
      <select v-model="mastered" class="select" aria-label="掌握状态"><option value="all">全部状态</option><option value="no">待复盘</option><option value="yes">已掌握</option></select>
      <button class="btn" type="button" @click="run()">刷新</button>
      <RouterLink class="btn btn--primary" to="/practice" style="margin-left: auto">去专项练习</RouterLink>
    </div>

    <p v-if="actionError" class="tag tag--err" style="margin-bottom: 12px">{{ actionError }}</p>

    <StatePanel
      :loading="loading" :error="error" :empty="!rows.length"
      empty-title="错题本是空的" empty-desc="没有符合条件的错题。去做一套专项练习，答错的题目会自动出现在这里。"
      @retry="run"
    >
      <template #action><RouterLink class="btn btn--primary" to="/practice">开始练习</RouterLink></template>

      <div class="card card--flush">
        <div class="table-scroll">
          <table class="data-table table-wrong">
            <thead>
              <tr>
                <th>题干摘要</th><th style="width: 88px">题型</th><th style="width: 170px">所属板块</th>
                <th style="width: 100px">错误次数</th><th style="width: 150px">最近错误</th>
                <th style="width: 92px">状态</th><th style="width: 170px; text-align: right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.questionId">
                <td class="cell-question" :title="row.question">{{ row.question }}</td>
                <td>{{ TYPE_LABEL[row.type] }}</td>
                <td>{{ TOPIC_LABEL[row.topic] }}</td>
                <td class="cell-num">{{ row.wrongCount }}</td>
                <td class="hint mono">{{ fmtDate(row.lastWrongAt) }}</td>
                <td><span class="tag" :class="row.mastered ? 'tag--ok' : 'tag--err'">{{ row.mastered ? '已掌握' : '待复盘' }}</span></td>
                <td class="cell-actions">
                  <button class="btn btn--sm" type="button" @click="act(() => api.patchWrong(row.questionId, !row.mastered))">
                    {{ row.mastered ? '重新标记' : '标记已掌握' }}
                  </button>
                  <button class="btn btn--sm btn--ghost" type="button" @click="act(() => api.deleteWrong(row.questionId))">移出</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="table-foot"><span>共 {{ rows.length }} 条错题记录</span><span>数据由 /api/wrong-questions 下发</span></div>
      </div>
    </StatePanel>
  </div>
</template>
