import type {
  AnswerResult, Exam, ExamReport, ExamReportItem, ExamSubmission, ExamSummary,
  MetaInfo, OverviewStats, Paginated, PracticeSet, Question, Topic, TopicKey, WrongQuestion,
} from '@/types'
import { sameAnswer } from '@/utils/format'

/** 与 server/src/constants/topics.js 完全一致，ratio 为考纲蓝图占比（合计 100）。 */
export const TOPICS: Topic[] = [
  { key: 'app-dev', name: '大模型应用开发', ratio: 17 },
  { key: 'prompt', name: '大模型提示词工程', ratio: 15 },
  { key: 'rag', name: '大模型检索增强', ratio: 20 },
  { key: 'finetune', name: '大模型微调', ratio: 16 },
  { key: 'agent', name: '多 Agent 及多模态应用', ratio: 16 },
  { key: 'prod', name: '生产环境应用实践', ratio: 16 },
]

export interface BankQuestion extends Question {
  answer: string[]
  explanation: string
}

export interface QuestionQuery { page?: number; pageSize?: number; type?: string; topic?: string; keyword?: string }
export interface PracticeQuery { topic?: string; type?: string; count?: number }
export interface WrongQuery { topic?: string; type?: string; mastered?: boolean }

let bankCache: BankQuestion[] | null = null

/**
 * 演示题库是后端 questions.array.json 的 24 道真实子集（含六大板块、18 道带解析）。
 * 放在 public/data 下按需 fetch，不进 JS bundle，不拖慢首屏。
 * 生产环境后端就绪时不会读取此文件 —— 真实接口按约定不下发答案。
 */
export async function loadBank(): Promise<BankQuestion[]> {
  if (bankCache) return bankCache
  const res = await fetch(`${import.meta.env.BASE_URL}data/mock-bank.json`)
  if (!res.ok) throw new Error('演示题库加载失败')
  bankCache = (await res.json()) as BankQuestion[]
  return bankCache
}

const wait = (ms = 220) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function strip(q: BankQuestion): Question {
  const { answer: _answer, explanation: _explanation, ...publicFields } = q
  return publicFields
}

/* ---------- 演示态持久化：让「刷题 → 错题本 → 成绩」在离线时也是闭环 ---------- */
const STORE_KEY = 'acp.mock.state.v1'
interface MockState {
  answered: number
  correct: number
  wrong: WrongQuestion[]
  exams: ExamSummary[]
  reports: Record<string, ExamReport>
}
const emptyState = (): MockState => ({ answered: 0, correct: 0, wrong: [], exams: [], reports: {} })

function readState(): MockState {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) return { ...emptyState(), ...(JSON.parse(raw) as MockState) }
  } catch {
    /* 本地数据损坏时重来即可 */
  }
  return emptyState()
}
function writeState(s: MockState): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)) } catch { /* 无痕模式下忽略 */ }
}

let seedPromise: Promise<void> | null = null
function ensureSeed(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      await wait(120)
      const s = readState()
      if (s.exams.length) return
      const bank = await loadBank()
      const day = 86_400_000
      const now = Date.now()
      const preset = [
        { score: 68, correctCount: 47, durationSec: 3180, ago: 11 },
        { score: 76, correctCount: 55, durationSec: 2960, ago: 7 },
        { score: 83, correctCount: 62, durationSec: 2740, ago: 3 },
        { score: 71, correctCount: 50, durationSec: 3320, ago: 1 },
      ]
      s.exams = preset.map((p, i) => ({
        examId: `demo-history-${i + 1}`,
        score: p.score,
        correctCount: p.correctCount,
        total: 75,
        durationSec: p.durationSec,
        submittedAt: new Date(now - p.ago * day).toISOString(),
        status: 'submitted' as const,
      }))
      s.answered = 268
      s.correct = 201
      s.wrong = bank.slice(0, 6).map((q, i) => ({
        questionId: q.id,
        question: q.question,
        type: q.type,
        topic: q.topic,
        wrongCount: [3, 2, 2, 1, 1, 1][i],
        lastWrongAt: new Date(now - (i + 1) * day * 0.7).toISOString(),
        mastered: i === 5,
      }))
      // 最近一场有完整逐题解析；更早的历史记录故意留空，用于展示空状态。
      const items: ExamReportItem[] = bank.slice(0, 12).map((q, i) => ({
        ...strip(q),
        selected: i % 4 === 0 ? ['A'] : q.answer,
        correct: i % 4 !== 0,
        answer: q.answer,
        explanation: q.explanation,
      }))
      s.reports[s.exams[3].examId] = {
        examId: s.exams[3].examId,
        score: 71,
        submittedAt: s.exams[3].submittedAt,
        items,
      }
      writeState(s)
    })()
  }
  return seedPromise
}

function upsertWrong(s: MockState, q: BankQuestion): void {
  const hit = s.wrong.find((w) => w.questionId === q.id)
  if (hit) {
    hit.wrongCount += 1
    hit.lastWrongAt = new Date().toISOString()
    hit.mastered = false
  } else {
    s.wrong.unshift({
      questionId: q.id, question: q.question, type: q.type, topic: q.topic,
      wrongCount: 1, lastWrongAt: new Date().toISOString(), mastered: false,
    })
  }
}

function scoreOf(questions: BankQuestion[], answers: Record<string, string[]>): { score: number; correctCount: number; wrongCount: number } {
  let got = 0
  let full = 0
  let correctCount = 0
  for (const q of questions) {
    const points = q.points ?? (q.type === 'multiple' ? 2 : 1)
    full += points
    const selected = answers[q.id] ?? []
    if (selected.length && sameAnswer(selected, q.answer)) { got += points; correctCount += 1 }
  }
  return { score: full ? Math.round((got / full) * 100) : 0, correctCount, wrongCount: questions.length - correctCount }
}

export const mockApi = {
  async meta(): Promise<MetaInfo> {
    await wait(160)
    // 题库统计是全库真值（951 / 644 / 307 / 299），演示卷只是其中 24 道真实子集。
    return {
      bankTotal: 951, single: 644, multiple: 307, explained: 299,
      topics: TOPICS,
      blueprint: { single: 50, multiple: 25 },
    }
  },

  async questions(p: QuestionQuery): Promise<Paginated<Question>> {
    await ensureSeed()
    await wait()
    const bank = await loadBank()
    let list = bank
    if (p.topic && p.topic !== 'all') list = list.filter((q) => q.topic === p.topic)
    if (p.type && p.type !== 'all') list = list.filter((q) => q.type === p.type)
    if (p.keyword) {
      const k = p.keyword.toLowerCase()
      list = list.filter((q) => q.question.toLowerCase().includes(k) || q.options.some((o) => o.toLowerCase().includes(k)))
    }
    const page = Math.max(1, Number(p.page) || 1)
    const pageSize = Math.max(1, Number(p.pageSize) || 10)
    return { items: list.slice((page - 1) * pageSize, page * pageSize).map(strip), total: list.length, page, pageSize }
  },

  async practiceSet(p: PracticeQuery): Promise<PracticeSet> {
    await wait()
    const bank = await loadBank()
    let pool = bank.filter((q) =>
      (!p.topic || p.topic === 'all' || q.topic === p.topic) &&
      (!p.type || p.type === 'all' || q.type === p.type),
    )
    if (!pool.length) pool = bank
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    const count = Math.min(Number(p.count) || 20, shuffled.length)
    return {
      setId: `demo-set-${Date.now()}`,
      topic: (p.topic || 'all') as TopicKey | 'all',
      questions: shuffled.slice(0, count).map(strip),
    }
  },

  async practiceAnswer(questionId: string, selected: string[]): Promise<AnswerResult> {
    await ensureSeed()
    await wait(180)
    const bank = await loadBank()
    const q = bank.find((x) => x.id === questionId)
    if (!q) throw new Error('题目不存在')
    const correct = sameAnswer(selected, q.answer)
    const s = readState()
    s.answered += 1
    if (correct) s.correct += 1
    else upsertWrong(s, q)
    writeState(s)
    return {
      questionId, correct, answer: q.answer, explanation: q.explanation,
      topic: q.topic, source: q.source, sourceUrl: q.sourceUrl,
    }
  },

  async createExam(): Promise<Exam> {
    await wait()
    const bank = await loadBank()
    return {
      examId: `demo-exam-${Date.now()}`,
      startedAt: new Date().toISOString(),
      durationSec: 5400,
      questions: [...bank].sort(() => Math.random() - 0.5).map(strip),
    }
  },

  async getExam(examId: string): Promise<Exam> {
    await wait(120)
    const bank = await loadBank()
    return { examId, startedAt: new Date().toISOString(), durationSec: 5400, questions: bank.map(strip) }
  },

  async submitExam(examId: string, answers: Record<string, string[]>): Promise<ExamSubmission> {
    await ensureSeed()
    await wait(280)
    const bank = await loadBank()
    const result = scoreOf(bank, answers)
    const byTopic = TOPICS.map((t) => {
      const qs = bank.filter((q) => q.topic === t.key)
      return {
        topic: t.key, total: qs.length,
        correct: qs.filter((q) => (answers[q.id] ?? []).length && sameAnswer(answers[q.id], q.answer)).length,
      }
    })
    const now = new Date().toISOString()
    const s = readState()
    s.exams.push({
      examId, score: result.score, correctCount: result.correctCount,
      total: bank.length, durationSec: 0, submittedAt: now, status: 'submitted',
    })
    const items: ExamReportItem[] = bank.map((q) => {
      const selected = answers[q.id] ?? []
      const correct = selected.length > 0 && sameAnswer(selected, q.answer)
      return { ...strip(q), selected, correct, answer: q.answer, explanation: q.explanation }
    })
    for (const q of bank) {
      const selected = answers[q.id] ?? []
      if (!sameAnswer(selected, q.answer)) upsertWrong(s, q)
    }
    s.reports[examId] = { examId, score: result.score, submittedAt: now, items }
    writeState(s)
    return {
      examId, score: result.score, correctCount: result.correctCount,
      wrongCount: result.wrongCount, total: bank.length, submittedAt: now, byTopic,
    }
  },

  async examReport(examId: string): Promise<ExamReport> {
    await ensureSeed()
    await wait()
    const s = readState()
    const report = s.reports[examId]
    if (report) return report
    const exam = s.exams.find((e) => e.examId === examId)
    // 历史演示记录没有逐题快照 —— 返回空 items，由页面走空状态，不伪造解析。
    return { examId, score: exam?.score ?? 0, submittedAt: exam?.submittedAt ?? new Date().toISOString(), items: [] }
  },

  async exams(): Promise<ExamSummary[]> {
    await ensureSeed()
    await wait()
    return [...readState().exams].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
  },

  async wrongQuestions(p: WrongQuery): Promise<WrongQuestion[]> {
    await ensureSeed()
    await wait()
    let list = [...readState().wrong]
    if (p.topic && p.topic !== 'all') list = list.filter((w) => w.topic === p.topic)
    if (p.type && p.type !== 'all') list = list.filter((w) => w.type === p.type)
    if (p.mastered !== undefined) list = list.filter((w) => w.mastered === p.mastered)
    return list.sort((a, b) => b.lastWrongAt.localeCompare(a.lastWrongAt))
  },

  async patchWrong(questionId: string, mastered: boolean): Promise<{ ok: boolean }> {
    await wait(120)
    const s = readState()
    const hit = s.wrong.find((w) => w.questionId === questionId)
    if (hit) hit.mastered = mastered
    writeState(s)
    return { ok: true }
  },

  async deleteWrong(questionId: string): Promise<{ ok: boolean }> {
    await wait(120)
    const s = readState()
    s.wrong = s.wrong.filter((w) => w.questionId !== questionId)
    writeState(s)
    return { ok: true }
  },

  async overview(): Promise<OverviewStats> {
    await ensureSeed()
    await wait()
    const s = readState()
    const bank = await loadBank()
    const byTopic = TOPICS.map((t, i) => ({
      topic: t.key,
      total: [46, 40, 52, 43, 44, 43][i],
      correct: [38, 33, 39, 31, 34, 26][i],
    }))
    return {
      answered: s.answered,
      accuracy: s.answered ? Math.round((s.correct / s.answered) * 100) : 0,
      wrongCount: s.wrong.filter((w) => !w.mastered).length,
      examCount: s.exams.length,
      bestScore: s.exams.length ? Math.max(...s.exams.map((e) => e.score)) : 0,
      byTopic,
      trend: Array.from({ length: 7 }, (_, i) => ({
        date: new Date(Date.now() - (6 - i) * 86_400_000).toISOString().slice(0, 10),
        count: [12, 18, 9, 24, 31, 22, bank.length][i],
      })),
    }
  },
}
