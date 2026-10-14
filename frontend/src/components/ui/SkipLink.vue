<script setup lang="ts">
/**
 * SKIP LINK (A11Y-01) — «Перейти к содержимому».
 *
 * Первый фокусируемый элемент страницы: пока скрыт визуально (sr-only),
 * при клавиатурном фокусе раскрывается кнопкой в левом верхнем углу.
 * Чистый CSS, никакого JS — цель задаётся через href="#main-content".
 */
</script>

<template>
  <a href="#main-content" class="skip-link" data-testid="skip-link">
    Перейти к содержимому
  </a>
</template>

<style scoped>
.skip-link {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.skip-link:focus,
.skip-link:focus-visible {
  position: fixed;
  top: var(--space-2);
  left: var(--space-2);
  width: auto;
  height: auto;
  min-height: 44px;
  margin: 0;
  padding: var(--space-2) var(--space-4);
  overflow: visible;
  clip: auto;
  clip-path: none;
  white-space: normal;
  display: inline-flex;
  align-items: center;
  background: var(--bg-surface);
  color: var(--accent);
  border: 2px solid var(--accent);
  border-radius: var(--radius-md);
  font-family: var(--font-display);
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-decoration: none;
  box-shadow: var(--shadow-lg);
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  z-index: 10000;
}

.skip-link:focus:hover,
.skip-link:focus-visible:hover {
  color: var(--text-primary);
}

@media (prefers-reduced-motion: reduce) {
  .skip-link:focus,
  .skip-link:focus-visible {
    transition: none;
  }
}
</style>
