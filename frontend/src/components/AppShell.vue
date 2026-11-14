<script setup lang="ts">
import { ref } from 'vue'
import TopBar from './TopBar.vue'
import SideBar from './SideBar.vue'

const sidebarOpen = ref(false)
</script>

<template>
  <div class="app-shell">
    <TopBar @toggle-menu="sidebarOpen = !sidebarOpen" />
    <SideBar :open="sidebarOpen" @close="sidebarOpen = false" />
    <div v-if="sidebarOpen" class="drawer-mask" @click="sidebarOpen = false" />
    <main class="workspace">
      <RouterView />
    </main>
  </div>
</template>
