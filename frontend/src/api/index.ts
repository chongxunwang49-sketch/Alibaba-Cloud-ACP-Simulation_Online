import { ref } from 'vue'
import { mockApi, type PracticeQuery, type QuestionQuery, type WrongQuery } from '@/mock'
import type {
  AnswerResult, Exam, ExamReport, ExamSubmission, ExamSummary,
  MetaInfo, OverviewStats, Paginated, PracticeSet, Question, TopicKey, WrongQuestion,
} from '@/types'
import { API_BASE, request, toQuery } from './request'

/**
 * 接口清单对齐 docs/01-API-接口文档.md。
 *
 * 后端返回的是“紧凑结构”（练习/列表用 items，试卷用 paper + id，统计为嵌套对象），
 * 视图层用的是早先与演示数据约定的扁平结构（questions / examId / 扁平统计）。
 * 这一层负责把后端原始响应映射成视图类型，避免服务端契约被前端展示细节绑架。
 *
 * VITE_USE_MOCK: 'auto'(默认, 仅开发环境后端未就绪时兜底) | 'on' | 'off'
 * 生产构建默认不兜底，避免把演示答案随前端下发。
 */
const MODE = (import.meta.env.VITE_USE_MOCK as string | undefined) ?? 'auto'

/** 顶栏用这个响应式标记提示「演示数据」，避免把 Mock 结果误当成线上真实数据。 */
export const mockMode = ref(false)
export function isMockMode(): boolean { return mockMode.value }
export function apiBase(): string { return API_BASE }

function allowMock(): boolean {
  if (MODE === 'on') return true
  if (MODE === 'off') return false
  return import.meta.env.DEV
}

type Params = Record<string, string | number | boolean | undefined>

/** 去掉空值与前端约定的 'all'（后端枚举不接受 all，缺省才表示全部）。 */
function compact(p: Params): Params {
  const out: Params = {}
  Object.entries(p).forEach(([k, v]) => {
    if (v === undefined || v === '' || v === 'all') return
    out[k] = v
  })
  return out
}

async function mapped<R, T>(
  path: string,
  init: RequestInit,
  fallback: () => Promise<T>,
  map: (raw: R) => T,
): Promise<T> {
  try {
    const raw = await request<R>(path, init)
    mockMode.value = false
    return map(raw)
  } catch (err) {
    if (!allowMock()) throw err
    mockMode.value = true
    return fallback()
  }
}

/* ---------- 后端原始响应（只声明用到的字段，避免与 server 实现重复） ---------- */

interface RawMeta {
  topics: MetaInfo['topics']
  exam: { single: number; multiple: number; total: number; maxScore: number }
  bank: { total: number; single: number; multiple: number; explained?: number }
}

interface RawList<T> {
  items: T[]
  page?: number
  pageSize?: number
  total?: number
}

interface RawPractice {
  items: Question[]
  count: number
}

interface RawAnswer extends Question {
  selected: string[]
  correct: boolean
  answer: string[]
  explanation: string
}

interface RawPaperItem extends Question {
  order: number
  points: number
  selected?: string[] | null
  correct?: boolean | null
}

interface RawTopicStat {
  topic: TopicKey
  name: string
  total: number
  correct: number
}

interface RawExam {
  id: string
  status: 'ongoing' | 'submitted'
  total: number
  startedAt: string
  submittedAt?: string | null
  durationSec?: number | null
  score?: number | null
  maxScore?: number
  correctCount?: number | null
  wrongCount?: number | null
  byTopic?: RawTopicStat[]
  paper?: RawPaperItem[]
  items?: RawReportItem[]
  alreadySubmitted?: boolean
  resumed?: boolean
}

interface RawReportItem extends Question {
  order: number
  points: number
  selected: string[]
  correct: boolean | null
  answer: string[]
  explanation: string
}

interface RawWrong {
  questionId: string
  type: Question['type']
  topic: TopicKey
  question: string
  options: string[]
  wrongCount: number
  lastWrongAt: string
  mastered: boolean
}

interface RawOverview {
  totals: { answered: number; correct: number; accuracy: number }
  exam: { answered: number; correct: number; accuracy: number }
  exams: { count: number; avgScore: number; bestScore: number; lastScore: number | null; lastSubmittedAt: string | null }
  wrongBook: { active: number; mastered: number }
  byTopic: Array<{ topic: TopicKey; name: string; answered: number; correct: number; accuracy: number }>
  last7Days: Array<{ date: string; answered: number; correct: number }>
}

/* ---------- 映射函数 ---------- */

function mapMeta(d: RawMeta): MetaInfo {
  return {
    bankTotal: d.bank.total,
    single: d.bank.single,
    multiple: d.bank.multiple,
    // 后端 /api/meta 的 bank.explained 为带解析题数；老响应没有该字段时兜底 0。
    explained: d.bank.explained ?? 0,
    topics: d.topics,
    blueprint: { single: d.exam.single, multiple: d.exam.multiple },
  }
}

function mapExam(d: RawExam): Exam {
  return {
    examId: d.id,
    startedAt: d.startedAt,
    durationSec: d.durationSec ?? 0,
    questions: (d.paper ?? []).map((p) => ({
      id: p.id,
      type: p.type,
      topic: p.topic,
      question: p.question,
      options: p.options,
      source: p.source,
      sourceUrl: p.sourceUrl,
      points: p.points,
    })),
  }
}

function mapReport(d: RawExam): ExamReport {
  const items = (d.items ?? []).map((it) => ({
    id: it.id,
    type: it.type,
    topic: it.topic,
    question: it.question,
    options: it.options,
    source: it.source,
    sourceUrl: it.sourceUrl,
    selected: it.selected ?? [],
    correct: Boolean(it.correct),
    answer: it.answer ?? [],
    explanation: it.explanation ?? '',
  }))
  return {
    examId: d.id,
    score: d.score ?? 0,
    submittedAt: d.submittedAt ?? d.startedAt,
    items,
  }
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })
const patch = (body: unknown): RequestInit => ({ method: 'PATCH', body: JSON.stringify(body) })

interface AnswerBody { questionId: string; selected: string[] }
interface SubmitBody { answers: Record<string, string[]> }

export const api = {
  health: () =>
    mapped<{ status: string; db: string }, { status: string; db: string }>(
      '/health', {}, async () => ({ status: 'demo', db: 'mock' }), (d) => d,
    ),

  meta: () =>
    mapped<RawMeta, MetaInfo>('/meta', {}, () => mockApi.meta(), mapMeta),

  questions: (p: QuestionQuery = {}) =>
    mapped<RawList<Question>, Paginated<Question>>(
      `/questions${toQuery(compact({ ...p }))}`, {},
      () => mockApi.questions(p),
      (d) => ({
        items: d.items,
        total: d.total ?? d.items.length,
        page: d.page ?? 1,
        pageSize: d.pageSize ?? d.items.length,
      }),
    ),

  practiceSet: (p: PracticeQuery = {}) =>
    mapped<RawPractice, PracticeSet>(
      `/practice/set${toQuery(compact({ ...p }))}`, {},
      () => mockApi.practiceSet(p),
      (d) => ({
        setId: `practice-${Date.now()}`,
        topic: (p.topic ?? 'all') as TopicKey | 'all',
        questions: d.items,
      }),
    ),

  practiceAnswer: (body: AnswerBody) =>
    mapped<RawAnswer, AnswerResult>(
      '/practice/answer', post(body),
      () => mockApi.practiceAnswer(body.questionId, body.selected),
      (d) => ({
        questionId: d.id,
        correct: d.correct,
        answer: d.answer,
        explanation: d.explanation,
        topic: d.topic,
        source: d.source,
        sourceUrl: d.sourceUrl,
      }),
    ),

  createExam: async (): Promise<Exam> => {
    try {
      // 开考只返回试卷摘要，题目明细需要再取一次（同时兼容刷新后恢复进行中的试卷）。
      const created = await request<RawExam>('/exams', post({}))
      const detail = await request<RawExam>(`/exams/${encodeURIComponent(created.id)}`)
      mockMode.value = false
      return mapExam(detail)
    } catch (err) {
      if (!allowMock()) throw err
      mockMode.value = true
      return mockApi.createExam()
    }
  },

  getExam: (id: string) =>
    mapped<RawExam, Exam>(`/exams/${encodeURIComponent(id)}`, {}, () => mockApi.getExam(id), mapExam),

  submitExam: async (id: string, body: SubmitBody): Promise<ExamSubmission> => {
    // 前端用 { questionId: letters } 便于绑定；后端契约是 [{ questionId, selected }]。
    const answers = Object.entries(body.answers).map(([questionId, selected]) => ({ questionId, selected }))
    try {
      const d = await request<RawExam>(`/exams/${encodeURIComponent(id)}/submit`, post({ answers }))
      mockMode.value = false
      const byTopic = (d.byTopic ?? []).map((t) => ({ topic: t.topic, total: t.total, correct: t.correct }))
      return {
        examId: d.id,
        score: d.score ?? 0,
        correctCount: d.correctCount ?? 0,
        wrongCount: d.wrongCount ?? 0,
        total: d.total,
        submittedAt: d.submittedAt ?? new Date().toISOString(),
        byTopic,
      }
    } catch (err) {
      if (!allowMock()) throw err
      mockMode.value = true
      return mockApi.submitExam(id, body.answers)
    }
  },

  examReport: (id: string) =>
    mapped<RawExam, ExamReport>(`/exams/${encodeURIComponent(id)}/report`, {}, () => mockApi.examReport(id), mapReport),

  exams: () =>
    mapped<RawList<RawExam>, ExamSummary[]>(
      '/exams', {},
      () => mockApi.exams(),
      (d) => d.items.map((e) => ({
        examId: e.id,
        score: e.score ?? 0,
        correctCount: e.correctCount ?? 0,
        total: e.total,
        durationSec: e.durationSec ?? 0,
        submittedAt: e.submittedAt ?? e.startedAt,
        status: e.status === 'submitted' ? 'submitted' : 'in-progress',
      })),
    ),

  wrongQuestions: (p: WrongQuery = {}) =>
    mapped<RawList<RawWrong>, WrongQuestion[]>(
      `/wrong-questions${toQuery(compact({ ...p }))}`, {},
      () => mockApi.wrongQuestions(p),
      (d) => d.items.map((w) => ({
        questionId: w.questionId,
        question: w.question,
        type: w.type,
        topic: w.topic,
        wrongCount: w.wrongCount,
        lastWrongAt: w.lastWrongAt,
        mastered: w.mastered,
      })),
    ),

  patchWrong: async (questionId: string, mastered: boolean): Promise<{ ok: boolean }> => {
    try {
      await request(`/wrong-questions/${encodeURIComponent(questionId)}`, patch({ mastered }))
      mockMode.value = false
      return { ok: true }
    } catch (err) {
      if (!allowMock()) throw err
      mockMode.value = true
      return mockApi.patchWrong(questionId, mastered)
    }
  },

  deleteWrong: async (questionId: string): Promise<{ ok: boolean }> => {
    try {
      await request(`/wrong-questions/${encodeURIComponent(questionId)}`, { method: 'DELETE' })
      mockMode.value = false
      return { ok: true }
    } catch (err) {
      if (!allowMock()) throw err
      mockMode.value = true
      return mockApi.deleteWrong(questionId)
    }
  },

  overview: () =>
    mapped<RawOverview, OverviewStats>(
      '/stats/overview', {},
      () => mockApi.overview(),
      (d) => ({
        answered: d.totals.answered,
        accuracy: d.totals.accuracy,
        wrongCount: d.wrongBook.active,
        examCount: d.exams.count,
        bestScore: d.exams.bestScore,
        byTopic: d.byTopic.map((t) => ({ topic: t.topic, total: t.answered, correct: t.correct })),
        trend: d.last7Days.map((x) => ({ date: x.date, count: x.answered })),
      }),
    ),
}
