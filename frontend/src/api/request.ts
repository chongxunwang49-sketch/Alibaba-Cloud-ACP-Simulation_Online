import type { ApiErrorShape } from '@/types'

/** 生产环境固定 /api，由 Nginx 反代到 127.0.0.1:3004；本地开发由 Vite 同构代理。 */
export const API_BASE = '/api'

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

const CLIENT_KEY = 'acp.clientId'

/** 后端按 clientId 隔离答题记录 / 错题本，匿名即可，无需登录。 */
export function clientId(): string {
  let id = localStorage.getItem(CLIENT_KEY)
  if (!id) {
    id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(CLIENT_KEY, id)
  }
  return id
}

interface Envelope<T> {
  data?: T
  error?: ApiErrorShape
}

export function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const usp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') usp.set(k, String(v))
  })
  const s = usp.toString()
  return s ? `?${s}` : ''
}

/**
 * 统一请求：解包 { data } / { error }，带超时与 X-Client-Id。
 * 后端约定失败响应 { "error": { "code", "message" } }。
 */
export async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': clientId(),
        ...(init.headers ?? {}),
      },
    })
    let body: Envelope<T> = {}
    try {
      body = (await res.json()) as Envelope<T>
    } catch {
      body = {}
    }
    if (!res.ok || body.error) {
      throw new ApiError(
        body.error?.code ?? `HTTP_${res.status}`,
        body.error?.message ?? `请求失败（${res.status}）`,
        res.status,
      )
    }
    return body.data as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('TIMEOUT', '请求超时，请检查网络后重试')
    }
    throw new ApiError('NETWORK', '无法连接到服务，请检查网络或稍后重试')
  } finally {
    window.clearTimeout(timer)
  }
}
