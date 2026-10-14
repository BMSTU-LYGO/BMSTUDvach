<script setup lang="ts">
/**
 * «ПОИСК СИГНАЛА» — сетевая раскадровка загрузки: пучок пиков + сканирующий
 * луч по шине узлов. Только transform/opacity, моно-подписи в токенах,
 * статичный вариант при prefers-reduced-motion.
 */
defineProps<{ label?: string }>()
</script>

<template>
  <div class="state-loading" role="status" aria-live="polite" data-testid="loading">
    <div class="scan" data-testid="state-loading">
      <span class="scan__tick scan__tick--tl" aria-hidden="true"></span>
      <span class="scan__tick scan__tick--br" aria-hidden="true"></span>

      <p class="scan__caption">SCANNING…</p>

      <div class="scan__peaks" aria-hidden="true">
        <span class="scan__peak"></span>
        <span class="scan__peak"></span>
        <span class="scan__peak"></span>
        <span class="scan__peak"></span>
        <span class="scan__peak"></span>
      </div>

      <div class="scan__bus" aria-hidden="true">
        <span class="scan__wire"></span>
        <span class="scan__node"></span>
        <span class="scan__node scan__node--mid"></span>
        <span class="scan__node scan__node--far"></span>
        <span class="scan__beam"></span>
      </div>

      <p class="scan__label">{{ label ?? 'Загрузка…' }}</p>
    </div>
  </div>
</template>

<style scoped>
.state-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-8);
}

/* === Signal frame === */
.scan {
  position: relative;
  display: grid;
  gap: var(--space-4);
  justify-items: center;
  width: 100%;
  max-width: 320px;
  padding: var(--space-5);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: 0 0 24px color-mix(in oklab, var(--accent) 10%, transparent);
}

.scan__tick {
  position: absolute;
  width: 10px;
  height: 10px;
  pointer-events: none;
}

.scan__tick--tl {
  top: -1px;
  left: -1px;
  border-top: 1px solid var(--accent);
  border-left: 1px solid var(--accent);
}

.scan__tick--br {
  right: -1px;
  bottom: -1px;
  border-right: 1px solid var(--accent);
  border-bottom: 1px solid var(--accent);
}

.scan__caption {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent);
}

/* === Peaks: amplitude of the incoming signal === */
.scan__peaks {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  height: 32px;
}

.scan__peak {
  width: 3px;
  height: 100%;
  background: var(--accent-dim);
  border-radius: 1px;
  transform: scaleY(0.3);
  animation: scan-peak 1.2s var(--ease-out-quart) infinite;
}

.scan__peak:nth-child(2) {
  animation-delay: 0.15s;
}

.scan__peak:nth-child(3) {
  animation-delay: 0.3s;
}

.scan__peak:nth-child(4) {
  animation-delay: 0.45s;
}

.scan__peak:nth-child(5) {
  animation-delay: 0.6s;
}

@keyframes scan-peak {
  0%,
  100% {
    transform: scaleY(0.25);
    opacity: 0.5;
  }
  50% {
    transform: scaleY(1);
    opacity: 1;
  }
}

/* === Bus: wire, nodes, sweeping beam === */
.scan__bus {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 10px;
}

.scan__wire {
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: 1px;
  background: var(--border-medium);
}

.scan__node {
  position: relative;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow-strong);
}

.scan__node--mid {
  background: var(--border-medium);
  box-shadow: none;
}

.scan__node--far {
  background: var(--border-medium);
  box-shadow: none;
}

.scan__beam {
  position: absolute;
  top: 50%;
  left: 0;
  width: 28px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: scan-beam 1.8s var(--ease-out-quart) infinite;
}

@keyframes scan-beam {
  0% {
    transform: translateX(-30px);
    opacity: 0;
  }
  20%,
  80% {
    opacity: 1;
  }
  100% {
    transform: translateX(280px);
    opacity: 0;
  }
}

.scan__label {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.8rem;
  color: var(--text-secondary);
}

/* === Reduced motion: static waveform, frozen beam === */
@media (prefers-reduced-motion: reduce) {
  .scan__peak {
    transform: scaleY(0.55);
    animation: none;
    opacity: 0.75;
  }

  .scan__beam {
    display: none;
  }

  .scan__node {
    box-shadow: none;
  }
}
</style>
