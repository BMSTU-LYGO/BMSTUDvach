<script setup lang="ts">
import TypewriterText from '@/components/ui/TypewriterText.vue'
import EmptyState from '@/components/EmptyState.vue'
</script>

<template>
  <section class="platinum-page">
    <div class="platinum-hero">
      <h1 class="platinum-title">
        <TypewriterText text="/platinum/" :speed="70" />
      </h1>
      <p class="platinum-desc">
        Раздел «Платины» — переработанные истории в тематике МГТУ.
        Раздел будет наполняться автоматически.
      </p>
    </div>
    <EmptyState message="Платины ещё не опубликованы. Скоро здесь появятся первые истории." />
  </section>
</template>

<style scoped>
.platinum-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.platinum-hero {
  text-align: center;
  padding: var(--space-8) 0 var(--space-4);
}

.platinum-title {
  font-size: clamp(2rem, 5vw, 3rem);
  color: var(--accent);
  margin-bottom: var(--space-4);
  text-shadow: 0 0 40px var(--accent-glow);
}

.platinum-desc {
  font-size: 1.1rem;
  color: var(--text-secondary);
  max-width: 50ch;
  margin: 0 auto;
  line-height: 1.6;
}
</style>
