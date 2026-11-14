import { onMounted, ref, type Ref } from 'vue'

/**
 * 统一异步状态机：loading → 骨架屏，error → 重试组件，data → 正常内容。
 * seq 防止快速切换筛选条件时旧请求回写覆盖新结果。
 */
export function useAsync<T>(loader: () => Promise<T>, immediate = true) {
  const data = ref<T | null>(null) as Ref<T | null>
  // immediate 时首帧就是骨架屏，避免路由切换出现一帧空白。
  const loading = ref(immediate)
  const error = ref<string | null>(null)
  let seq = 0

  async function run(): Promise<void> {
    const current = ++seq
    loading.value = true
    error.value = null
    try {
      const result = await loader()
      if (current === seq) data.value = result
    } catch (err) {
      if (current === seq) {
        error.value = err instanceof Error ? err.message : '加载失败，请稍后重试'
      }
    } finally {
      if (current === seq) loading.value = false
    }
  }

  if (immediate) onMounted(run)
  return { data, loading, error, run }
}
