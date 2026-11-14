<script setup lang="ts">
/**
 * 三态统一容器：骨架屏加载 / 空状态 / 网络错误重试。
 * 所有列表页与刷题页共用，避免每页各写一套状态分支。
 */
withDefaults(defineProps<{
  loading?: boolean
  error?: string | null
  empty?: boolean
  emptyTitle?: string
  emptyDesc?: string
  variant?: 'table' | 'card' | 'quiz'
  rows?: number
}>(), {
  loading: false, error: null, empty: false,
  emptyTitle: '暂无数据', emptyDesc: '这里还没有内容，换个筛选条件或先去做一套练习吧。',
  variant: 'table', rows: 6,
})
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <!-- 骨架屏 -->
  <div v-if="loading" class="card" aria-busy="true" aria-label="内容加载中">
    <template v-if="variant === 'quiz'">
      <div class="skeleton skeleton--title" style="width: 18%; height: 12px" />
      <div class="skeleton skeleton--title" style="width: 72%" />
      <div v-for="i in 4" :key="i" class="skeleton skeleton--option" />
      <div class="skeleton" style="width: 120px; height: 36px; margin-top: 20px" />
    </template>
    <template v-else-if="variant === 'card'">
      <div class="skeleton skeleton--title" />
      <div class="grid-cards">
        <div v-for="i in rows" :key="i" class="skeleton skeleton--card" />
      </div>
    </template>
    <template v-else>
      <div v-for="i in rows" :key="i" class="skeleton-row">
        <span class="skeleton" style="width: 8%" />
        <span class="skeleton" style="width: 46%" />
        <span class="skeleton" style="width: 14%" />
        <span class="skeleton" style="width: 12%" />
        <span class="skeleton" style="width: 10%" />
      </div>
    </template>
  </div>

  <!-- 网络错误 / 服务不可用 -->
  <div v-else-if="error" class="card state-box" role="alert">
    <div class="state-art state-art--err" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
        <path d="M12 8v5M12 17h.01" /><circle cx="12" cy="12" r="9" />
      </svg>
    </div>
    <h3 class="state-title">加载失败</h3>
    <p class="state-desc">{{ error }}</p>
    <div class="state-actions">
      <button class="btn btn--primary" type="button" @click="emit('retry')">重新加载</button>
    </div>
  </div>

  <!-- 空状态 -->
  <div v-else-if="empty" class="card state-box">
    <div class="state-art" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M8 4v16" />
      </svg>
    </div>
    <h3 class="state-title">{{ emptyTitle }}</h3>
    <p class="state-desc">{{ emptyDesc }}</p>
    <div class="state-actions"><slot name="action" /></div>
  </div>

  <slot v-else />
</template>
