<script setup lang="ts">
import DepthCard from '@/components/ui/DepthCard.vue'
</script>

<template>
  <section class="about-page">
    <h1 class="about-title">О проекте</h1>

    <div class="about-cards">
      <DepthCard :depth="1">
        <div class="about-card-inner">
          <h3>Что это</h3>
          <p>
            BMSTUDvach — учебный форум в духе классических имиджборд для МГТУ
            им. Н. Э. Баумана. Разделы, треды, посты, вложения и жалобы —
            всё работает анонимно.
          </p>
        </div>
      </DepthCard>

      <DepthCard :depth="1">
        <div class="about-card-inner">
          <h3>Платины</h3>
          <p>
            В будущем появится раздел «Платины» — автоматически сгенерированные
            истории в тематике вуза. Архитектура для LLM-генерации уже заложена,
            используется абстрактный интерфейс генератора.
          </p>
        </div>
      </DepthCard>

      <DepthCard :depth="1">
        <div class="about-card-inner">
          <h3>Стек</h3>
          <p class="about-stack">
            <span class="stack-tag">Django 5.2</span>
            <span class="stack-tag">DRF</span>
            <span class="stack-tag">Vue 3</span>
            <span class="stack-tag">TypeScript</span>
            <span class="stack-tag">PostgreSQL</span>
            <span class="stack-tag">Docker</span>
            <span class="stack-tag">GSAP</span>
          </p>
        </div>
      </DepthCard>
    </div>
  </section>
</template>

<style scoped>
.about-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.about-title {
  font-size: clamp(1.8rem, 4vw, 2.5rem);
  color: var(--text-primary);
}

.about-cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.about-card-inner {
  padding: var(--space-6);
}

.about-card-inner h3 {
  margin-bottom: var(--space-3);
  color: var(--accent);
}

.about-card-inner p {
  color: var(--text-secondary);
  line-height: 1.7;
}

.about-stack {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.stack-tag {
  display: inline-block;
  padding: var(--space-1) var(--space-3);
  font-family: var(--font-display);
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--accent);
  background: var(--accent-glow);
  border: 1px solid var(--border-accent);
  border-radius: var(--radius-sm);
}
</style>
