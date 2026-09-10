<script setup lang="ts"></script>

<template>
  <footer class="app-footer">
    <div class="footer-inner">
      <span class="footer-brand">BMSTUDvach</span>
      <span class="footer-sep">·</span>
      <span class="footer-text">форум МГТУ им. Н. Э. Баумана</span>
      <span class="footer-sep">·</span>
      <RouterLink to="/about" class="footer-link">О проекте</RouterLink>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  margin-top: auto;
  padding: var(--space-6) var(--space-4);
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-deep);
}

.footer-inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.footer-brand {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--text-secondary);
}

.footer-sep {
  color: var(--border-medium);
}

.footer-link {
  color: var(--text-muted);
  text-decoration: none;
}

.footer-link:hover {
  color: var(--accent);
}
</style>
