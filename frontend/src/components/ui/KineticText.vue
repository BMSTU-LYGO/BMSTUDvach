<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { gsap, prefersReducedMotion } from '@/composables/useGsap'

/**
 * Кинетическая типографика как МАСКА, а не как «эффект ради эффекта».
 *
 * Строка или слово выезжает из-под бумажной маски (overflow: hidden + сдвиг),
 * потому что так ведёт себя лист: текст проявляется из-за края, а не вспыхивает.
 *
 * Ограничения по художественному закону проекта: таких мест в приложении не больше трёх,
 * а у каждого движущегося элемента есть статичный эквивалент (финальный кадр) —
 * поэтому в статике здесь нет ни opacity: 0, ни transform: текст остаётся обычным.
 */

/** Насколько глубоко кусок уходит под маску: с запасом на выносные элементы строки. */
const HIDDEN_OFFSET = 110

const props = withDefaults(
  defineProps<{
    /** Текст целиком: он же уходит в aria-label, чтобы скринридер прочитал его один раз. */
    text: string
    /** Разбивка: построчно (переносы) или по словам (пробелы). */
    mode?: 'lines' | 'words'
    /** Задержка перед стартом — чтобы встать в общий ритм сцены. */
    delay?: number
    /** Пауза между кусками: ритм задаёт шаг, а не длительность. */
    stagger?: number
    /** Кривая движения: по умолчанию вход (долгий разгон, уверенный финал). */
    ease?: string
    /** Тег корня: заголовок или span внутри готовой строки. */
    as?: string
    /** Длительность одного куска. */
    duration?: number
  }>(),
  {
    mode: 'lines',
    delay: 0,
    ease: 'expo.out',
    as: 'span',
    duration: 0.6,
  },
)

interface Piece {
  key: string
  text: string
  separator: string
}

const rootRef = ref<HTMLElement | null>(null)

/**
 * Разбивка детерминированная: измерений в рантайме нет, поэтому текст не «прыгает»
 * между рендерами, одинаково ведёт себя в тестах и не требует пересчёта при ресайзе.
 */
const pieces = computed<Piece[]>(() => {
  const source = (props.text ?? '').replace(/\r\n/g, '\n')

  if (props.mode === 'words') {
    // Разделители сохраняем как есть: иначе текст в DOM отличается от исходного.
    const chunks = source.split(/(\s+)/)
    const words: Piece[] = []
    for (let i = 0; i < chunks.length; i += 2) {
      const word = chunks[i]
      if (!word) continue
      words.push({ key: `${i}:${word}`, text: word, separator: chunks[i + 1] ?? '' })
    }
    return words
  }

  const lines = source.split('\n')
  return lines.map((line, index) => ({
    key: `${index}:${line}`,
    text: line,
    separator: index < lines.length - 1 ? '\n' : '',
  }))
})

/** Ритм по умолчанию: слова идут плотно (шаг кинетики), строки — чуть свободнее. */
const stagger = computed(() => props.stagger ?? (props.mode === 'words' ? 0.028 : 0.06))

/**
 * Теги, чья роль умеет носить имя (`aria-label`): заголовок, ссылка, кнопка.
 * Для них скрытая копия текста была бы вторым чтением — она не нужна.
 */
const NAME_CARRIERS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'button'])

/**
 * Нужна ли скрытая копия текста.
 *
 * По правилам ARIA имя автора запрещено для «безымянных» ролей: у `<p>`
 * (paragraph) и `<span>` (generic) браузер обязан игнорировать `aria-label`.
 * Если при этом доли текста ещё и скрыты от скринридера, строка не читается
 * вообще — она молча пропадает из accessibility-дерева.
 *
 * Поэтому для таких тегов текст отдаётся отдельной скрытой копией, а доли
 * остаются `aria-hidden`: читается ровно один раз, и уже точно.
 */
const needsHiddenCopy = computed(() => !NAME_CARRIERS.has(props.as.toLowerCase()))

let ctx: gsap.Context | null = null
let observer: IntersectionObserver | null = null
let frameId = 0
let revealed = false

/** Текст уже в зоне видимости? Тогда стартуем сразу — до первой отрисовки. */
function isInViewport(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.height === 0 || rect.width === 0) return false
  return rect.top < window.innerHeight && rect.bottom > 0
}

function reveal() {
  if (revealed) return
  revealed = true
  observer?.disconnect()
  observer = null
  if (frameId) {
    cancelAnimationFrame(frameId)
    frameId = 0
  }

  const root = rootRef.value
  if (!root) return
  const targets = Array.from(
    root.querySelectorAll<HTMLElement>('[data-testid="kinetic-piece"]'),
  )
  if (targets.length === 0) return

  ctx = gsap.context(() => {
    // fromTo, а не from: стартовое состояние задаётся здесь же, поэтому до старта
    // анимации текст остаётся обычным (финальный кадр) и не мигает.
    gsap.fromTo(
      targets,
      { yPercent: HIDDEN_OFFSET },
      {
        yPercent: 0,
        duration: props.duration,
        delay: props.delay,
        stagger: stagger.value,
        ease: props.ease,
        overwrite: true,
      },
    )
  }, root)
}

onMounted(() => {
  // Reduced motion: текст виден сразу, GSAP не трогает DOM вовсе.
  if (prefersReducedMotion()) return
  const root = rootRef.value
  if (!root) return

  if (isInViewport(root)) {
    reveal()
    return
  }

  if (typeof IntersectionObserver === 'undefined') {
    // Наблюдателя нет — показываем в следующем кадре, иначе текст останется «сырым».
    frameId = requestAnimationFrame(() => reveal())
    return
  }

  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) reveal()
    },
    { threshold: 0.01 },
  )
  observer.observe(root)
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
  if (frameId) cancelAnimationFrame(frameId)
  frameId = 0
  ctx?.revert()
  ctx = null
})
</script>

<template>
  <component
    :is="as"
    ref="rootRef"
    class="kinetic-text"
    :class="`kinetic-text--${mode}`"
    :aria-label="text"
    data-testid="kinetic-text"
  >
    <!-- Скрытая копия текста: её читает скринридер, глаз не видит. Нужна
         только тем тегам, чья роль не умеет носить имя (см. needsHiddenCopy). -->
    <span v-if="needsHiddenCopy" class="kinetic-text__sr">{{ text }}</span>
    <template v-for="piece in pieces" :key="piece.key">
      <span class="kinetic-text__mask" aria-hidden="true" data-testid="kinetic-mask">
        <span
          class="kinetic-text__piece"
          aria-hidden="true"
          data-testid="kinetic-piece"
          >{{ piece.text }}</span
        >
      </span>
      <span
        v-if="piece.separator"
        class="kinetic-text__sep"
        aria-hidden="true"
        data-testid="kinetic-separator"
        >{{ piece.separator }}</span
      >
    </template>
  </component>
</template>

<style scoped>
.kinetic-text {
  /* Финальный кадр = обычный текст: ни opacity, ни сдвига в статике. */
  font: inherit;
  letter-spacing: inherit;
  color: inherit;
}

.kinetic-text--lines {
  display: block;
}

.kinetic-text--words {
  display: inline-block;
}

/* Скрытая копия текста: скринридер её читает, глаз — нет. Копия не влияет на
   вёрстку (position: absolute выносит её из потока), поэтому разбивка и
   маска остаются ровно такими же. */
.kinetic-text__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* Маска: строка или слово выезжает из-под неё, а не проявляется. */
.kinetic-text__mask {
  display: inline-block;
  overflow: hidden;
  /* У маски с обрезкой нет базовой линии по тексту — выравниваем её по нижнему
     краю, иначе слова внутри маски поднялись бы на высоту строки. */
  vertical-align: bottom;
}

.kinetic-text--lines .kinetic-text__mask {
  display: block;
  vertical-align: baseline;
}

.kinetic-text__piece {
  display: inline-block;
  white-space: pre;
}

.kinetic-text--lines .kinetic-text__piece {
  display: block;
  white-space: pre-wrap;
}

.kinetic-text__sep {
  display: inline;
}

/* Перенос между строками остаётся в DOM (текст цельный для скринридера и
   копирования), но в вёрстке он не должен давать лишнюю пустую строку. */
.kinetic-text--lines .kinetic-text__sep {
  display: none;
}
</style>
