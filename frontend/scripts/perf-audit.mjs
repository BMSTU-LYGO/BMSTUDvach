#!/usr/bin/env node
/**
 * perf-audit — перф-проба BMSTUDvach в РЕАЛЬНОМ браузере.
 *
 * Что он измеряет и почему:
 *   — FPS и frame-time в реальном времени (окно ≥ 3 с на маршрут): rAF в
 *     странице, дельты между кадрами, p50/p95/max и доля кадров длиннее
 *     33 мс (просадки);
 *   — «первый содержательный кадр»: момент, когда в DOM появился корень
 *     вью, и FCP;
 *   — память: `performance.memory.usedJSHeapSize` с принудительным GC
 *     перед снимком — иначе в куче лежит мусор от прошлого кадра и
 *     «утечка» не отличить от шума;
 *   — WebGL: renderer/версия/DPR через `WEBGL_debug_renderer_info` и
 *     счётчики вызовов, снятые перехватом методов контекста
 *     (drawElements/drawArrays/createTexture/createBuffer/createProgram…);
 *   — утечки 3D: повторяющийся обход «маршрут → назад» и сравнение
 *     счётчиков и heap «было → стало».
 *
 * ГЛАВНАЯ ОГОВОРКА (она же в отчёте): headless-Chrome рендерит через
 * SwiftShader — программный растеризатор. Абсолютные FPS на нём НЕ
 * показательны для реального железа. Ценность пробы — в относительных
 * величинах: стабильность кадров, отсутствие провалов, отсутствие роста
 * памяти и WebGL-ресурсов при повторной навигации.
 *
 * Приложение не трогается: инструмент живёт целиком в `scripts/`.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  API_PATTERN,
  VIEWPORTS,
  CdpClient,
  attachFetchInterceptor,
  createTarget,
  evaluate,
  findChrome,
  launchChrome,
  navigate,
  sleep,
  startAppServer,
  stopAppServer,
  stopChrome,
} from './cdp.mjs'
import { fixturesFor } from './qa-fixtures.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..') // frontend/

/** Маршруты по умолчанию: главная, архив платинума и раздел. */
const DEFAULT_ROUTES = ['/', '/platinum', '/boards/general']

/** Минимальное окно измерения кадров, мс (меньше — слишком шумно). */
const MIN_MEASURE_MS = 3000

/**
 * Код, который выполняется в каждом новом документе ДО отрисовки
 * приложения. Он ничего не знает о проекте и не меняет его поведение —
 * только считает.
 *
 * Считает:
 *   — первый содержательный кадр (появился корень вью с ненулевым размером);
 *   — окно кадров: дельты между rAF, p50/p95/max, доля кадров > 33 мс;
 *   — сколько кадров реально отрисовывали 3D (кадры с draw-call'ами) —
 *     это отличает «страница тикает» от «сцена рисует»;
 *   — WebGL: число контекстов, draw-call'ы, создание/удаление текстур,
 *     буферов, программ, шейдеров, FBO, VAO;
 *   — renderer/версия/язык шейдеров — один раз, при первом контексте
 *     (строки, а не ссылки на контекст: держать контекст силой нельзя,
 *     иначе мы бы сами мешали освобождать ресурсы и врали бы про утечки).
 */
export const PAGE_INSTRUMENT = `
(() => {
  try {    const CONTENT_SELECTORS = [
      '.home',
      '.board-page',
      '.thread-page',
      '.platinum-page',
      '.story-frame',
      '.about-page',
      '.stats',
      '.console',
      '.lost-node',
      '[data-testid="platinum-story"]',
      'main#main-content > *',
    ]
    const DEADLINE_MS = 3000

    const state = {
      firstContentMs: null,
      firstContentSelector: null,
      firstContentLateMs: null,
      // Счётчик изменений DOM: по нему видно, что вью реально
      // перерисовалась, а не только сменился адрес в строке.
      domMutations: 0,
    }

    const gl = {
      contextsCreated: 0,
      getContextCalls: 0,
      canvasesDetached: 0,
      draws: { total: 0, elements: 0, arrays: 0, elementsInstanced: 0, arraysInstanced: 0 },
      textures: { created: 0, deleted: 0, uploads: 0 },
      buffers: { created: 0, deleted: 0 },
      programs: { created: 0, deleted: 0 },
      shaders: { created: 0, deleted: 0 },
      framebuffers: { created: 0, deleted: 0 },
      renderbuffers: { created: 0, deleted: 0 },
      vaos: { created: 0, deleted: 0 },
      renderer: null,
      // Сколько draw-call'ов сделал каждый холст: контекст без единого
      // draw-call — это сцена, которая создана, но не рисуется.
      perCanvas: {},
    }

    window.__qa = state
    window.__qaGl = gl

    const GL_METHODS = [
      ['drawElements', 'draws', 'elements'],
      ['drawArrays', 'draws', 'arrays'],
      ['drawElementsInstanced', 'draws', 'elementsInstanced'],
      ['drawArraysInstanced', 'draws', 'arraysInstanced'],
      ['createTexture', 'textures', 'created'],
      ['deleteTexture', 'textures', 'deleted'],
      ['texImage2D', 'textures', 'uploads'],
      ['texStorage2D', 'textures', 'uploads'],
      ['createBuffer', 'buffers', 'created'],
      ['deleteBuffer', 'buffers', 'deleted'],
      ['createProgram', 'programs', 'created'],
      ['deleteProgram', 'programs', 'deleted'],
      ['createShader', 'shaders', 'created'],
      ['deleteShader', 'shaders', 'deleted'],
      ['createFramebuffer', 'framebuffers', 'created'],
      ['deleteFramebuffer', 'framebuffers', 'deleted'],
      ['createRenderbuffer', 'renderbuffers', 'created'],
      ['deleteRenderbuffer', 'renderbuffers', 'deleted'],
      ['createVertexArray', 'vaos', 'created'],
      ['deleteVertexArray', 'vaos', 'deleted'],
    ]

    const trackedContexts = new WeakSet()
    const contextCanvases = new WeakSet()
    const canvasOfContext = new WeakMap()

    /** Имя холста для отчёта: первый класс — узнаваемо и стабильно. */
    function canvasKey(canvas) {
      if (!canvas) return 'unknown'
      const first = String(canvas.className || '').trim().split(/\\s+/)[0]
      return first || 'canvas'
    }

    /** Счётчик холста: его создание, его draw-call'ы, его ресурсы. */
    function canvasStats(canvas) {
      const key = canvasKey(canvas)
      if (!gl.perCanvas[key]) {
        gl.perCanvas[key] = { contexts: 0, draws: 0, texturesCreated: 0, buffersCreated: 0, programsCreated: 0 }
      }
      return gl.perCanvas[key]
    }

    // Методы переопределяются НА ЭКЗЕМПЛЯРЕ контекста: так считаются
    // ровно те вызовы, что делает приложение, и ничьи больше.
    function wrapContext(ctx, canvas) {
      const stats = canvasStats(canvas)
      for (let i = 0; i < GL_METHODS.length; i += 1) {
        const name = GL_METHODS[i][0]
        const group = GL_METHODS[i][1]
        const field = GL_METHODS[i][2]
        const original = ctx[name]
        if (typeof original !== 'function') continue
        try {
          Object.defineProperty(ctx, name, {
            configurable: true,
            writable: true,
            value: function () {
              gl[group][field] += 1
              if (group === 'draws') {
                gl.draws.total += 1
                stats.draws += 1
              } else if (group === 'textures' && field === 'created') {
                stats.texturesCreated += 1
              } else if (group === 'buffers' && field === 'created') {
                stats.buffersCreated += 1
              } else if (group === 'programs' && field === 'created') {
                stats.programsCreated += 1
              }
              return original.apply(this, arguments)
            },
          })
        } catch (error) {
          /* контекст не даёт переопределить метод — считаем, что не смогли */
        }
      }
    }

    function captureRendererInfo(ctx) {
      try {
        const ext = ctx.getExtension('WEBGL_debug_renderer_info')
        gl.renderer = {
          version: String(ctx.getParameter(ctx.VERSION)),
          shadingLanguage: String(ctx.getParameter(ctx.SHADING_LANGUAGE_VERSION)),
          vendor: String(ctx.getParameter(ctx.VENDOR)),
          unmaskedVendor: ext ? String(ctx.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : null,
          unmaskedRenderer: ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null,
        }
      } catch (error) {
        gl.renderer = { error: String(error) }
      }
    }

    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type) {
      const key = String(type || '').toLowerCase()
      const ctx = originalGetContext.apply(this, arguments)
      if (ctx && (key === 'webgl' || key === 'webgl2' || key === 'experimental-webgl')) {
        gl.getContextCalls += 1
        if (!trackedContexts.has(ctx)) {
          trackedContexts.add(ctx)
          gl.contextsCreated += 1
          contextCanvases.add(this)
          canvasOfContext.set(ctx, this)
          canvasStats(this).contexts += 1
          wrapContext(ctx, this)
          if (!gl.renderer) captureRendererInfo(ctx)
        }
      }
      return ctx
    }

    // Канвас, убранный из DOM, — это освобождённый слот контекста:
    // приложение сняло сцену. Считаем такие отдельно, иначе «число
    // контекстов» росло бы только из-за того, что мы их насчитали.
    function observeDetachedCanvases() {
      const observer = new MutationObserver((records) => {
        for (let r = 0; r < records.length; r += 1) {
          const removed = records[r].removedNodes
          for (let n = 0; n < removed.length; n += 1) {
            const node = removed[n]
            if (!node || node.nodeType !== 1) continue
            const list = []
            if (node.tagName === 'CANVAS') list.push(node)
            if (typeof node.querySelectorAll === 'function') {
              const nested = node.querySelectorAll('canvas')
              for (let c = 0; c < nested.length; c += 1) list.push(nested[c])
            }
            for (let c = 0; c < list.length; c += 1) {
              if (contextCanvases.has(list[c])) gl.canvasesDetached += 1
            }
          }
        }
      })
      try {
        observer.observe(document.documentElement || document, {
          childList: true,
          subtree: true,
        })
      } catch (error) {
        /* нет корня — попробуем позже */
      }
    }

    function findContent() {
      for (let i = 0; i < CONTENT_SELECTORS.length; i += 1) {
        const selector = CONTENT_SELECTORS[i]
        let node = null
        try {
          node = document.querySelector(selector)
        } catch (error) {
          continue
        }
        if (!node) continue
        const rect = node.getBoundingClientRect()
        if (!(rect.width > 0 && rect.height > 0)) continue
        return selector
      }
      return null
    }

    function checkContent() {
      if (state.firstContentMs !== null || state.firstContentLateMs !== null) return
      const selector = findContent()
      if (!selector) return
      const at = performance.now()
      if (at <= DEADLINE_MS) {
        state.firstContentMs = at
        state.firstContentSelector = selector
      } else {
        state.firstContentLateMs = at
        state.firstContentSelector = selector
      }
    }

    function startObservers() {
      observeDetachedCanvases()
      try {
        const observer = new MutationObserver(checkContent)
        observer.observe(document.documentElement || document, {
          childList: true,
          subtree: true,
        })
      } catch (error) {
        /* нет корня — подождём следующий тик */
      }
      try {
        const mutObserver = new MutationObserver(() => {
          state.domMutations += 1
        })
        mutObserver.observe(document.body || document.documentElement || document, {
          childList: true,
          subtree: true,
          characterData: true,
        })
      } catch (error) {
        /* без счётчика переходы придётся проверять по заголовку */
      }
      checkContent()
    }

    if (document.documentElement) startObservers()
    else document.addEventListener('DOMContentLoaded', startObservers, { once: true })

    const contentTimer = setInterval(() => {
      checkContent()
      if (state.firstContentMs !== null || state.firstContentLateMs !== null) {
        clearInterval(contentTimer)
      }
    }, 50)
    setTimeout(() => clearInterval(contentTimer), DEADLINE_MS + 1000)

    // Окно кадров. Считаем дельты между rAF — это и есть frame-time.
    window.__qaPerf = {
      sample: function (ms) {
        return new Promise(function (resolve) {
          const deltas = []
          const drawStart = gl.draws.total
          let last = 0
          let prevDraws = drawStart
          let renderedTicks = 0
          let firstFrameDelayMs = null
          const started = performance.now()
          let done = false

          const finish = function (now, stalled) {
            if (done) return
            done = true
            clearTimeout(watchdog)
            const duration = Math.max(0, now - started)
            const sorted = deltas.slice().sort(function (a, b) { return a - b })
            const pick = function (p) {
              if (!sorted.length) return null
              const index = Math.min(
                sorted.length - 1,
                Math.max(0, Math.ceil(p * sorted.length) - 1),
              )
              return Math.round(sorted[index] * 10) / 10
            }
            let sum = 0
            let over33 = 0
            let over100 = 0
            for (let i = 0; i < deltas.length; i += 1) {
              sum += deltas[i]
              if (deltas[i] > 33) over33 += 1
              if (deltas[i] > 100) over100 += 1
            }
            resolve({
              frames: deltas.length + 1,
              samples: deltas.length,
              durationMs: Math.round(duration),
              fps: duration > 0 ? Math.round((deltas.length / duration) * 10000) / 10 : 0,
              renderedFps:
                duration > 0 ? Math.round((renderedTicks / duration) * 10000) / 10 : 0,
              renderedFrames: renderedTicks,
              meanFrameMs: deltas.length ? Math.round((sum / deltas.length) * 10) / 10 : null,
              p50FrameMs: pick(0.5),
              p95FrameMs: pick(0.95),
              maxFrameMs: sorted.length
                ? Math.round(sorted[sorted.length - 1] * 10) / 10
                : null,
              over33Ratio: deltas.length ? Math.round((over33 / deltas.length) * 1000) / 1000 : 0,
              over100Ratio: deltas.length
                ? Math.round((over100 / deltas.length) * 1000) / 1000
                : 0,
              firstFrameDelayMs:
                firstFrameDelayMs === null ? null : Math.round(firstFrameDelayMs),
              drawCalls: gl.draws.total - drawStart,
              stalled: !!stalled,
            })
          }

          const watchdog = setTimeout(function () {
            finish(performance.now(), true)
          }, ms + 3000)

          const tick = function (now) {
            if (done) return
            const drawsNow = gl.draws.total
            if (last === 0) {
              firstFrameDelayMs = Math.max(0, now - started)
            } else {
              deltas.push(now - last)
              if (drawsNow > prevDraws) renderedTicks += 1
            }
            prevDraws = drawsNow
            last = now
            if (now - started >= ms) {
              finish(now, false)
              return
            }
            requestAnimationFrame(tick)
          }

          requestAnimationFrame(tick)
        })
      },
    }

    // Снимок heap с принудительным GC: без него снимок отражает мусор
    // предыдущих кадров, а не «занятую» приложением память.
    window.__qaHeap = function () {
      let forcedGc = false
      try {
        if (typeof window.gc === 'function') {
          window.gc()
          window.gc()
          forcedGc = true
        }
      } catch (error) {
        /* gc недоступен — снимок будет с шумом */
      }
      const mem = performance.memory
      return {
        forcedGc: forcedGc,
        usedJSHeapSize: mem ? mem.usedJSHeapSize : null,
        totalJSHeapSize: mem ? mem.totalJSHeapSize : null,
        jsHeapSizeLimit: mem ? mem.jsHeapSizeLimit : null,
        totalJSHeapSizeLimit: mem ? (mem.totalJSHeapSizeLimit ?? null) : null,
      }
    }

    window.__qaSnapshot = function () {
      const canvases = []
      const list = document.querySelectorAll('canvas')
      for (let i = 0; i < list.length; i += 1) {
        const c = list[i]
        canvases.push({
          cls: String(c.className || '').trim().split(/\\s+/)[0] || 'canvas',
          hidden: c.classList.contains('hidden'),
          width: c.width,
          height: c.height,
          clientWidth: c.clientWidth,
          clientHeight: c.clientHeight,
          effectiveDpr: c.clientWidth
            ? Math.round((c.width / c.clientWidth) * 100) / 100
            : null,
        })
      }
      const paints = {}
      const paintEntries = performance.getEntriesByType('paint')
      for (let i = 0; i < paintEntries.length; i += 1) {
        paints[paintEntries[i].name] = Math.round(paintEntries[i].startTime)
      }
      return {
        href: location.href,
        pathname: location.pathname,
        title: document.title,
        dpr: window.devicePixelRatio,
        heap: window.__qaHeap(),
        gl: JSON.parse(JSON.stringify(gl)),
        canvases: canvases,
        // 3D выключен: приложение само снизило качество (деградация по
        // FPS) или пользователь выбрал «off» — тогда на странице вместо
        // сцены CSS-фолбэк или 2D-частицы.
        threeDDisabled:
          canvases.some((item) => item.hidden) ||
          !!document.querySelector('.particle-field'),
        paints: paints,
        qa: {
          firstContentMs: state.firstContentMs,
          firstContentSelector: state.firstContentSelector,
          firstContentLateMs: state.firstContentLateMs,
          domMutations: state.domMutations,
        },
      }
    }

    // Клиентская навигация без перезагрузки документа: так куча и счётчики
    // WebGL переживают переход между маршрутами, и рост памяти виден.
    window.__qaNav = {
      go: function (path, timeoutMs) {
        const limit = timeoutMs || 6000
        return new Promise(function (resolve) {
          const beforeTitle = document.title
          const beforeMutations = state.domMutations
          const started = performance.now()
          const previous = history.state || {}
          const next = {}
          for (const key in previous) {
            if (Object.prototype.hasOwnProperty.call(previous, key)) next[key] = previous[key]
          }
          next.position = Number(previous.position || 0) + 1
          try {
            history.pushState(next, '', path)
            window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
          } catch (error) {
            resolve({ ok: false, error: String(error), pathname: location.pathname })
            return
          }
          const check = function () {
            const elapsed = performance.now() - started
            const pathOk = location.pathname === path
            const titleChanged = document.title !== beforeTitle
            const mutated = state.domMutations > beforeMutations
            // Адрес меняется мгновенно (pushState), поэтому одного пути
            // мало: вью должна ещё и перерисоваться (мутации DOM) либо
            // сменить заголовок. Иначе переход «уехал», а страница —
            // нет, и замер продолжал бы считать чужую сцену.
            if (pathOk && (mutated || titleChanged)) {
              resolve({
                ok: true,
                titleChanged: titleChanged,
                mutated: mutated,
                ms: Math.round(elapsed),
                pathname: location.pathname,
              })
              return
            }
            if (elapsed > limit) {
              resolve({
                ok: false,
                titleChanged: titleChanged,
                mutated: mutated,
                ms: Math.round(elapsed),
                pathname: location.pathname,
              })
              return
            }
            setTimeout(check, 40)
          }
          check()
        })
      },
    }
  } catch (error) {
    window.__qaError = String(error)
  }
})()
`

/* ==== Отчётные утилиты ================================================= */

/** Округление или null. */
function round(value, digits = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** Разность двух снимков счётчиков: что добавилось за окно. */
function diffCounters(before, after) {
  const pick = (group, field) => {
    const a = before?.[group]?.[field] ?? 0
    const b = after?.[group]?.[field] ?? 0
    return b - a
  }
  return {
    draws: pick('draws', 'total'),
    drawElements: pick('draws', 'elements'),
    drawArrays: pick('draws', 'arrays'),
    drawElementsInstanced: pick('draws', 'elementsInstanced'),
    drawArraysInstanced: pick('draws', 'arraysInstanced'),
    texturesCreated: pick('textures', 'created'),
    texturesDeleted: pick('textures', 'deleted'),
    buffersCreated: pick('buffers', 'created'),
    buffersDeleted: pick('buffers', 'deleted'),
    programsCreated: pick('programs', 'created'),
    programsDeleted: pick('programs', 'deleted'),
    shadersCreated: pick('shaders', 'created'),
    shadersDeleted: pick('shaders', 'deleted'),
    framebuffersCreated: pick('framebuffers', 'created'),
    framebuffersDeleted: pick('framebuffers', 'deleted'),
    renderbuffersCreated: pick('renderbuffers', 'created'),
    renderbuffersDeleted: pick('renderbuffers', 'deleted'),
    vaosCreated: pick('vaos', 'created'),
    vaosDeleted: pick('vaos', 'deleted'),
    contextsCreated: (after?.contextsCreated ?? 0) - (before?.contextsCreated ?? 0),
    canvasesDetached: (after?.canvasesDetached ?? 0) - (before?.canvasesDetached ?? 0),
  }
}

/**
 * «Живые» WebGL-ресурсы: создано минус удалено.
 *
 * Именно эта величина отвечает на вопрос про утечку: если сцена
 * освобождает ресурсы, создание и удаление идут в паре и «нетто» не
 * растёт от цикла к циклу.
 */
function netResources(gl) {
  const net = (created, deleted) => (created ?? 0) - (deleted ?? 0)
  return {
    texturesNet: net(gl?.textures?.created, gl?.textures?.deleted),
    buffersNet: net(gl?.buffers?.created, gl?.buffers?.deleted),
    programsNet: net(gl?.programs?.created, gl?.programs?.deleted),
    shadersNet: net(gl?.shaders?.created, gl?.shaders?.deleted),
    framebuffersNet: net(gl?.framebuffers?.created, gl?.framebuffers?.deleted),
    vaosNet: net(gl?.vaos?.created, gl?.vaos?.deleted),
    contextsLive:
      (gl?.contextsCreated ?? 0) - (gl?.canvasesDetached ?? 0),
  }
}

/** Свёртка счётчиков в компактный вид для отчёта. */
function glSummary(gl) {
  const net = netResources(gl)
  const perCanvas = {}
  for (const [key, value] of Object.entries(gl?.perCanvas ?? {})) {
    perCanvas[key] = {
      contexts: value.contexts ?? 0,
      draws: value.draws ?? 0,
      texturesCreated: value.texturesCreated ?? 0,
      buffersCreated: value.buffersCreated ?? 0,
      programsCreated: value.programsCreated ?? 0,
    }
  }
  // Холст с контекстом, но без единого draw-call — это сцена, которая
  // создана и оплачивает кадр, но ничего не рисует.
  const silentCanvases = Object.entries(perCanvas)
    .filter(([, value]) => value.contexts > 0 && value.draws === 0)
    .map(([key]) => key)
  return {
    contextsCreated: gl?.contextsCreated ?? 0,
    getContextCalls: gl?.getContextCalls ?? 0,
    canvasesDetached: gl?.canvasesDetached ?? 0,
    contextsLive: net.contextsLive,
    draws: gl?.draws?.total ?? 0,
    drawElements: gl?.draws?.elements ?? 0,
    drawArrays: gl?.draws?.arrays ?? 0,
    texturesCreated: gl?.textures?.created ?? 0,
    texturesDeleted: gl?.textures?.deleted ?? 0,
    texturesNet: net.texturesNet,
    buffersCreated: gl?.buffers?.created ?? 0,
    buffersDeleted: gl?.buffers?.deleted ?? 0,
    buffersNet: net.buffersNet,
    programsCreated: gl?.programs?.created ?? 0,
    programsDeleted: gl?.programs?.deleted ?? 0,
    programsNet: net.programsNet,
    shadersCreated: gl?.shaders?.created ?? 0,
    shadersDeleted: gl?.shaders?.deleted ?? 0,
    shadersNet: net.shadersNet,
    framebuffersNet: net.framebuffersNet,
    vaosNet: net.vaosNet,
    perCanvas,
    silentCanvases,
    renderer: gl?.renderer ?? null,
  }
}

/* ==== Замер ============================================================= */

/** Применить вьюпорт к вкладке. */
async function applyViewport(client, viewportName) {
  const viewport = VIEWPORTS[viewportName]
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
  })
  try {
    await client.send('Emulation.setTouchEmulationEnabled', {
      enabled: viewport.mobile,
      maxTouchPoints: viewport.mobile ? 5 : 0,
    })
  } catch {
    /* тач-эмуляция не обязательна */
  }
}

/** Снимок состояния страницы (heap + счётчики + холст). */
async function snapshot(client) {
  const value = await evaluate(client, 'window.__qaSnapshot ? window.__qaSnapshot() : null')
  return value ?? {}
}

/**
 * Замерить один маршрут: полная загрузка документа, прогрев, окно кадров.
 *
 * Полная перезагрузка здесь — осознанно: для FPS важна честная «холодная»
 * страница (сборка сцены, компиляция шейдеров), а для счётчиков WebGL —
 * что они считаются с нуля документа.
 */
async function measureRoute(client, state, route, viewportName) {
  const record = {
    route,
    viewport: viewportName,
    mode: state.mode,
    firstContentMs: null,
    firstContentSelector: null,
    firstContentfulPaintMs: null,
    frames: null,
    windowDelta: null,
    heap: null,
    gl: null,
    renderer: null,
    canvases: [],
    dpr: null,
    consoleErrors: [],
    pageErrors: [],
    notes: [],
  }

  state.current = record
  try {
    await navigate(client, `${state.baseUrl}${route}`)
    await sleep(state.warmup)

    const before = await snapshot(client)
    const frames = await evaluate(
      client,
      `window.__qaPerf ? window.__qaPerf.sample(${state.measure}) : null`,
      { awaitPromise: true, timeoutMs: state.measure + 20000 },
    )
    const after = await snapshot(client)

    record.frames = frames
    record.windowDelta = diffCounters(before.gl, after.gl)
    record.heap = after.heap ?? before.heap ?? null
    record.gl = glSummary(after.gl)
    record.renderer = after.gl?.renderer ?? before.gl?.renderer ?? null
    record.canvases = after.canvases ?? []
    record.dpr = after.dpr ?? null
    record.threeDDisabled = after.threeDDisabled ?? false
    record.firstContentMs = after.qa?.firstContentMs ?? before.qa?.firstContentMs ?? null
    record.firstContentSelector =
      after.qa?.firstContentSelector ?? before.qa?.firstContentSelector ?? null
    record.firstContentfulPaintMs = after.paints?.['first-contentful-paint'] ?? null
    record.firstContentMs =
      typeof record.firstContentMs === 'number' ? round(record.firstContentMs, 1) : null
    record.firstContentfulPaintMs =
      typeof record.firstContentfulPaintMs === 'number'
        ? round(record.firstContentfulPaintMs, 1)
        : null
    if (frames?.stalled) {
      record.notes.push('Окно кадров не завершилось: rAF встал (страница без кадров).')
    }
  } catch (error) {
    record.notes.push(`Замер не удался: ${error.message}`)
  } finally {
    state.current = null
  }

  return record
}

/**
 * Клиентский переход между маршрутами без перезагрузки документа.
 *
 * Если SPA-переход не сработал (роутер не отреагировал на popstate) —
 * делаем обычную перезагрузку и честно помечаем это в отчёте: счётчики
 * WebGL тогда обнуляются и сравнение «было/стало» теряет смысл.
 */
async function navigateInApp(client, state, route) {
  const result = await evaluate(
    client,
    `window.__qaNav ? window.__qaNav.go(${JSON.stringify(route)}) : null`,
    { awaitPromise: true, timeoutMs: 20000 },
  )
  if (result?.ok) {
    await sleep(state.settle)
    return { ok: true, spa: true, ms: result.ms ?? null }
  }
  await navigate(client, `${state.baseUrl}${route}`)
  await sleep(state.settle)
  return { ok: true, spa: false, ms: null, reason: result?.error ?? 'роутер не отреагировал' }
}

/**
 * Циклы «маршрут → назад» для поиска утечек.
 *
 * Снимок снимается всегда на одном и том же маршруте (главной), поэтому
 * сравнение между циклами честное: та же вью, та же сцена.
 */
async function runCycles(client, state, routes, cycles) {
  const result = {
    cycles: [],
    base: null,
    spaNavigations: 0,
    fullReloads: 0,
    viewport: state.leakViewport,
    notes: [],
  }

  await applyViewport(client, state.leakViewport)
  await navigate(client, `${state.baseUrl}/`)
  await sleep(state.warmup)
  const baseSnapshot = await snapshot(client)
  result.base = {
    heap: baseSnapshot.heap ?? null,
    gl: glSummary(baseSnapshot.gl),
    canvases: baseSnapshot.canvases ?? [],
    threeDDisabled: baseSnapshot.threeDDisabled ?? false,
    pathname: baseSnapshot.pathname ?? null,
  }

  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    const steps = []
    for (const route of routes) {
      if (route === '/') continue
      const out = await navigateInApp(client, state, route)
      if (out.spa) result.spaNavigations += 1
      else result.fullReloads += 1
      steps.push({ route, ...out })

      const back = await navigateInApp(client, state, '/')
      if (back.spa) result.spaNavigations += 1
      else result.fullReloads += 1
      steps.push({ route: '/', ...back })
    }
    const snap = await snapshot(client)
    result.cycles.push({
      cycle,
      steps: steps.map((step) => ({ route: step.route, spa: step.spa, ms: step.ms })),
      heap: snap.heap ?? null,
      gl: glSummary(snap.gl),
      canvases: snap.canvases ?? [],
      threeDDisabled: snap.threeDDisabled ?? false,
      pathname: snap.pathname ?? null,
    })
  }

  if (result.fullReloads > 0) {
    result.notes.push(
      `${result.fullReloads} переходов выполнено полной перезагрузкой — счётчики WebGL обнулялись, их рост нельзя читать как утечку.`,
    )
  }
  return result
}

/**
 * Вывод об утечках по циклам навигации.
 *
 * Порог роста heap на цикл — здесь не «зелёный/красный», а честное
 * число: сколько байт приложение добавляет за один обход маршрутов.
 */
function analyseLeaks(cycleReport) {
  const cycles = cycleReport?.cycles ?? []
  const baseHeap = cycleReport?.base?.heap?.usedJSHeapSize ?? null
  const baseGl = cycleReport?.base?.gl ?? null
  const first = cycles[0]?.heap?.usedJSHeapSize ?? null
  const last = cycles[cycles.length - 1]?.heap?.usedJSHeapSize ?? null

  const heapGrowthPerCycle =
    baseHeap !== null && last !== null && cycles.length
      ? (last - baseHeap) / cycles.length
      : null

  const glGrowthPerCycle = {}
  if (baseGl && cycles.length) {
    const lastGl = cycles[cycles.length - 1].gl
    for (const key of [
      'texturesNet',
      'buffersNet',
      'programsNet',
      'shadersNet',
      'framebuffersNet',
      'vaosNet',
      'contextsLive',
    ]) {
      glGrowthPerCycle[key] = round((lastGl[key] - baseGl[key]) / cycles.length, 2)
    }
  }

  const snapshots = []
  if (baseHeap !== null) {
    snapshots.push({
      cycle: 0,
      heap: baseHeap,
      gl: baseGl,
      threeDDisabled: cycleReport?.base?.threeDDisabled ?? false,
    })
  }
  for (const item of cycles) {
    snapshots.push({
      cycle: item.cycle,
      heap: item.heap?.usedJSHeapSize ?? null,
      gl: item.gl,
      threeDDisabled: item.threeDDisabled ?? false,
    })
  }

  // Снимки, которые просили в задании: база, третий цикл, десятый.
  const atCycle = (n) => cycles.find((item) => item.cycle === n) ?? null
  const checkpoint = (n) => {
    const item = atCycle(n)
    if (!item) return null
    const heap = item.heap?.usedJSHeapSize ?? null
    return {
      cycle: n,
      heapBytes: heap,
      heapGrowthBytes: baseHeap !== null && heap !== null ? heap - baseHeap : null,
      heapGrowthPerCycleBytes:
        baseHeap !== null && heap !== null ? Math.round((heap - baseHeap) / n) : null,
      gl: item.gl,
    }
  }

  return {
    heapBaseBytes: baseHeap,
    heapFirstCycleBytes: first,
    heapLastCycleBytes: last,
    heapGrowthBytes: baseHeap !== null && last !== null ? last - baseHeap : null,
    heapGrowthPerCycleBytes: heapGrowthPerCycle === null ? null : Math.round(heapGrowthPerCycle),
    glGrowthPerCycle,
    checkpoints: [checkpoint(3), checkpoint(10)].filter(Boolean),
    snapshots,
  }
}

/* ==== CLI =============================================================== */

const HELP = `
perf-audit — перф-проба BMSTUDvach в реальном браузере (Chrome через CDP)

Использование:
  node scripts/perf-audit.mjs [флаги]

Флаги:
  --routes=<список>      Маршруты для замера через запятую. По умолчанию
                          ${DEFAULT_ROUTES.join(',')}
  --cycles=<n>           Циклов навигации «маршрут → назад» для проверки
                          утечек памяти и WebGL-ресурсов. По умолчанию 5.
  --out=<каталог>        Куда складывать артефакты. По умолчанию
                          frontend/.qa-artifacts/perf.
  --viewport=<имя>       desktop (1440×900), wide (1920×1080),
                          mobile (390×844), narrow (320×720) или all.
                          По умолчанию desktop.
  --leak-viewport=<имя> Вьюпорт фазы утечек. По умолчанию mobile: на
                          тяжёлой главной desktop-сцена на программном
                          рендерере не держит 60 FPS, и приложение само
                          выключает 3D (деградация по FPS) — замер обрывается
                          на середине. Значение same — вьюпорт маршрутов.
  --measure=<мс>         Окно измерения кадров, минимум ${MIN_MEASURE_MS}. По умолчанию 3000.
  --warmup=<мс>          Пауза после загрузки, пока сцена устаканится.
                          По умолчанию 1500.
  --settle=<мс>          Пауза после клиентского перехода. По умолчанию 900.
  --mode=<режим>         ok | empty | error | offline — режим фикстур.
                          По умолчанию ok.
  --base=<url>           Готовый адрес приложения вместо сборки и vite preview.
  --help, -h             Эта справка.

Артефакты:
  <out>/report.json   числа машинным чтением
  <out>/report.md     человекочитаемая сводка

Примеры:
  node scripts/perf-audit.mjs --routes=/,/platinum,/boards/general --cycles=5 --out=.qa-artifacts/perf
  node scripts/perf-audit.mjs --routes=/,/platinum --cycles=10 --viewport=mobile

ВАЖНО: headless-Chrome рендерит через SwiftShader (программный растеризатор).
Абсолютные FPS на нём не показательны для реального железа — ценность
пробы в относительных величинах: стабильность, отсутствие провалов,
отсутствие роста памяти и WebGL-ресурсов.
`

/** Разбор аргументов командной строки. */
export function parseArgs(argv) {
  const options = {
    routes: null,
    cycles: 5,
    out: null,
    viewport: 'desktop',
    leakViewport: 'mobile',
    measure: 3000,
    warmup: 1500,
    settle: 900,
    mode: 'ok',
    base: null,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index]
    const eq = raw.indexOf('=')
    const name = eq === -1 ? raw : raw.slice(0, eq)
    const inline = eq === -1 ? null : raw.slice(eq + 1)
    const takeValue = () => {
      if (inline !== null) return inline
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`Флаг ${name} требует значения.`)
      }
      index += 1
      return value
    }
    const takeNumber = () => {
      const value = Number(takeValue())
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Флаг ${name} ждёт число миллисекунд, получено «${value}».`)
      }
      return value
    }

    switch (name) {
      case '--help':
      case '-h':
        options.help = true
        break
      case '--routes':
        options.routes = takeValue()
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
        break
      case '--cycles': {
        const value = Number(takeValue())
        if (!Number.isInteger(value) || value < 0) {
          throw new Error(`Флаг --cycles ждёт целое число, получено «${value}».`)
        }
        options.cycles = value
        break
      }
      case '--out':
        options.out = takeValue().trim()
        break
      case '--viewport':
        options.viewport = takeValue().trim()
        break
      case '--leak-viewport':
        options.leakViewport = takeValue().trim()
        break
      case '--measure':
        options.measure = takeNumber()
        break
      case '--warmup':
        options.warmup = takeNumber()
        break
      case '--settle':
        options.settle = takeNumber()
        break
      case '--mode':
        options.mode = takeValue().trim()
        break
      case '--base':
        options.base = takeValue().trim()
        break
      default:
        throw new Error(`Неизвестный флаг: ${name}. Список флагов — в --help.`)
    }
  }

  if (!['ok', 'empty', 'error', 'offline'].includes(options.mode)) {
    throw new Error(
      `Неизвестный режим фикстур: ${options.mode}. Доступны: ok, empty, error, offline.`,
    )
  }
  if (options.viewport !== 'all' && !VIEWPORTS[options.viewport]) {
    throw new Error(
      `Неизвестный вьюпорт: ${options.viewport}. Доступны: ${Object.keys(VIEWPORTS).join(', ')}, all.`,
    )
  }
  if (options.leakViewport !== 'same' && !VIEWPORTS[options.leakViewport]) {
    throw new Error(
      `Неизвестный вьюпорт фазы утечек: ${options.leakViewport}. ` +
        `Доступны: ${Object.keys(VIEWPORTS).join(', ')}, same.`,
    )
  }
  if (!options.routes || !options.routes.length) options.routes = [...DEFAULT_ROUTES]
  if (options.measure < MIN_MEASURE_MS) {
    console.warn(
      `[perf-audit] окно измерения увеличено до ${MIN_MEASURE_MS} мс: меньше окно слишком шумно.`,
    )
    options.measure = MIN_MEASURE_MS
  }

  return options
}

/* ==== Отчёт ============================================================= */

/** Человекочитаемый отчёт. */
function renderReportMarkdown(report) {
  const lines = []
  const renderer = report.renderer ?? {}
  const software = renderer.softwareRenderer === true

  lines.push('# Perf Audit — BMSTUDvach')
  lines.push('')
  lines.push(`- Сгенерировано: ${report.generatedAt}`)
  lines.push(`- Инструмент: ${report.tool}`)
  lines.push(`- Режим фикстур: \`${report.mode}\``)
  lines.push(`- Вьюпорт(ы): ${report.viewports.join(', ')}`)
  lines.push(`- Окно измерения кадров: ${report.measureMs} мс`)
  lines.push(`- Приложение: ${report.appUrl}`)
  lines.push(
    `- Chrome: ${report.chrome?.path ?? '—'} (${report.chrome?.browser ?? '—'})`,
  )
  lines.push(`- Маршрутов замерено: ${report.routes.length}`)
  lines.push(`- Циклов навигации: ${report.cycles?.cycles?.length ?? 0}`)
  lines.push('')

  lines.push('## ГЛАВНАЯ ОГОВОРКА: это программный рендерер')
  lines.push('')
  lines.push(
    'Headless-Chrome в этом прогоне рисует через **SwiftShader** — программный растеризатор, ' +
      'а не GPU. Все абсолютные FPS и frame-time ниже — характеристика software-рендера, ' +
      'а НЕ производительности реального железа.',
  )
  lines.push('')
  lines.push(
    `Renderer: \`${renderer.unmaskedRenderer ?? renderer.renderer ?? 'неизвестно'}\`` +
      (renderer.unmaskedVendor ? ` (vendor: \`${renderer.unmaskedVendor}\`)` : ''),
  )
  lines.push(
    `Режим рендерера: ${software ? '**программный (SwiftShader)**' : 'аппаратный/неизвестный'}.`,
  )
  if (renderer.version) lines.push(`Версия WebGL: \`${renderer.version}\``)
  lines.push('')
  lines.push('Что из этого пробы можно читать:')
  lines.push('')
  lines.push(
    '- **стабильность** кадров: p95/max frame-time и доля кадров длиннее 33 мс — «провалы» ' +
      'не зависят от скорости растеризатора;',
  )
  lines.push(
    '- **разница между маршрутами**: если один маршрут роняет кадры в 5 раз сильнее другого — ' +
      'это дефект сцены, а не SwiftShader;',
  )
  lines.push(
    '- **рост памяти и WebGL-ресурсов** при повторной навигации: числа не зависят от ' +
      'программного рендера вовсе;',
  )
  lines.push(
    '- **работа деградации по FPS**: приложение само снижает качество, если кадры проседают ' +
      'дольше 90 тиков, — на software-рендерере это срабатывает даже раньше, чем на GPU;',
  )
  lines.push('')

  lines.push('## Кадры по маршрутам')
  lines.push('')
  lines.push(
    '`FPS` — частота rAF страницы. `FPS 3D` — частота кадров, в которых реально были ' +
      'draw-call\'ы (то есть сцена что-то рисовала). Разница между ними — время, которое ' +
      'сцена не перерисовывает.',
  )
  lines.push('')
  lines.push(
    '| Маршрут | Вьюпорт | Первый кадр, мс | FCP, мс | FPS | FPS 3D | p50, мс | p95, мс | max, мс | >33 мс | draw/s | draw/кадр |',
  )
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const item of report.routes) {
    const frames = item.frames ?? {}
    const delta = item.windowDelta ?? {}
    const duration = (frames.durationMs ?? 0) / 1000
    const drawsPerSecond = duration > 0 ? round((delta.draws ?? 0) / duration) : null
    const drawsPerFrame =
      frames.renderedFrames > 0 ? round((delta.draws ?? 0) / frames.renderedFrames) : null
    lines.push(
      `| \`${item.route}\` | ${item.viewport} | ${item.firstContentMs ?? '—'} | ` +
        `${item.firstContentfulPaintMs ?? '—'} | ${frames.fps ?? '—'} | ${frames.renderedFps ?? '—'} | ` +
        `${frames.p50FrameMs ?? '—'} | ${frames.p95FrameMs ?? '—'} | ${frames.maxFrameMs ?? '—'} | ` +
        `${frames.over33Ratio === undefined || frames.over33Ratio === null ? '—' : `${Math.round(frames.over33Ratio * 100)}%`} | ` +
        `${drawsPerSecond ?? '—'} | ${drawsPerFrame ?? '—'} |`,
    )
  }
  lines.push('')

  lines.push('## Память и WebGL по маршрутам')
  lines.push('')
  lines.push(
    '| Маршрут | Heap, МБ | Heap лимит, МБ | DPR | Канвасов | WebGL-контекстов | Контекстов в DOM | Draw calls | Текстур (создано/удалено/нетто) | Буферов | Программ |',
  )
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const item of report.routes) {
    const heap = item.heap ?? {}
    const gl = item.gl ?? {}
    const mb = (value) =>
      typeof value === 'number' ? round(value / (1024 * 1024), 2) : '—'
    lines.push(
      `| \`${item.route}\` | ${mb(heap.usedJSHeapSize)} | ${mb(heap.jsHeapSizeLimit)} | ` +
        `${item.dpr ?? '—'} | ${(item.canvases ?? []).length} | ${gl.contextsCreated ?? '—'} | ` +
        `${gl.contextsLive ?? '—'} | ${gl.draws ?? '—'} | ` +
        `${gl.texturesCreated ?? 0}/${gl.texturesDeleted ?? 0}/${gl.texturesNet ?? 0} | ` +
        `${gl.buffersCreated ?? 0}/${gl.buffersDeleted ?? 0}/${gl.buffersNet ?? 0} | ` +
        `${gl.programsCreated ?? 0}/${gl.programsDeleted ?? 0}/${gl.programsNet ?? 0} |`,
    )
  }
  lines.push('')

  const leaks = report.leaks ?? {}
  lines.push('## Кто именно рисует (draw-call\'ы по холстам)')
  lines.push('')
  lines.push(
    'Холст с контекстом, но нулём draw-call\'ов — это WebGL-контекст, который оплачивает ' +
      'кадр (очистка буфера, rAF-цикл), но ничего не рисует. Такой контекст — либо ' +
      'сцена не отдана рендереру, либо она пустая.',
  )
  lines.push('')
  lines.push('| Маршрут | Холст | Контекстов | Draw calls | Текстур | Буферов | Программ | Вердикт |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const item of report.routes) {
    const perCanvas = item.gl?.perCanvas ?? {}
    const keys = Object.keys(perCanvas)
    if (!keys.length) {
      lines.push(`| \`${item.route}\` | — | 0 | 0 | 0 | 0 | 0 | WebGL не создавался |`)
      continue
    }
    for (const key of keys) {
      const canvas = perCanvas[key]
      lines.push(
        `| \`${item.route}\` | \`${key}\` | ${canvas.contexts} | ${canvas.draws} | ` +
          `${canvas.texturesCreated} | ${canvas.buffersCreated} | ${canvas.programsCreated} | ` +
          `${canvas.draws === 0 ? '**рисует пустоту**' : 'рисует'} |`,
      )
    }
  }
  lines.push('')

  lines.push('## Циклы навигации «маршрут → назад»')
  lines.push('')
  lines.push(
    `Переходы сделаны клиентски (без перезагрузки документа): ` +
      `${report.cycles?.spaNavigations ?? 0} шт., полных перезагрузок — ` +
      `${report.cycles?.fullReloads ?? 0}. Снимок всегда снят на главной.`,
  )
  lines.push('')
  lines.push(
    `Фаза утечек идёт во вьюпорте \`${report.leakViewport ?? '—'}\`. Это осознанно: на ` +
      'тяжёлой главной в desktop вьюпорте программный рендерер не держит 60 FPS, и ' +
      'приложение само выключает 3D (деградация по FPS) — замер обрывается на середине. ' +
      'В мобильном вьюпорте сцена держит 60 FPS и весь обход проходит с работающей сценой.',
  )
  lines.push('')
  lines.push(
    '| Цикл | Heap, МБ | Δ к базе, КБ | Δ за цикл, КБ | Контекстов в DOM | 3D | Текстуры (создано/удалено/нетто) | Буферов (создано/удалено/нетто) | Программ (создано/удалено/нетто) | Draw calls |',
  )
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  const baseHeap = leaks.heapBaseBytes ?? null
  let previousHeap = baseHeap
  for (const item of leaks.snapshots ?? []) {
    const heap = item.heap ?? null
    const gl = item.gl ?? {}
    const deltaKb =
      heap !== null && baseHeap !== null ? Math.round((heap - baseHeap) / 1024) : null
    const stepKb =
      heap !== null && previousHeap !== null ? Math.round((heap - previousHeap) / 1024) : null
    previousHeap = heap
    lines.push(
      `| ${item.cycle} | ${heap === null ? '—' : round(heap / (1024 * 1024), 2)} | ` +
        `${deltaKb ?? '—'} | ${stepKb ?? '—'} | ${gl.contextsLive ?? '—'} | ` +
        `${item.threeDDisabled === true ? 'выкл' : 'вкл'} | ` +
        `${gl.texturesCreated ?? '—'}/${gl.texturesDeleted ?? '—'}/${gl.texturesNet ?? '—'} | ` +
        `${gl.buffersCreated ?? '—'}/${gl.buffersDeleted ?? '—'}/${gl.buffersNet ?? '—'} | ` +
        `${gl.programsCreated ?? '—'}/${gl.programsDeleted ?? '—'}/${gl.programsNet ?? '—'} | ` +
        `${gl.draws ?? '—'} |`,
    )
  }
  lines.push('')

  lines.push('## Вывод об утечках')
  lines.push('')
  const heapGrowth = leaks.heapGrowthBytes
  const perCycle = leaks.heapGrowthPerCycleBytes
  const heapBaseMb = round((leaks.heapBaseBytes ?? 0) / (1024 * 1024), 2)
  const heapLastMb = round((leaks.heapLastCycleBytes ?? 0) / (1024 * 1024), 2)
  if (heapGrowth === null) {
    lines.push('- Heap-снимки не собраны — вывод сделать нельзя.')
  } else {
    const perCycleKb = perCycle === null ? null : Math.round(perCycle / 1024)
    lines.push(
      `- **Heap:** база ${heapBaseMb} МБ → после всех циклов ${heapLastMb} МБ ` +
        `(рост ${Math.round(heapGrowth / 1024)} КБ, ~${perCycleKb ?? '—'} КБ на цикл).`,
    )
    const steps = (leaks.snapshots ?? [])
      .map((item) => item.heap)
      .filter((value) => typeof value === 'number')
    let decelerating = false
    if (steps.length >= 4) {
      const half = Math.floor(steps.length / 2)
      const firstHalf = (steps[half] - steps[0]) / Math.max(1, half)
      const secondHalf = (steps[steps.length - 1] - steps[half]) / Math.max(1, steps.length - half)
      decelerating = secondHalf < firstHalf * 0.6
    }
    lines.push(
      heapGrowth <= 0
        ? '  - Роста нет (или куча просела) — утечки памяти при повторной навигации НЕ видно.'
        : decelerating
          ? '  - Рост замедляется от цикла к циклу (вторая половина прогона растёт заметно ' +
            'медленнее первой) — это больше похоже на кэш/ленивую догрузку, чем на чистую утечку; ' +
            'но ровно линейный рост текстур ниже — настоящая утечка GPU-ресурсов.'
          : '  - Рост линейный по циклам — это утечка: объёмы не возвращаются при размонтировании.',
    )
  }
  for (const point of leaks.checkpoints ?? []) {
    lines.push(
      `- **Контрольная точка ${point.cycle} циклов:** heap ` +
        `${round((point.heapBytes ?? 0) / (1024 * 1024), 2)} МБ ` +
        `(против базы: ` +
        `${point.heapGrowthBytes === null ? '—' : `${Math.round(point.heapGrowthBytes / 1024)} КБ`}, ` +
        `~${point.heapGrowthPerCycleBytes === null ? '—' : `${Math.round(point.heapGrowthPerCycleBytes / 1024)} КБ`} на цикл), ` +
        `текстур нетто ${point.gl?.texturesNet ?? '—'}, буферов нетто ${point.gl?.buffersNet ?? '—'}, ` +
        `программ нетто ${point.gl?.programsNet ?? '—'}, контекстов в DOM ${point.gl?.contextsLive ?? '—'}.`,
    )
  }
  const growth = leaks.glGrowthPerCycle ?? {}
  lines.push(
    `- **WebGL-ресурсы (нетто = создано − удалено) за цикл:** ` +
      `текстуры ${growth.texturesNet ?? '—'}, буферы ${growth.buffersNet ?? '—'}, ` +
      `программы ${growth.programsNet ?? '—'}, шейдеры ${growth.shadersNet ?? '—'}, ` +
      `контексты в DOM ${growth.contextsLive ?? '—'}.`,
  )
  const glStable = Object.entries(growth).every(([, value]) => !value)
  lines.push(
    glStable
      ? '  - Ни один счётчик не растёт — освобождение ресурсов при размонтировании сцены работает.'
      : '  - Есть счётчики, которые растут — см. таблицу циклов: кандидаты на утечку перечислены выше.',
  )
  const textureGrowth = growth.texturesNet
  if (typeof textureGrowth === 'number' && textureGrowth > 0) {
    lines.push(
      `  - **Текстуры растут на ${textureGrowth} шт. за цикл:** приложение создаёт текстуры, ` +
        'но `deleteTexture` не вызывается — GPU-ресурсы сцены не возвращаются при ' +
        'размонтировании.',
    )
  }
  lines.push(
    `- **Бюджет контекстов проекта** — \`MAX_ACTIVE_CONTEXTS = 2\`. ` +
      `Пик контекстов, увиденный на маршрутах: ` +
      `${Math.max(
        0,
        ...report.routes.map((item) => item.gl?.contextsCreated ?? 0),
        ...(leaks.snapshots ?? []).map((item) => item.gl?.contextsLive ?? 0),
      )}.`,
  )
  lines.push('')
  lines.push(
    'Счётчик «контексты в DOM» — это «контексты создано минус канвасов убрано из DOM»: ' +
      'снятая сцена отпускает свой слот. Значение выше бюджета означает, что слот ' +
      'освобождается не сразу или что контекст создаётся в обход `useThreeScene`.',
  )
  lines.push('')

  lines.push('## Наблюдения пробы')
  lines.push('')
  const silent = []
  for (const item of report.routes) {
    for (const key of item.gl?.silentCanvases ?? []) {
      silent.push(`\`${item.route}\` → холст \`${key}\` (контекст есть, draw-call\'ов 0)`)
    }
  }
  if (silent.length) {
    lines.push('**Холсты с контекстом, но без единого draw-call:**')
    lines.push('')
    for (const item of silent) lines.push(`- ${item}`)
    lines.push('')
    lines.push(
      'Такой холст получает WebGL-контекст, запускает собственный rAF-цикл и очищает буфер ' +
        'каждый кадр, но не рисует ничего: сцена создана, но не отдана рендереру. Это и ' +
        'потеря кадров, и лишний контекст в бюджете `MAX_ACTIVE_CONTEXTS = 2`.',
    )
  } else {
    lines.push('- Холстов с контекстом, но без draw-call\'ов, не найдено.')
  }
  lines.push('')
  const unstable = report.routes.filter(
    (item) => (item.frames?.over33Ratio ?? 0) > 0.1 || (item.frames?.maxFrameMs ?? 0) > 100,
  )
  if (unstable.length) {
    lines.push(
      '**Маршруты с провалами кадров** (>10% кадров длиннее 33 мс или кадр длиннее 100 мс): ' +
        unstable.map((item) => `\`${item.route}\``).join(', ') +
        '. На программном рендерере это ожидаемо, но относительное сравнение между ' +
        'маршрутами остаётся честным.',
    )
  } else {
    lines.push('- Провалов кадров (>10% кадров длиннее 33 мс) не зафиксировано.')
  }
  lines.push('')
  lines.push(
    '- **Деградация по FPS:** приложение снижает качество 3D, если средний кадр держится ' +
      'дольше 33 мс на протяжении 90 тиков (`useThreeScene`). На программном рендерере ' +
      'порог достигается легче, чем на GPU, поэтому деградация здесь может срабатывать ' +
      'раньше, чем на реальном железе.',
  )
  const disabledCycles = (leaks.snapshots ?? [])
    .filter((item) => item.threeDDisabled === true)
    .map((item) => item.cycle)
  const disabledRoutes = report.routes
    .filter((item) => item.threeDDisabled === true)
    .map((item) => `\`${item.route}\``)
  if (disabledCycles.length || disabledRoutes.length) {
    lines.push(
      '- **3D был выключен во время прогона:** маршруты ' +
        `${disabledRoutes.length ? disabledRoutes.join(', ') : '—'}; циклы ` +
        `${disabledCycles.length ? disabledCycles.join(', ') : '—'}. ` +
        'Это сработавшая деградация по FPS (или пользовательская настройка качества): ' +
        'сцена заменена CSS-фолбэком или 2D-частицами. После этого счётчики draw-call\'ов ' +
        'перестают расти — это не зависание приложения.',
    )
  }
  lines.push('')

  lines.push('## Методология и ограничения')
  lines.push('')
  lines.push(
    '- FPS считается в реальном времени через `requestAnimationFrame` в странице; окно — ' +
      `${report.measureMs} мс, дельты между кадрами дают p50/p95/max frame-time.`,
  )
  lines.push(
    '- «Первый содержательный кадр» — момент появления в DOM корня вью с ненулевым ' +
      'размером; отдельно приведён FCP.',
  )
  lines.push(
    '- Heap снимается с принудительным GC (`--js-flags=--expose-gc`): без него снимок ' +
      'отражает мусор прошлых кадров.',
  )
  lines.push(
    '- Heap в таблице маршрутов — снимок документа, который только что загрузился заново; ' +
      'сравнивать его с heap соседнего маршрута нельзя (старый документ ещё не выброшен ' +
      'сборщиком). Сравнимые числа — в таблице циклов: там документ один и тот же.',
  )
  lines.push(
    '- Счётчики WebGL сняты перехватом методов контекста на экземпляре ' +
      '(`drawElements`, `drawArrays`, `createTexture`, `deleteTexture`, `createBuffer`, ' +
      '`deleteBuffer`, `createProgram`, `deleteProgram`, …) — приложение при этом не менялось.',
  )
  lines.push(
    '- «Контексты в DOM» считается как «контексты создано минус канвасов убрано из DOM»: ' +
      'снятая сцена отпускает свой слот контекста.',
  )
  lines.push(
    '- Ошибки консоли и исключения страницы собираются на каждом маршруте и на каждом цикле.',
  )
  lines.push('')

  const issues = report.routes.filter(
    (item) => item.consoleErrors.length || item.pageErrors.length || item.notes.length,
  )
  lines.push('## Ошибки и замечания прогона')
  lines.push('')
  if (!issues.length) {
    lines.push('Чисто: ни одной ошибки консоли, ни одного исключения, ни одного замечания.')
  } else {
    for (const item of issues) {
      lines.push(`### \`${item.route}\` (${item.viewport})`)
      lines.push('')
      for (const error of item.consoleErrors) lines.push(`- ошибка консоли: ${error}`)
      for (const error of item.pageErrors) lines.push(`- исключение: ${error}`)
      for (const note of item.notes) lines.push(`- замечание: ${note}`)
      lines.push('')
    }
  }

  return `${lines.join('\n')}\n`
}

/* ==== Запуск ============================================================ */

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(HELP.trim())
    return 0
  }

  const chromePath = findChrome()
  if (!chromePath) {
    console.error(
      'Chrome не найден — перф-проба невозможна.\n' +
        'Установите Google Chrome или задайте путь к браузеру в переменной CHROME_PATH.\n' +
        'Искали: CHROME_PATH, /Applications/Google Chrome.app/Contents/MacOS/Google Chrome, ' +
        '/Applications/Chromium.app/Contents/MacOS/Chromium, google-chrome, chromium, chrome.',
    )
    return 1
  }

  const viewports =
    options.viewport === 'all' ? Object.keys(VIEWPORTS) : [options.viewport]
  const outDir = options.out ? resolve(root, options.out) : join(root, '.qa-artifacts', 'perf')
  await mkdir(outDir, { recursive: true })

  let server = null
  let chrome = null
  let client = null

  try {
    if (options.base) {
      server = { child: null, baseUrl: options.base.replace(/\/$/, '') }
      console.log(`[perf-audit] приложение: ${server.baseUrl} (из --base)`)
    } else {
      server = await startAppServer(root)
      console.log(`[perf-audit] приложение: ${server.baseUrl} (vite preview)`)
    }

    chrome = await launchChrome(chromePath)
    console.log(`[perf-audit] chrome: ${chrome.browser} (порт ${chrome.port})`)

    const target = await createTarget(chrome.port)
    client = await CdpClient.connect(target.webSocketDebuggerUrl, 30000, 'perf-audit')
    console.log(`[perf-audit] вкладка: ${target.id}`)

    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('Network.enable')
    await client.send('Log.enable')
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_INSTRUMENT })
    try {
      // Service worker кэширует оболочку — для замеров он лишний.
      await client.send('Network.setBypassServiceWorker', { bypass: true })
    } catch {
      /* метод может отсутствовать в старых сборках Chrome */
    }

    attachFetchInterceptor(client, {
      resolve: (request) => {
        const url = new URL(request.url)
        return fixturesFor(url.pathname, options.mode, request.method)
      },
    })
    await client.send('Fetch.enable', {
      patterns: [{ urlPattern: API_PATTERN, requestStage: 'Request' }],
    })

    const state = {
      mode: options.mode,
      baseUrl: server.baseUrl,
      measure: options.measure,
      warmup: options.warmup,
      settle: options.settle,
      leakViewport:
        options.leakViewport === 'same'
          ? options.viewport === 'all'
            ? 'desktop'
            : options.viewport
          : options.leakViewport,
      current: null,
    }

    // Ошибки консоли и исключения — по маршрутам.
    client.on('Runtime.consoleAPICalled', (params) => {
      const record = state.current
      if (!record) return
      if (params.type !== 'error' && params.type !== 'warning') return
      const text = (params.args ?? [])
        .map((arg) => {
          if (arg.type === 'string') return arg.value
          if ('value' in arg) {
            try {
              return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value)
            } catch {
              return String(arg.value)
            }
          }
          return arg.description ?? arg.className ?? arg.type ?? ''
        })
        .join(' ')
        .trim()
      if (params.type === 'error') record.consoleErrors.push(text || 'console.error')
      else record.consoleWarnings?.push(text || 'console.warn')
    })
    client.on('Runtime.exceptionThrown', (params) => {
      const record = state.current
      if (!record) return
      const details = params.exceptionDetails ?? {}
      record.pageErrors.push(
        details.exception?.description ?? details.text ?? 'Неизвестное исключение',
      )
    })

    const routes = []
    let rendererInfo = null

    for (const viewportName of viewports) {
      await applyViewport(client, viewportName)
      for (const route of options.routes) {
        process.stdout.write(`[perf-audit] ${viewportName} ${route} … `)
        const record = await measureRoute(client, state, route, viewportName)
        routes.push(record)
        if (!rendererInfo) rendererInfo = record.renderer
        console.log(
          `ok (FPS ${record.frames?.fps ?? '—'}, 3D ${record.frames?.renderedFps ?? '—'}, ` +
            `p95 ${record.frames?.p95FrameMs ?? '—'} мс, контекстов ${record.gl?.contextsCreated ?? '—'})`,
        )
      }
    }

    console.log(`[perf-audit] циклы навигации: ${options.cycles} …`)
    const cycleReport = await runCycles(client, state, options.routes, options.cycles)
    const leaks = analyseLeaks(cycleReport)

    const unmasked = rendererInfo?.unmaskedRenderer ?? rendererInfo?.renderer ?? ''
    const report = {
      generatedAt: new Date().toISOString(),
      tool: 'perf-audit',
      mode: options.mode,
      viewports,
      requestedRoutes: options.routes,
      measureMs: options.measure,
      warmupMs: options.warmup,
      settleMs: options.settle,
      leakViewport: state.leakViewport,
      appUrl: server.baseUrl,
      chrome: { path: chromePath, browser: chrome.browser, port: chrome.port },
      renderer: {
        ...(rendererInfo ?? {}),
        softwareRenderer:
          typeof unmasked === 'string' &&
          /swiftshader|llvmpipe|software|basic render/i.test(unmasked),
        note:
          'Headless-Chrome рисует программно (SwiftShader). Абсолютные FPS не показательны ' +
          'для реального железа; смотрите относительные величины и рост ресурсов.',
      },
      routes,
      cycles: cycleReport,
      leaks,
    }

    await writeFile(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    await writeFile(join(outDir, 'report.md'), renderReportMarkdown(report))

    console.log('')
    console.log(`[perf-audit] артефакты: ${outDir}`)
    console.log(
      `[perf-audit] отчёты: ${join(outDir, 'report.json')}, ${join(outDir, 'report.md')}`,
    )
    return 0
  } catch (error) {
    console.error(`[perf-audit] провал: ${error.message}`)
    if (process.env.QA_DEBUG) console.error(error)
    return 1
  } finally {
    try {
      client?.close()
    } catch {
      /* уже закрыт */
    }
    await stopChrome(chrome)
    await stopAppServer(server)
  }
}

// Скрипт запускается только когда его вызвали как программу: импорт модуля
// (например, из теста) не должен поднимать браузер.
const invokedDirectly =
  Boolean(process.argv[1]) &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (invokedDirectly) {
  const code = await main()
  process.exit(code)
}
