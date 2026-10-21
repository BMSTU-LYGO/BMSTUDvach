<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'

import AttachmentCapsule from './AttachmentCapsule.vue'

/**
 * Cargo Rail (SIGNAL-10). Horizontal film-strip of attachments above the
 * text surface. Empty state = nothing shown.
 *
 * P3-T1a — intake is not a dropzone: the rail itself opens for the payload.
 * While files are dragged over it a thin fiber stretches along the track
 * (нити/узел растягиваются) and one socket opens per free slot, so the drop
 * has a physical place to land. A soft accent glow follows the pointer —
 * coordinates arrive as the CSS custom properties `--intake-x` /
 * `--intake-y`, written by the parent dock (or by this rail's own dragover,
 * which is what makes a bare mount — Launch Bay — behave the same way).
 */
const props = withDefaults(
  defineProps<{
    files: File[]
    maxFiles?: number
    maxSize?: number
    accepted?: string
    armed?: boolean
  }>(),
  { maxFiles: 4, maxSize: 10 * 1024 * 1024, armed: false },
)

const emit = defineEmits<{
  'update:files': [files: File[]]
  error: [message: string]
}>()

interface Reject {
  file: File
  reason: string
}
const rejects = ref<Reject[]>([])
const inputRef = ref<HTMLInputElement | null>(null)

// Arming is also self-driven: the rail shows its sockets wherever it is
// mounted, so a parent without drag wiring (Launch Bay) still gets a real
// intake instead of a bare drop target.
const hovered = ref(false)
let disarmTimer = 0

const armed = computed(() => props.armed || hovered.value)
const freeSlots = computed(() =>
  Math.max(0, props.maxFiles - props.files.length - rejects.value.length),
)

function openPicker() {
  inputRef.value?.click()
}

function accept(file: File): string | null {
  if (file.size > props.maxSize) {
    return `превышает ${(props.maxSize / (1024 * 1024)).toFixed(0)} MB`
  }
  if (props.accepted) {
    const accepted = props.accepted.split(',').map((t) => t.trim())
    const ok = accepted.some((type) => {
      if (type.endsWith('/*')) return file.type.startsWith(type.slice(0, -1))
      return file.type === type
    })
    if (!ok) return 'неподдерживаемый формат'
  }
  return null
}

function addFiles(list: File[] | FileList) {
  const next = [...props.files]
  const rejectsOut: Reject[] = []
  for (const file of Array.from(list)) {
    if (next.length >= props.maxFiles) {
      rejectsOut.push({ file, reason: 'достигнут лимит файлов' })
      continue
    }
    const why = accept(file)
    if (why) rejectsOut.push({ file, reason: why })
    else next.push(file)
  }
  if (rejectsOut.length) {
    rejects.value = rejectsOut
    emit('error', rejectsOut[0].reason)
    window.setTimeout(() => (rejects.value = []), 4000)
  }
  if (next.length !== props.files.length) emit('update:files', next)
}

function handleInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) addFiles(input.files)
  input.value = ''
}

/**
 * Magnet intake. dragover fires continuously only while the pointer moves,
 * so the armed look is held by a short timer instead of a plain boolean
 * that would flicker on the first pause.
 */
function arm(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  window.clearTimeout(disarmTimer)
  hovered.value = true
  disarmTimer = window.setTimeout(() => {
    hovered.value = false
  }, 260)

  const el = e.currentTarget as HTMLElement | null
  if (el && typeof e.clientX === 'number' && !Number.isNaN(e.clientX)) {
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--intake-x', `${Math.round(e.clientX - rect.left)}px`)
    el.style.setProperty('--intake-y', `${Math.round(e.clientY - rect.top)}px`)
  }
}

function disarm() {
  window.clearTimeout(disarmTimer)
  hovered.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  disarm()
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files)
}

function removeAt(i: number) {
  const next = [...props.files]
  next.splice(i, 1)
  emit('update:files', next)
}

function handlePaste(e: ClipboardEvent) {
  if (e.clipboardData?.files?.length) {
    addFiles(e.clipboardData.files)
  }
}

onUnmounted(() => window.clearTimeout(disarmTimer))

defineExpose({ openPicker, addFiles })
</script>

<template>
  <div
    class="cargo-rail"
    :class="{ 'cargo-rail--armed': armed }"
    data-testid="cargo-rail"
    @dragenter.prevent="arm"
    @dragover.prevent="arm"
    @dragleave="disarm"
    @drop="handleDrop"
    @paste="handlePaste"
  >
    <input
      ref="inputRef"
      type="file"
      multiple
      class="cargo-rail__input"
      :accept="accepted"
      aria-hidden="true"
      tabindex="-1"
      @change="handleInput"
    />

    <div v-if="armed || files.length || rejects.length" class="cargo-rail__track">
      <span v-if="armed" class="cargo-rail__fiber" aria-hidden="true"></span>

      <div class="cargo-rail__strip">
        <AttachmentCapsule
          v-for="(file, i) in files"
          :key="`f-${i}-${file.name}`"
          :file="file"
          @remove="removeAt(i)"
        />
        <AttachmentCapsule
          v-for="(r, i) in rejects"
          :key="`r-${i}-${r.file.name}`"
          :file="r.file"
          rejected
          :reject-reason="r.reason"
        />
        <!-- one empty socket per free slot: the drop lands in a place -->
        <template v-if="armed">
          <span
            v-for="slot in freeSlots"
            :key="`slot-${slot}`"
            class="cargo-rail__socket"
            :style="{ '--slot-index': String(slot) }"
            aria-hidden="true"
          >
            <span class="cargo-rail__socket-notch"></span>
          </span>
        </template>
      </div>

      <p v-if="armed" class="cargo-rail__magnet" aria-hidden="true">
        <span class="cargo-rail__magnet-dot"></span>
        приём открыт · свободно {{ freeSlots }} из {{ maxFiles }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.cargo-rail {
  position: relative;
}

.cargo-rail__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

/* magnet glow: pointer-follow light, position from --intake-x/--intake-y */
.cargo-rail::before {
  content: '';
  position: absolute;
  inset: -12px -8px -6px;
  pointer-events: none;
  opacity: 0;
  /* Свет магнита проявляется тихо: роль наведения (150ms). */
  transition: opacity var(--motion-hover);
  background: radial-gradient(
    190px 74px at var(--intake-x, 50%) var(--intake-y, 50%),
    color-mix(in oklab, var(--accent) 16%, transparent),
    transparent 72%
  );
}

.cargo-rail--armed::before {
  opacity: 1;
}

.cargo-rail__track {
  position: relative;
}

/* the fiber stretches across the track while the intake is open */
.cargo-rail__fiber {
  position: absolute;
  left: 0;
  right: 0;
  top: 22px;
  height: 1px;
  /* Волокно — линия, а не элемент: растёт её длина, а не сам блок. */
  transform: scaleX(0.18);
  transform-origin: left center;
  pointer-events: none;
  background: linear-gradient(
    90deg,
    color-mix(in oklab, var(--accent) 55%, transparent),
    color-mix(in oklab, var(--accent) 6%, transparent)
  );
  /* Волокно тянется от магнита: роль магнитной тяги (480ms, emphasized). */
  animation: fiber-stretch var(--motion-magnetic) forwards;
}

@keyframes fiber-stretch {
  to {
    transform: scaleX(1);
  }
}

.cargo-rail__strip {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 0;
  scrollbar-width: thin;
  position: relative;
}

.cargo-rail__strip::-webkit-scrollbar {
  height: 3px;
}

/* empty sockets — one per free slot, staggered as the rail opens */
.cargo-rail__socket {
  position: relative;
  flex: 0 0 auto;
  width: 78px;
  height: 46px;
  border: 1px solid color-mix(in oklab, var(--accent) 26%, transparent);
  background: color-mix(in oklab, var(--accent) 6%, var(--paper-raised));
  border-radius: var(--radius-md);
  /* Гнёзда открываются магнитом — та же тяга, что и у волокна. */
  animation: socket-open var(--motion-magnetic) both;
  animation-delay: calc(var(--slot-index, 1) * 45ms);
}

.cargo-rail--armed .cargo-rail__socket {
  border-color: color-mix(in oklab, var(--accent) 52%, transparent);
  background: color-mix(in oklab, var(--accent) 10%, var(--paper-raised));
}

.cargo-rail__socket-notch {
  position: absolute;
  left: 6px;
  bottom: 6px;
  width: 12px;
  height: 1px;
  background: color-mix(in oklab, var(--accent) 45%, transparent);
}

@keyframes socket-open {
  from {
    opacity: 0;
    /* Гнездо — элемент интерфейса, а не линия: оно не раскрывается
       масштабом, а приезжает с кромки и проявляется. */
    transform: translateX(-6px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* magnet caption — the rail's own wording, no dropzone overlay */
.cargo-rail__magnet {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
  padding: 0;
  font-family: var(--font-body);
  font-size: 0.64rem;
  letter-spacing: 0.04em;
  color: var(--ink-tertiary);
}

.cargo-rail__magnet-dot {
  /* Период дыхания — характер самой точки, а не «случайная» цифра:
     набрать воздух и отпустить раз в 1.6 с. Роль движения здесь не
     подходит: бесконечный цикл не «появляется» и не «реагирует». */
  --magnet-breathe-rhythm: 1.6s var(--ease-out-quart);
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  animation: magnet-breathe var(--magnet-breathe-rhythm) infinite;
}

@keyframes magnet-breathe {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cargo-rail::before {
    transition: none;
  }

  .cargo-rail__fiber,
  .cargo-rail__socket,
  .cargo-rail__magnet-dot {
    animation: none;
  }

  .cargo-rail__fiber {
    transform: scaleX(1);
  }

  .cargo-rail__socket {
    transform: scaleX(1);
  }
}
</style>
