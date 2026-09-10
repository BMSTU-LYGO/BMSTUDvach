<script setup lang="ts">
import { onMounted } from 'vue'

import { useForumStore } from '@/stores/forum'

const store = useForumStore()

onMounted(() => {
  void store.fetchBoards()
})
</script>

<template>
  <div class="layout">
    <header class="header">
      <RouterLink to="/" class="brand">BMSTUDvach</RouterLink>
      <nav class="nav" aria-label="Разделы">
        <RouterLink
          v-for="board in store.boards.boards"
          :key="board.slug"
          :to="`/boards/${board.slug}`"
          class="nav-link"
        >
          /{{ board.slug }}/
        </RouterLink>
        <RouterLink to="/platinum" class="nav-link">/platinum/</RouterLink>
        <RouterLink to="/about" class="nav-link">/about/</RouterLink>
      </nav>
    </header>

    <main class="content">
      <RouterView />
    </main>

    <footer class="footer">BMSTUDvach · форум МГТУ им. Н. Э. Баумана</footer>
  </div>
</template>

<style scoped>
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.header {
  display: flex;
  align-items: baseline;
  gap: 1.5rem;
  padding: 0.9rem 1.2rem;
  background: #1b1b1b;
  color: #eee;
}
.brand {
  color: #fff;
  font-weight: 700;
  font-size: 1.2rem;
  text-decoration: none;
}
.nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
}
.nav-link {
  color: #bbb;
  text-decoration: none;
  font-size: 0.95rem;
}
.nav-link:hover,
.nav-link.router-link-active {
  color: #fff;
}
.content {
  flex: 1;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 1.2rem;
}
.footer {
  padding: 1rem 1.2rem;
  text-align: center;
  color: #999;
  font-size: 0.85rem;
  border-top: 1px solid #eee;
}
</style>