<script setup lang="ts"></script>

<template>
  <footer class="app-footer">
    <div class="footer-inner">
      <span class="footer-brand">BMSTUDvach</span>
      <span class="footer-sep">·</span>
      <span class="footer-text">форум МГТУ им. Н. Э. Баумана</span>
      <span class="footer-sep">·</span>
      <RouterLink to="/stats" class="footer-link">Статистика</RouterLink>
      <span class="footer-sep">·</span>
      <RouterLink to="/about" class="footer-link">О проекте</RouterLink>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  margin-top: auto;
  padding: var(--space-6) var(--space-4);
  border-top: 1px solid var(--rule);
  background: var(--paper-raised);
}

/* Колонка подвала — та же, что у текста страницы: тот же предел ширины
   (1000px) и те же поля, поэтому подвал не выходит за левое поле текста. */
.footer-inner {
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 var(--space-4);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  font-size: 0.875rem;
  color: var(--ink-secondary);
}

.footer-brand {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--ink);
}

.footer-sep {
  color: var(--rule);
}

.footer-link {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  color: var(--ink-secondary);
  text-decoration: none;
  transition: color var(--motion-hover);
}

.footer-link:hover {
  color: var(--accent);
}

/* Тач: цель ссылки не должна быть мельче пальца. */
@media (pointer: coarse) {
  .footer-link {
    min-height: 44px;
  }
}
</style>
