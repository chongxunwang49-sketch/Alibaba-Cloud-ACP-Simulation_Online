<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { apiBase, mockMode } from '@/api'

const emit = defineEmits<{ toggleMenu: [] }>()
const route = useRoute()
const title = computed(() => (route.meta.title as string) ?? '备考控制台')
</script>

<template>
  <header class="topbar">
    <button class="btn btn--ghost btn--sm menu-toggle" type="button" aria-label="打开导航" @click="emit('toggleMenu')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>

    <div class="brand">
      <span class="brand-mark" aria-hidden="true">A</span>
      <span>
        <span class="brand-name">ACP 备考控制台</span>
        <span class="brand-sub">ALIBABA CLOUD · LLM CERTIFICATION</span>
      </span>
    </div>

    <span class="topbar-title">{{ title }}</span>
    <span class="topbar-spacer" />

    <div class="topbar-meta">
      <span v-if="mockMode" class="demo-badge" :title="`当前未连接后端，数据为本地演示样本（API 前缀 ${apiBase()}）`">
        <span class="dot" />演示数据
      </span>
      <span class="topbar-meta-text">951 道社区题库</span>
      <span class="avatar" title="匿名练习，无需登录">练</span>
    </div>
  </header>
</template>
