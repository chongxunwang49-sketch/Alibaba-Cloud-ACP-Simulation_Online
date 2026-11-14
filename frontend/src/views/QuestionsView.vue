<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '@/api'
import { useAsync } from '@/composables/useAsync'
import { TOPICS } from '@/mock'
import type { Paginated, Question } from '@/types'
import StatePanel from '@/components/StatePanel.vue'
import { TOPIC_LABEL, TYPE_LABEL } from '@/utils/format'

const topic = ref('all')
const type = ref('all')
const keywordInput = ref('')
const keyword = ref('')
const page = ref(1)
const pageSize = 10

const { data, loading, error, run } = useAsync<Paginated<Question>>(() =>
  api.questions({ page: page.value, pageSize, topic: topic.value, type: type.value, keyword: keyword.value }),
)
watch([topic, type, page, keyword], () => { void run() })

const rows = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

function search(): void {
  keyword.value = keywordInput.value.trim()
  page.value = 1
  void run()
}
function reset(): void {
  topic.value = 'all'; type.value = 'all'; keywordInput.value = ''; keyword.value = ''; page.value = 1
  void run()
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1 class="page-title">题库浏览</h1>
        <p class="page-desc">服务端分页下发，题目不含答案与解析 —— 判分只在提交后返回，避免答案随页面泄露。</p>
      </div>
    </div>

    <div class="toolbar">
      <select v-model="topic" class="select" aria-label="板块筛选"><option value="all">全部板块</option><option v-for="t in TOPICS" :key="t.key" :value="t.key">{{ t.name }}</option></select>
      <select v-model="type" class="select" aria-label="题型筛选"><option value="all">全部题型</option><option value="single">单选题</option><option value="multiple">多选题</option></select>
      <input v-model="keywordInput" class="field" style="width: 220px" placeholder="搜索题干或选项关键词" aria-label="关键词" @keyup.enter="search" />
      <button class="btn btn--primary" type="button" @click="search">搜索</button>
      <button class="btn" type="button" @click="reset">重置</button>
      <span class="hint" style="margin-left: auto">共 {{ total }} 条</span>
    </div>

    <StatePanel
      :loading="loading" :error="error" :empty="!rows.length"
      empty-title="没有匹配的题目" empty-desc="换个板块、题型或关键词试试。"
      @retry="run"
    >
      <template #action><button class="btn btn--primary" type="button" @click="reset">清空筛选</button></template>

      <div class="card card--flush">
        <div class="table-scroll">
          <table class="data-table table-questions">
            <thead>
              <tr><th style="width: 56px">#</th><th>题干</th><th style="width: 92px">题型</th><th style="width: 180px">所属板块</th><th style="width: 180px">来源</th></tr>
            </thead>
            <tbody>
              <tr v-for="(q, i) in rows" :key="q.id">
                <td class="cell-num">{{ (page - 1) * pageSize + i + 1 }}</td>
                <td class="cell-question" :title="q.question">{{ q.question }}</td>
                <td><span class="tag" :class="q.type === 'multiple' ? 'tag--brand' : ''">{{ TYPE_LABEL[q.type] }}</span></td>
                <td>{{ TOPIC_LABEL[q.topic] }}</td>
                <td class="hint">{{ q.source || '社区题库' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="table-foot">
          <span>第 {{ page }} / {{ totalPages }} 页 · 每页 {{ pageSize }} 条</span>
          <div style="display: flex; gap: 8px">
            <button class="btn btn--sm" type="button" :disabled="page <= 1" @click="page -= 1">上一页</button>
            <button class="btn btn--sm" type="button" :disabled="page >= totalPages" @click="page += 1">下一页</button>
          </div>
        </div>
      </div>
    </StatePanel>
  </div>
</template>
