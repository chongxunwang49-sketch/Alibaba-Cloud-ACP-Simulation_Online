import type { QuestionType, TopicKey } from '@/types'

export const TOPIC_LABEL: Record<TopicKey, string> = {
  'app-dev': '大模型应用开发',
  prompt: '大模型提示词工程',
  rag: '大模型检索增强',
  finetune: '大模型微调',
  agent: '多 Agent 及多模态',
  prod: '生产环境应用实践',
}

export const TYPE_LABEL: Record<QuestionType, string> = {
  single: '单选题',
  multiple: '多选题',
}

export function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

export function fmtPercent(n: number): string {
  return `${Math.round(n)}%`
}

export function letterOf(index: number): string {
  return String.fromCharCode(65 + index)
}

export function sameAnswer(a: string[], b: string[]): boolean {
  return [...a].sort().join(',') === [...b].sort().join(',')
}
