<script setup lang="ts">
import { useRoute } from 'vue-router'
import { TOPICS } from '@/mock'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const route = useRoute()

const groups = [
  {
    label: '备考',
    items: [
      { key: 'dashboard', label: '备考概览', to: '/' },
      { key: 'practice', label: '专项练习', to: '/practice' },
      { key: 'exam', label: '全真模拟考', to: '/exam' },
      { key: 'questions', label: '题库浏览', to: '/questions' },
    ],
  },
  {
    label: '复盘',
    items: [
      { key: 'wrong', label: '错题本', to: '/wrong' },
      { key: 'scores', label: '模拟考成绩', to: '/scores' },
    ],
  },
]

const icons: Record<string, string> = {
  dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  practice: 'M9 11l3 3 8-8M20 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  exam: 'M12 6v6l4 2M12 22a10 10 0 100-20 10 10 0 000 20z',
  questions: 'M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5v-15zM4 20.5A2.5 2.5 0 016.5 18H20v3H6.5A2.5 2.5 0 014 20.5z',
  wrong: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z',
  scores: 'M3 3v18h18M7 15l4-4 3 3 5-6',
}
</script>

<template>
  <aside class="sidebar" :class="{ 'is-open': open }">
    <div v-for="group in groups" :key="group.label">
      <div class="nav-group-label">{{ group.label }}</div>
      <nav :aria-label="group.label">
        <RouterLink
          v-for="item in group.items"
          :key="item.key"
          :to="item.to"
          class="nav-item"
          :class="{ 'is-active': route.meta.nav === item.key }"
          @click="emit('close')"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path :d="icons[item.key]" />
          </svg>
          <span>{{ item.label }}</span>
          <span v-if="item.key === 'exam'" class="nav-count">50+25</span>
        </RouterLink>
      </nav>
    </div>

    <div class="sidebar-block">
      <h3>考纲板块占比</h3>
      <div v-for="t in TOPICS" :key="t.key" class="ratio-row">
        <span class="ratio-name" :title="t.name">{{ t.name }}</span>
        <span class="ratio-value">{{ t.ratio }}%</span>
        <span class="ratio-track"><span class="ratio-fill" :style="{ width: `${t.ratio * 4}%` }" /></span>
      </div>
      <p class="hint" style="margin-top: 12px">占比来自 ACP 考纲蓝图，由 /api/meta 下发。</p>
    </div>

    <div class="sidebar-foot">
      题库来源 yi-cheng0824/aliyun-acp<br />
      仅供学习交流 · 与阿里云官方无关
    </div>
  </aside>
</template>
