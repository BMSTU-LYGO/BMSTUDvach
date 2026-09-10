<script setup lang="ts"></script>

<template>
  <section class="not-found">
    <h1 class="glitch" data-text="404">404</h1>
    <p class="not-found-text">Страница не найдена</p>
    <RouterLink to="/" class="btn btn-primary">На главную</RouterLink>
  </section>
</template>

<style scoped>
.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-6);
  min-height: 50vh;
  text-align: center;
}

.glitch {
  font-family: var(--font-display);
  font-size: clamp(5rem, 15vw, 10rem);
  font-weight: 700;
  color: var(--text-primary);
  position: relative;
}

.glitch::before,
.glitch::after {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.glitch::before {
  color: var(--accent);
  animation: glitch-1 0.8s infinite linear alternate-reverse;
  clip-path: polygon(0 0, 100% 0, 100% 35%, 0 35%);
}

.glitch::after {
  color: var(--danger);
  animation: glitch-2 0.8s infinite linear alternate-reverse;
  clip-path: polygon(0 65%, 100% 65%, 100% 100%, 0 100%);
}

@keyframes glitch-1 {
  0%, 90% { transform: translate(0); }
  92% { transform: translate(-3px, 1px); }
  94% { transform: translate(3px, -1px); }
  96% { transform: translate(-2px, 2px); }
  98% { transform: translate(2px, -2px); }
  100% { transform: translate(0); }
}

@keyframes glitch-2 {
  0%, 90% { transform: translate(0); }
  91% { transform: translate(2px, -1px); }
  93% { transform: translate(-2px, 1px); }
  95% { transform: translate(3px, 2px); }
  97% { transform: translate(-3px, -2px); }
  100% { transform: translate(0); }
}

.not-found-text {
  font-size: 1.1rem;
  color: var(--text-secondary);
  margin: 0;
}

@media (prefers-reduced-motion: reduce) {
  .glitch::before,
  .glitch::after {
    animation: none;
  }
}
</style>
