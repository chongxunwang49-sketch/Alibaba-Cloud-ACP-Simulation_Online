<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'
import { useAsync } from '@/composables/useAsync'
import type { Exam } from '@/types'
import StatePanel from '@/components/StatePanel.vue'
import { fmtDuration, letterOf, TYPE_LABEL } from '@/utils/format'

const router = useRouter()
const { data: exam, loading, error, run } = useAsync<Exam>(() => api.createExam())

const answers = ref<Record<string, string[]>>({})
const current = ref(0)
const elapsed = ref(0)
const submitting = ref(false)
const submitError = ref<string | null>(null)
const confirmOpen = ref(false)

const questions = computed(() => exam.value?.questions ?? [])
const currentQ = computed(() => questions.value[current.value] ?? null)
const selected = computed(() => (currentQ.value ? answers.value[currentQ.value.id] ?? [] : []))
const answeredCount = computed(() => questions.value.filter((q) => (answers.value[q.id] ?? []).length).length)

let timer: number | undefined
watch(exam, (e) => {
  if (e && timer === undefined) timer = window.setInterval(() => { elapsed.value += 1 }, 1000)
})
onUnmounted(() => { if (timer !== undefined) window.clearInterval(timer) })

function toggle(letter: string): void {
  const q = currentQ.value
  if (!q) return
  const next = q.type === 'multiple'
    ? (selected.value.includes(letter) ? selected.value.filter((x) => x !== letter) : [...selected.value, letter].sort())
    : [letter]
  answers.value = { ...answers.value, [q.id]: next }
}

async function doSubmit(): Promise<void> {
  if (!exam.value) return
  confirmOpen.value = false
  submitting.value = true
  submitError.value = null
  try {
    const res = await api.submitExam(exam.value.examId, { answers: answers.value })
    await router.push({ name: 'exam-report', params: { id: res.examId } })
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : '交卷失败，请重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="exam-shell">
    <header class="exam-bar">
      <RouterLink to="/" class="brand" style="min-width: auto">
        <span class="brand-mark" aria-hidden="true">A</span>
        <span class="brand-name">ACP 全真模拟考</span>
      </RouterLink>
      <span class="tag tag--brand">50 单选 + 25 多选 · 满分 100</span>
      <span class="topbar-spacer" />
      <span class="hint">已作答 <b class="mono">{{ answeredCount }}/{{ questions.length }}</b></span>
      <span class="timer" :class="{ 'is-warning': exam && elapsed > exam.durationSec * 0.85 }">
        {{ fmtDuration(elapsed) }}
      </span>
      <RouterLink class="btn btn--sm" to="/">退出</RouterLink>
      <button class="btn btn--accent" type="button" :disabled="!exam || submitting" @click="confirmOpen = true">
        {{ submitting ? '交卷中…' : '交卷' }}
      </button>
    </header>

    <div style="padding: 0 24px; max-width: 1440px; width: 100%; margin: 0 auto">
      <StatePanel
        :loading="loading" :error="error" variant="quiz"
        :empty="!loading && !error && !questions.length"
        empty-title="组卷失败" empty-desc="未能从题库生成试卷，请重新尝试。" @retry="run"
      >
        <template #action><button class="btn btn--primary" type="button" @click="run()">重新组卷</button></template>

        <p v-if="submitError" class="tag tag--err" style="margin: 16px 0">{{ submitError }}</p>

        <div class="exam-main" style="padding-left: 0; padding-right: 0">
          <section class="card" aria-label="题目区域">
            <template v-if="currentQ">
              <div class="q-head">
                <span class="tag tag--brand">{{ TYPE_LABEL[currentQ.type] }}</span>
                <span class="tag">{{ currentQ.points ?? (currentQ.type === 'multiple' ? 2 : 1) }} 分</span>
                <span class="q-index" style="margin-left: auto">第 {{ current + 1 }} / {{ questions.length }} 题</span>
              </div>
              <h2 class="q-title">{{ currentQ.question }}</h2>
              <p class="q-hint">全真模式：答案暂存，交卷后由服务端统一判分，不即时显示对错。</p>
              <div class="q-options">
                <button
                  v-for="(opt, i) in currentQ.options" :key="i" type="button"
                  class="q-option" :class="{ 'is-selected': selected.includes(letterOf(i)) }"
                  :aria-pressed="selected.includes(letterOf(i))" @click="toggle(letterOf(i))"
                >
                  <span class="key">{{ letterOf(i) }}</span><span class="text">{{ opt }}</span>
                </button>
              </div>
              <div class="q-actions">
                <span class="q-actions-left">已选 {{ selected.length }} 项</span>
                <div style="display: flex; gap: 8px">
                  <button class="btn" type="button" :disabled="current === 0" @click="current -= 1">上一题</button>
                  <button class="btn btn--primary" type="button" :disabled="current >= questions.length - 1" @click="current += 1">下一题</button>
                </div>
              </div>
            </template>
          </section>

          <aside class="card" style="align-self: start; position: sticky; top: 0">
            <div class="card-head" style="padding: 12px 16px"><span class="card-title">答题卡</span><span class="hint mono">{{ answeredCount }}/{{ questions.length }}</span></div>
            <div class="card-body" style="padding: 16px">
              <div class="answer-sheet" style="grid-template-columns: repeat(6, 1fr)">
                <button
                  v-for="(q, i) in questions" :key="q.id" type="button" class="answer-cell"
                  :class="{ 'is-current': current === i, 'is-answered': (answers[q.id] ?? []).length > 0 }"
                  :aria-label="`跳转到第 ${i + 1} 题`" @click="current = i"
                >{{ i + 1 }}</button>
              </div>
              <div class="sheet-legend">
                <span><i class="legend-dot" />未答</span>
                <span><i class="legend-dot is-answered" />已作答</span>
              </div>
              <p class="hint" style="margin-top: 16px; line-height: 1.7">交卷后生成成绩摘要与逐题解析，答错题目自动进入错题本。</p>
            </div>
          </aside>
        </div>
      </StatePanel>
    </div>

    <!-- 交卷确认 -->
    <div v-if="confirmOpen" class="modal-layer">
      <div class="drawer-mask" @click="confirmOpen = false" />
      <div class="card modal-card">
        <h3 class="card-title" style="margin-bottom: 8px">确认交卷？</h3>
        <p class="muted" style="line-height: 1.8">
          已作答 {{ answeredCount }} / {{ questions.length }} 题，还有 <b>{{ questions.length - answeredCount }}</b> 题未作答。
          交卷后不可修改答案，服务端将统一判分并生成成绩报告。
        </p>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px">
          <button class="btn" type="button" @click="confirmOpen = false">继续答题</button>
          <button class="btn btn--accent" type="button" @click="doSubmit">确认交卷</button>
        </div>
      </div>
    </div>
  </div>
</template>
