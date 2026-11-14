<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '@/api'
import { useAsync } from '@/composables/useAsync'
import { TOPICS } from '@/mock'
import type { AnswerResult, PracticeSet } from '@/types'
import { letterOf, TOPIC_LABEL, TYPE_LABEL } from '@/utils/format'
import StatePanel from '@/components/StatePanel.vue'

const topic = ref('all')
const type = ref('all')
const count = ref(20)

const { data: set, loading, error, run } = useAsync<PracticeSet>(() =>
  api.practiceSet({ topic: topic.value, type: type.value, count: count.value }),
)

const current = ref(0)
const selectedMap = ref<Record<string, string[]>>({})
const resultMap = ref<Record<string, AnswerResult>>({})
const submitting = ref(false)
const submitError = ref<string | null>(null)
const inspectorOpen = ref(false)

const questions = computed(() => set.value?.questions ?? [])
const currentQ = computed(() => questions.value[current.value] ?? null)
const selected = computed(() => (currentQ.value ? selectedMap.value[currentQ.value.id] ?? [] : []))
const result = computed(() => (currentQ.value ? resultMap.value[currentQ.value.id] ?? null : null))
const answeredCount = computed(() => Object.keys(resultMap.value).length)
const progress = computed(() => questions.value.length ? Math.round((answeredCount.value / questions.value.length) * 100) : 0)

function reset(): void {
  current.value = 0
  selectedMap.value = {}
  resultMap.value = {}
  submitError.value = null
}

watch([topic, type, count], () => { reset(); void run() })

function toggleOption(letter: string): void {
  const q = currentQ.value
  if (!q || result.value || submitting.value) return
  const next = q.type === 'multiple'
    ? (selected.value.includes(letter) ? selected.value.filter((x) => x !== letter) : [...selected.value, letter].sort())
    : [letter]
  selectedMap.value = { ...selectedMap.value, [q.id]: next }
}

async function submitAnswer(): Promise<void> {
  const q = currentQ.value
  if (!q || !selected.value.length || result.value || submitting.value) return
  submitting.value = true
  submitError.value = null
  try {
    const r = await api.practiceAnswer({ questionId: q.id, selected: selected.value })
    resultMap.value = { ...resultMap.value, [q.id]: r }
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : '提交失败，请重试'
  } finally {
    submitting.value = false
  }
}

function go(index: number): void {
  if (index < 0 || index >= questions.value.length) return
  current.value = index
  submitError.value = null
  if (window.innerWidth <= 1200) inspectorOpen.value = false
}

function optionClass(letter: string): Record<string, boolean> {
  const r = result.value
  if (!r) return { 'is-selected': selected.value.includes(letter) }
  return {
    'is-correct': r.answer.includes(letter),
    'is-wrong': selected.value.includes(letter) && !r.answer.includes(letter),
  }
}

function optionMark(letter: string): string {
  const r = result.value
  if (!r) return ''
  if (r.answer.includes(letter)) return '正确答案'
  return selected.value.includes(letter) ? '你的选择' : ''
}

function cellClass(index: number): Record<string, boolean> {
  const q = questions.value[index]
  const r = q ? resultMap.value[q.id] : undefined
  return {
    'is-current': current.value === index,
    'is-correct': !!r && r.correct,
    'is-wrong': !!r && !r.correct,
  }
}

const explanationText = computed(() => {
  const r = result.value
  if (!r) return ''
  return r.explanation.trim()
    ? r.explanation
    : '该题库原题未附带解析（全库 951 题中 299 题含原解析）。建议结合右侧「考点溯源」中的板块与来源文档复习，此处不生成推测性解析。'
})
</script>

<template>
  <div>
    <!-- 窄屏时右栏变为抽屉，遮罩仅在 <=1200px 生效 -->
    <div v-if="inspectorOpen" class="drawer-mask drawer-mask--inspector" @click="inspectorOpen = false" />

    <div class="page-head">
      <div>
        <h1 class="page-title">专项练习</h1>
        <p class="page-desc">按板块与题型组卷，提交后由服务端判分，右侧即时展开解析与考点溯源。</p>
      </div>
      <div class="page-actions">
        <select v-model="topic" class="select" aria-label="选择板块">
          <option value="all">全部板块</option>
          <option v-for="t in TOPICS" :key="t.key" :value="t.key">{{ t.name }}</option>
        </select>
        <select v-model="type" class="select" aria-label="选择题型">
          <option value="all">全部题型</option>
          <option value="single">单选题</option>
          <option value="multiple">多选题</option>
        </select>
        <select v-model.number="count" class="select" aria-label="选择题数">
          <option :value="10">10 题</option>
          <option :value="20">20 题</option>
          <option :value="24">24 题</option>
        </select>
        <button class="btn" type="button" @click="reset(); run()">重新组卷</button>
        <button class="btn btn--ghost inspector-toggle" type="button" @click="inspectorOpen = !inspectorOpen">
          答题卡 / 解析
        </button>
      </div>
    </div>

    <div class="card" style="margin-bottom: 16px; padding: 12px 20px">
      <div style="display: flex; align-items: center; gap: 12px">
        <span class="hint" style="white-space: nowrap">本卷进度</span>
        <div class="progress-track" style="flex: 1"><div class="progress-fill" :style="{ width: `${progress}%` }" /></div>
        <span class="mono hint">{{ answeredCount }} / {{ questions.length }}</span>
      </div>
    </div>

    <StatePanel
      :loading="loading" :error="error" variant="quiz"
      :empty="!loading && !error && !questions.length"
      empty-title="没有匹配的题目" empty-desc="当前板块或题型下没有可用题目，试试放宽筛选条件。"
      @retry="run"
    >
      <template #action>
        <button class="btn btn--primary" type="button" @click="topic = 'all'; type = 'all'">重置筛选</button>
      </template>

      <div class="quiz-layout">
        <!-- 左：题干与大尺寸选项 -->
        <section class="quiz-pane card" aria-label="题目区域">
          <template v-if="currentQ">
            <div class="q-head">
              <span class="tag tag--brand">{{ TYPE_LABEL[currentQ.type] }}</span>
              <span class="tag">{{ currentQ.points ?? (currentQ.type === 'multiple' ? 2 : 1) }} 分</span>
              <span class="tag">{{ TOPIC_LABEL[currentQ.topic] }}</span>
              <span class="q-index" style="margin-left: auto">第 {{ current + 1 }} / {{ questions.length }} 题</span>
            </div>

            <h2 class="q-title">{{ currentQ.question }}</h2>
            <p class="q-hint">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
              {{ currentQ.type === 'multiple' ? '多选题，需全部选对才得分；点击「提交答案」判分' : '单选题，选择后点击「提交答案」判分' }}
            </p>

            <div class="q-options" role="group" :aria-label="`第 ${current + 1} 题选项`">
              <button
                v-for="(opt, i) in currentQ.options" :key="i"
                class="q-option" :class="optionClass(letterOf(i))"
                type="button" :disabled="!!result || submitting"
                :aria-pressed="selected.includes(letterOf(i))"
                @click="toggleOption(letterOf(i))"
              >
                <span class="key">{{ letterOf(i) }}</span>
                <span class="text">{{ opt }}</span>
                <span v-if="result" class="mark">{{ optionMark(letterOf(i)) }}</span>
              </button>
            </div>

            <p v-if="submitError" class="tag tag--err" style="margin-top: 12px">{{ submitError }}</p>

            <div class="q-actions">
              <span class="q-actions-left">
                <template v-if="result">已判分 · {{ result.correct ? '回答正确' : '回答错误' }}</template>
                <template v-else>已选 {{ selected.length }} 项</template>
              </span>
              <div style="display: flex; gap: 8px">
                <button class="btn" type="button" :disabled="current === 0" @click="go(current - 1)">上一题</button>
                <button
                  v-if="!result" class="btn btn--primary" type="button"
                  :disabled="!selected.length || submitting" @click="submitAnswer"
                >{{ submitting ? '判分中…' : '提交答案' }}</button>
                <button v-else class="btn btn--primary" type="button" :disabled="current >= questions.length - 1" @click="go(current + 1)">下一题</button>
                <button v-if="current < questions.length - 1 && result" class="btn" type="button" @click="go(current + 1)">跳过</button>
              </div>
            </div>
          </template>
        </section>

        <!-- 右：固定答题卡 + 解析 + 考点溯源 -->
        <aside class="inspector" :class="{ 'is-open': inspectorOpen }" aria-label="答题卡与解析面板">
          <div class="card">
            <div class="card-head" style="padding: 12px 16px">
              <span class="card-title">答题卡</span>
              <span class="hint mono">{{ answeredCount }} / {{ questions.length }}</span>
            </div>
            <div class="card-body" style="padding: 16px">
              <div class="answer-sheet">
                <button
                  v-for="(q, i) in questions" :key="q.id"
                  class="answer-cell" :class="cellClass(i)" type="button"
                  :aria-label="`跳转到第 ${i + 1} 题`" @click="go(i)"
                >{{ i + 1 }}</button>
              </div>
              <div class="sheet-legend">
                <span><i class="legend-dot" />未答</span>
                <span><i class="legend-dot is-correct" />答对</span>
                <span><i class="legend-dot is-wrong" />答错</span>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head" style="padding: 12px 16px">
              <span class="card-title">本题解析</span>
              <span v-if="result" class="tag" :class="result.correct ? 'tag--ok' : 'tag--err'">{{ result.correct ? '回答正确' : '回答错误' }}</span>
              <span v-else class="hint">提交后展开</span>
            </div>

            <!-- 提交后平滑展开：max-height + opacity 过渡 -->
            <div class="analysis-panel" :class="{ 'is-open': !!result }">
              <div class="card-body" style="padding: 16px">
                <template v-if="result">
                  <div class="analysis-row"><span class="label">你的作答</span><span class="value mono">{{ selected.join('、') || '未作答' }}</span></div>
                  <div class="analysis-row"><span class="label">正确答案</span><span class="value mono">{{ result.answer.join('、') }}</span></div>
                  <p class="analysis-text" :class="{ 'is-empty': !result.explanation.trim() }">{{ explanationText }}</p>
                </template>
              </div>
            </div>

            <div v-if="!result" class="card-body state-box" style="min-height: 120px; padding: 24px 16px">
              <div class="state-art" style="width: 40px; height: 40px; font-size: 16px" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
              </div>
              <p class="state-desc" style="margin-top: 0">提交答案后，这里会展开判分结果与原题解析。</p>
            </div>
          </div>

          <div class="card">
            <div class="card-head" style="padding: 12px 16px"><span class="card-title">考点溯源</span></div>
            <div class="card-body" style="padding: 16px">
              <ul v-if="currentQ" class="trace-list">
                <li>考纲板块：{{ TOPIC_LABEL[currentQ.topic] }}（占比 {{ TOPICS.find((t) => t.key === currentQ?.topic)?.ratio }}%）</li>
                <li>题型：{{ TYPE_LABEL[currentQ.type] }}</li>
                <li>题目来源：{{ currentQ.source || '社区题库' }}</li>
                <li v-if="currentQ.sourceUrl">
                  <a :href="currentQ.sourceUrl" target="_blank" rel="noopener noreferrer" style="color: var(--brand)">查看原题文档 ↗</a>
                </li>
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </StatePanel>
  </div>
</template>
