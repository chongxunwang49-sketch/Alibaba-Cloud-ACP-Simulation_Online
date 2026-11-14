<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from './components/AppShell.vue'

// 模拟考是「全屏专注模式」，脱离控制台外壳，避免侧栏干扰计时作答。
const route = useRoute()
const standalone = computed(() => route.meta.standalone === true)
</script>

<template>
  <AppShell v-if="!standalone" />
  <RouterView v-else />
</template>
