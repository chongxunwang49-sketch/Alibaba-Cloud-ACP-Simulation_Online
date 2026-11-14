export type QuestionType = 'single' | 'multiple'
export type TopicKey = 'app-dev' | 'prompt' | 'rag' | 'finetune' | 'agent' | 'prod'

export interface Topic {
  key: TopicKey
  name: string
  ratio: number
}

/** 服务端下发的题目不含 answer / explanation —— 判分只在提交后返回。 */
export interface Question {
  id: string
  type: QuestionType
  topic: TopicKey
  question: string
  options: string[]
  source?: string
  sourceUrl?: string
  points?: number
}

export interface AnswerResult {
  questionId: string
  correct: boolean
  answer: string[]
  explanation: string
  topic: TopicKey
  source?: string
  sourceUrl?: string
}

export interface PracticeSet {
  setId: string
  topic: TopicKey | 'all'
  questions: Question[]
}

export interface Exam {
  examId: string
  startedAt: string
  durationSec: number
  questions: Question[]
}

export interface ExamSubmission {
  examId: string
  score: number
  correctCount: number
  wrongCount: number
  total: number
  submittedAt: string
  byTopic: Array<{ topic: TopicKey; total: number; correct: number }>
}

export interface ExamReportItem extends Question {
  selected: string[]
  correct: boolean
  answer: string[]
  explanation: string
}

export interface ExamReport {
  examId: string
  score: number
  submittedAt: string
  items: ExamReportItem[]
}

export interface ExamSummary {
  examId: string
  score: number
  correctCount: number
  total: number
  durationSec: number
  submittedAt: string
  status: 'submitted' | 'in-progress'
}

export interface WrongQuestion {
  questionId: string
  question: string
  type: QuestionType
  topic: TopicKey
  wrongCount: number
  lastWrongAt: string
  mastered: boolean
}

export interface OverviewStats {
  answered: number
  accuracy: number
  wrongCount: number
  examCount: number
  bestScore: number
  byTopic: Array<{ topic: TopicKey; total: number; correct: number }>
  trend: Array<{ date: string; count: number }>
}

export interface MetaInfo {
  bankTotal: number
  single: number
  multiple: number
  explained: number
  topics: Topic[]
  blueprint: { single: number; multiple: number }
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface ApiErrorShape {
  code: string
  message: string
}
