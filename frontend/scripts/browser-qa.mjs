#!/usr/bin/env node
/**
 * browser-qa — визуальный QA-харнесс BMSTUDvach на РЕАЛЬНОМ Chrome.
 *
 * Зачем он нужен: «на глаз по коду» не проверяет интерфейс. Этот скрипт
 * поднимает настоящий Chrome через CDP, подменяет API детерминированными
 * ответами (`qa-fixtures.mjs`), снимает каждый маршрут PNG-ом и собирает
 * рядом то, что обычно забывают: ошибки консоли, исключения страницы,
 * неудавшиеся запросы, тайминги, момент появления первого содержательного
 * кадра и число созданных WebGL-контекстов.
 *
 * Ограничения, которые здесь принципиальны:
 *   — ни одной новой зависимости: голый Node (≥ 22) с встроенными
 *     `WebSocket` и `fetch`, CDP разговаривает сам с собой;
 *   — приложение не трогается: инструмент живёт целиком в `scripts/`;
 *   — данные детерминированы: снимок сегодня сравним со снимком завтра.
 *
 * Использование:
 *   node scripts/browser-qa.mjs --routes=/,/platinum --viewport=desktop
 *   node scripts/browser-qa.mjs --help
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fixturesFor } from './qa-fixtures.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..') // frontend/

/** Куда перехватываем API (тот же префикс, что в `src/api/client.ts`). */
const API_PATTERN = 'http://localhost:8000/api/v1/*'

/** Таймаут одной CDP-команды и одного шага харнесса, мс. */
const STEP_TIMEOUT = 30000

/** Вьюпорты съёмки. */
const VIEWPORTS = {
  desktop: { width: 1440, height: 900, mobile: false },
  wide: { width: 1920, height: 1080, mobile: false },
  mobile: { width: 390, height: 844, mobile: true },
  narrow: { width: 320, height: 720, mobile: true },
}

/** Маршруты по умолчанию — весь роутер, с фикстурными slug/id. */
const DEFAULT_ROUTES = [
  '/',
  '/boards/general',
  '/threads/1',
  '/platinum',
  '/platinum/1',
  '/about',
  '/stats',
  '/moderation',
  '/nope',
]

/** Где искать Chrome. `CHROME_PATH` из окружения — первым. */
const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

/** Имена Chrome в PATH. */
const CHROME_NAMES = ['google-chrome', 'chromium', 'chrome']

/**
 * Скрипт, который выполняется в каждом новом документе ДО отрисовки
 * приложения. Он ничего не знает о проекте и не меняет его поведение —
 * только считает.
 *
 * Считает:
 *   — WebGL-контексты: `getContext('webgl'|'webgl2')` перехватывается, и
 *     счётчик хранит число РАЗНЫХ живых контекстов (WeakSet по объекту);
 *   — первый содержательный кадр: момент, когда в DOM появился корень
 *     вью (по списку селекторов) и он уже что-то занимает на экране.
 */
const PAGE_INSTRUMENT = `
(() => {
  try {
    const CONTENT_SELECTORS = [
      '.home',
      '.board-page',
      '.thread-page',
      '.platinum-page',
      '.story-frame',
      '.about-page',
      '.stats',
      '.console',
      '.lost-node',
      'main#main-content > *',
    ]
    const DEADLINE_MS = 3000
    const state = {
      firstContentMs: null,
      firstContentSelector: null,
      firstContentLateMs: null,
      webglCalls: 0,
    }
    window.__qa = state
    window.__qaWebglContexts = 0

    const original = HTMLCanvasElement.prototype.getContext
    const live = new WeakSet()
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      const key = String(type || '').toLowerCase()
      const ctx = original.call(this, type, ...rest)
      if (key === 'webgl' || key === 'webgl2' || key === 'experimental-webgl') {
        state.webglCalls += 1
        if (ctx && !live.has(ctx)) {
          live.add(ctx)
          window.__qaWebglContexts += 1
        }
      }
      return ctx
    }

    const findContent = () => {
      for (const selector of CONTENT_SELECTORS) {
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

    const check = () => {
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

    const observer = new MutationObserver(check)
    const start = () => {
      try {
        observer.observe(document.documentElement || document, {
          childList: true,
          subtree: true,
        })
      } catch (error) {
        /* нет корня — подождём следующий тик */
      }
      check()
    }
    if (document.documentElement) start()
    else document.addEventListener('DOMContentLoaded', start, { once: true })

    const timer = setInterval(() => {
      check()
      if (state.firstContentMs !== null || state.firstContentLateMs !== null) {
        clearInterval(timer)
      }
    }, 50)
    setTimeout(() => clearInterval(timer), DEADLINE_MS + 1000)
  } catch (error) {
    window.__qaError = String(error)
  }
})()
`

/** Выражение, которое снимает тайминги и счётчики страницы. */
const PAGE_TIMINGS = `
(() => {
  const nav = performance.getEntriesByType('navigation')[0]
  const paints = {}
  for (const entry of performance.getEntriesByType('paint')) {
    paints[entry.name] = entry.startTime
  }
  const qa = window.__qa || {}
  const round = (value) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
  return {
    domContentLoadedMs: nav ? round(nav.domContentLoadedEventEnd - nav.startTime) : null,
    loadMs: nav ? round(nav.loadEventEnd - nav.startTime) : null,
    domInteractiveMs: nav ? round(nav.domInteractive) : null,
    responseEndMs: nav ? round(nav.responseEnd) : null,
    firstPaintMs: round(paints['first-paint'] ?? null),
    firstContentfulPaintMs: round(paints['first-contentful-paint'] ?? null),
    firstContentMs: round(qa.firstContentMs ?? null),
    firstContentSelector: qa.firstContentSelector ?? null,
    firstContentLateMs: round(qa.firstContentLateMs ?? null),
    webglContextCount: Number(window.__qaWebglContexts || 0),
    webglContextCalls: Number(qa.webglCalls || 0),
    title: document.title,
    url: location.href,
    scrollHeight: document.documentElement ? document.documentElement.scrollHeight : null,
    scrollWidth: document.documentElement ? document.documentElement.scrollWidth : null,
  }
})()
`

/* ==== Мелкие утилиты ==================================================== */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Свободный TCP-порт: сервер слушает на 0 и сразу освобождает порт. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

/** Имя исполняемого файла в PATH. */
function which(name) {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  for (const dir of dirs) {
    const full = join(dir, name)
    if (existsSync(full)) return full
  }
  return null
}

/**
 * Имя файла для маршрута: `/boards/general` → `boards-general`,
 * `/` → `index`. Безопасное имя файла для любого маршрута.
 */
export function routeSlug(route) {
  const trimmed = String(route ?? '/')
    .trim()
    .replace(/^\/+|\/+$/g, '')
  if (!trimmed) return 'index'
  return (
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'index'
  )
}

/* ==== CDP-клиент ======================================================== */

/**
 * Минимальный CDP-клиент на встроенном `WebSocket` Node.
 *
 * Прямое подключение к вкладке (а не к браузеру) — достаточно: нужны
 * только домены страницы, и заодно не тянутся цели браузера.
 */
class CdpClient {
  #socket = null
  #nextId = 0
  #pending = new Map()
  #listeners = new Map()
  #closed = false

  constructor(url) {
    this.url = url
  }

  static async connect(url, timeoutMs = STEP_TIMEOUT) {
    const client = new CdpClient(url)
    await client.#open(timeoutMs)
    return client
  }

  #open(timeoutMs) {
    return new Promise((resolve, reject) => {
      let socket
      try {
        socket = new WebSocket(this.url)
      } catch (error) {
        reject(new Error(`CDP: не удалось открыть ${this.url} — ${error.message}`))
        return
      }
      const timer = setTimeout(() => {
        try {
          socket.close()
        } catch {
          /* уже закрыт */
        }
        reject(new Error(`CDP: ${this.url} не ответил за ${timeoutMs} мс`))
      }, timeoutMs)
      socket.addEventListener('open', () => {
        clearTimeout(timer)
        this.#socket = socket
        resolve()
      })
      socket.addEventListener('error', () => {
        clearTimeout(timer)
        reject(new Error(`CDP: соединение с ${this.url} не установлено`))
      })
      socket.addEventListener('message', (event) => {
        this.#handle(String(event.data))
      })
      socket.addEventListener('close', () => {
        this.#closed = true
        for (const entry of this.#pending.values()) {
          entry.reject(new Error('CDP: соединение закрыто'))
        }
        this.#pending.clear()
      })
    })
  }

  #handle(raw) {
    let message
    try {
      message = JSON.parse(raw)
    } catch {
      return
    }
    if (typeof message.id === 'number') {
      const entry = this.#pending.get(message.id)
      if (!entry) return
      this.#pending.delete(message.id)
      if (message.error) {
        entry.reject(new Error(`CDP: ${message.error.message} (${message.error.code})`))
      } else {
        entry.resolve(message.result)
      }
      return
    }
    const handlers = this.#listeners.get(message.method)
    if (!handlers) return
    for (const handler of [...handlers]) {
      try {
        handler(message.params)
      } catch (error) {
        console.error(`[browser-qa] обработчик ${message.method}: ${error.message}`)
      }
    }
  }

  /** Команда CDP с таймаутом. */
  send(method, params = {}, timeoutMs = STEP_TIMEOUT) {
    if (this.#closed) return Promise.reject(new Error('CDP: соединение закрыто'))
    const id = ++this.#nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`CDP: ${method} не ответил за ${timeoutMs} мс`))
      }, timeoutMs)
      this.#pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      try {
        this.#socket.send(JSON.stringify({ id, method, params }))
      } catch (error) {
        clearTimeout(timer)
        this.#pending.delete(id)
        reject(error)
      }
    })
  }

  /** Подписка на событие; возвращает функцию отписки. */
  on(method, handler) {
    if (!this.#listeners.has(method)) this.#listeners.set(method, new Set())
    this.#listeners.get(method).add(handler)
    return () => {
      this.#listeners.get(method)?.delete(handler)
    }
  }

  close() {
    try {
      this.#socket?.close()
    } catch {
      /* уже закрыт */
    }
  }
}

/* ==== Chrome ============================================================= */

/**
 * Путь к Chrome или null, если браузера в системе нет.
 *
 * `CHROME_PATH` — точное указание: если он задан, но файла нет, молча
 * подставлять другой браузер нельзя (пользователь ждёт именно его), поэтому
 * в этом случае возвращаем null и честно объясняем проблему в выводе.
 */
export function findChrome() {
  const fromEnv = process.env.CHROME_PATH
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null
  for (const candidate of CHROME_PATHS) {
    if (existsSync(candidate)) return candidate
  }
  for (const name of CHROME_NAMES) {
    const found = which(name)
    if (found) return found
  }
  return null
}

/**
 * Флаги Chrome.
 *
 * `--enable-unsafe-swiftshader` вместе с `--use-gl=angle
 * --use-angle=swiftshader` включает программный WebGL 2.0 — без него
 * headless-Chrome не отдаёт контекст и 3D-сцена снимается пустой.
 */
const CHROME_FLAGS = [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--force-device-scale-factor=1',
]

/** Порт DevTools из файла `DevToolsActivePort` в каталоге профиля. */
async function readDevToolsPort(userDataDir, timeoutMs = 20000) {
  const file = join(userDataDir, 'DevToolsActivePort')
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const text = await readFile(file, 'utf8')
      const port = Number(text.split('\n')[0].trim())
      if (Number.isInteger(port) && port > 0) return port
    } catch {
      /* файла ещё нет — Chrome стартует */
    }
    await sleep(100)
  }
  return null
}

/** Отвечает ли DevTools на этом порту. */
async function devToolsAlive(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) return true
    } catch {
      /* ещё не слушает */
    }
    await sleep(150)
  }
  return false
}

/** Убить процесс вместе с потомками (npx порождает детей). */
function killTree(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null) return
  try {
    if (process.platform !== 'win32' && child.pid) {
      process.kill(-child.pid, signal)
    } else {
      child.kill(signal)
    }
  } catch {
    try {
      child.kill(signal)
    } catch {
      /* уже мёртв */
    }
  }
}

/**
 * Запуск Chrome в headless с DevTools.
 *
 * Сначала пробуем `--remote-debugging-port=0`: тогда Chrome сам выбирает
 * свободный порт и пишет его в `DevToolsActivePort`. Если файл не
 * появился — перезапускаем с явным свободным портом (иначе повторный
 * запуск падал бы на занятом порту).
 */
async function launchChrome(chromePath) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'bmstudvach-qa-chrome-'))
  const spawnChrome = (port) =>
    spawn(
      chromePath,
      [
        ...CHROME_FLAGS,
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        'about:blank',
      ],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        detached: process.platform !== 'win32',
      },
    )

  let child = spawnChrome(0)
  let port = await readDevToolsPort(userDataDir)
  if (!port) {
    killTree(child, 'SIGKILL')
    port = await freePort()
    child = spawnChrome(port)
    if (!(await devToolsAlive(port))) {
      killTree(child, 'SIGKILL')
      throw new Error(
        `Chrome не открыл порт DevTools (${port}). Проверьте, что ${chromePath} запускается в headless.`,
      )
    }
  }

  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
  return { child, port, userDataDir, browser: version.Browser ?? 'Chrome' }
}

/** Новая вкладка Chrome; возвращает её `webSocketDebuggerUrl`. */
async function createTarget(port) {
  const endpoint = `http://127.0.0.1:${port}/json/new?about:blank`
  let response = await fetch(endpoint, { method: 'PUT' })
  if (!response.ok) response = await fetch(endpoint)
  if (!response.ok) {
    throw new Error(`Не удалось открыть вкладку Chrome: HTTP ${response.status}`)
  }
  const target = await response.json()
  if (!target.webSocketDebuggerUrl) {
    throw new Error('Chrome не вернул webSocketDebuggerUrl для новой вкладки.')
  }
  return target
}

/* ==== Приложение ======================================================== */

/**
 * Поднять собранное приложение.
 *
 * Нужен готовый `dist` — харнесс снимает РЕАЛЬНЫЙ билд, а не исходники.
 * Если сборки нет, честно говорим об этом и выходим с кодом 1.
 */
async function startAppServer() {
  const distIndex = join(root, 'dist', 'index.html')
  if (!existsSync(distIndex)) {
    throw new Error(
      'Нет собранного приложения: frontend/dist/index.html не найден. ' +
        'Сначала выполните `npm run build` в папке frontend.',
    )
  }

  const port = await freePort()
  const args = ['vite', 'preview', '--port', String(port), '--strictPort']
  const localBin = join(root, 'node_modules', '.bin', 'vite')
  const command = existsSync(localBin) ? localBin : 'npx'
  const spawnArgs = existsSync(localBin) ? args.slice(1) : args

  const child = spawn(command, spawnArgs, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  })

  let stderr = ''
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk)
  })

  const baseUrl = `http://localhost:${port}`
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `vite preview завершился с кодом ${child.exitCode}.${stderr ? `\n${stderr}` : ''}`,
      )
    }
    try {
      const response = await fetch(`${baseUrl}/`)
      if (response.ok) return { child, baseUrl }
    } catch {
      /* сервер ещё поднимается */
    }
    await sleep(200)
  }
  killTree(child, 'SIGKILL')
  throw new Error(`vite preview не поднялся на ${baseUrl} за 20 с.`)
}

/* ==== Перехват API ====================================================== */

/**
 * CORS-заголовки для подменённого ответа.
 *
 * Фронт ходит в API с `credentials: 'include'` и с заголовком
 * `Content-Type: application/json`, поэтому браузер спрашивает
 * preflight и требует честного `Access-Control-Allow-Origin`
 * (не `*` — с credentials звёздочка запрещена).
 */
function corsHeaders(request) {
  const origin = request?.headers?.Origin || request?.headers?.origin || ''
  const headers = []
  if (origin) headers.push({ name: 'Access-Control-Allow-Origin', value: origin })
  headers.push({ name: 'Access-Control-Allow-Credentials', value: 'true' })
  headers.push({
    name: 'Access-Control-Allow-Methods',
    value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  })
  headers.push({
    name: 'Access-Control-Allow-Headers',
    value: 'content-type, x-csrftoken, accept, authorization, x-requested-with',
  })
  headers.push({ name: 'Access-Control-Expose-Headers', value: '*' })
  headers.push({ name: 'Access-Control-Max-Age', value: '600' })
  headers.push({ name: 'Vary', value: 'Origin' })
  return headers
}

/** Текст аргумента консоли — строка, объект или что-то ещё. */
function describeArg(arg) {
  if (!arg) return ''
  if (arg.type === 'string') return arg.value
  if ('value' in arg) {
    try {
      return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value)
    } catch {
      return String(arg.value)
    }
  }
  return arg.description ?? arg.className ?? arg.type ?? ''
}

/* ==== Съёмка ============================================================ */

/**
 * Обслуживание перехваченных запросов API.
 *
 * Здесь и только здесь живёт знание о фикстурах: режим `offline` рвёт
 * запрос на уровне сети, `error` отдаёт 500, остальное — ответ из
 * `qa-fixtures.mjs`.
 */
function attachApiInterceptor(client, state) {
  client.on('Fetch.requestPaused', async (params) => {
    const { requestId, request } = params
    const record = state.current
    try {
      if (request.method === 'OPTIONS') {
        await client.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 204,
          responseHeaders: corsHeaders(request),
          body: '',
        })
        return
      }

      const url = new URL(request.url)
      const { status, body, offline } = fixturesFor(
        url.pathname,
        state.mode,
        request.method,
      )

      if (offline) {
        await client.send('Fetch.failRequest', {
          requestId,
          errorReason: 'ConnectionFailed',
        })
        if (record) {
          record.apiCalls.push({
            method: request.method,
            path: url.pathname,
            status: 'failed',
          })
        }
        return
      }

      await client.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: status,
        responseHeaders: [
          ...corsHeaders(request),
          { name: 'Content-Type', value: 'application/json; charset=utf-8' },
        ],
        body: Buffer.from(JSON.stringify(body ?? null)).toString('base64'),
      })
      if (record) {
        record.apiCalls.push({
          method: request.method,
          path: url.pathname,
          status,
        })
      }
    } catch (error) {
      console.error(`[browser-qa] подмена запроса не удалась: ${error.message}`)
      try {
        await client.send('Fetch.continueRequest', { requestId })
      } catch {
        /* запрос уже закрыт */
      }
    }
  })
}

/** Подписки на события страницы: консоль, исключения, сеть. */
function attachPageListeners(client, state) {
  const requestUrls = new Map()

  client.on('Network.requestWillBeSent', (params) => {
    requestUrls.set(params.requestId, params.request?.url ?? '')
  })

  client.on('Runtime.consoleAPICalled', (params) => {
    const record = state.current
    if (!record) return
    const text = (params.args ?? []).map(describeArg).join(' ').trim()
    if (params.type === 'error') record.consoleErrors.push(text || 'console.error')
    else if (params.type === 'warning')
      record.consoleWarnings.push(text || 'console.warn')
  })

  client.on('Runtime.exceptionThrown', (params) => {
    const record = state.current
    if (!record) return
    const details = params.exceptionDetails ?? {}
    record.pageErrors.push(
      details.exception?.description ?? details.text ?? 'Неизвестное исключение',
    )
  })

  client.on('Log.entryAdded', (params) => {
    const record = state.current
    if (!record) return
    const entry = params.entry ?? {}
    const text =
      `[${entry.source ?? 'log'}] ${entry.text ?? ''} ${entry.url ?? ''}`.trim()
    if (entry.level === 'error') record.consoleErrors.push(text)
    else if (entry.level === 'warning') record.consoleWarnings.push(text)
  })

  client.on('Network.loadingFailed', (params) => {
    const record = state.current
    if (!record) return
    record.failedRequests.push({
      url: requestUrls.get(params.requestId) ?? '',
      reason: params.errorText ?? 'unknown',
      canceled: Boolean(params.canceled),
    })
  })

  client.on('Network.responseReceived', (params) => {
    const record = state.current
    if (!record) return
    const status = params.response?.status ?? 0
    if (status >= 400) {
      record.failedRequests.push({
        url: params.response?.url ?? '',
        reason: `HTTP ${status}`,
        canceled: false,
      })
    }
  })
}

/** Переход на маршрут с ожиданием загрузки. */
async function navigate(client, url, timeoutMs = STEP_TIMEOUT) {
  let off = () => {}
  const loaded = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off()
      reject(new Error(`Страница ${url} не загрузилась за ${timeoutMs} мс`))
    }, timeoutMs)
    off = client.on('Page.loadEventFired', () => {
      clearTimeout(timer)
      off()
      resolve()
    })
  })
  const result = await client.send('Page.navigate', { url })
  if (result?.errorText) {
    throw new Error(`Переход на ${url} не удался: ${result.errorText}`)
  }
  await loaded
}

/** Полный PNG страницы (не только вьюпорт). */
async function captureScreenshot(client) {
  const metrics = await client.send('Page.getLayoutMetrics')
  const size = metrics.cssContentSize ?? metrics.contentSize ?? {}
  const width = Math.ceil(size.width ?? 0)
  const height = Math.ceil(size.height ?? 0)
  try {
    const shot = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    })
    return Buffer.from(shot.data, 'base64')
  } catch {
    const shot = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    })
    return Buffer.from(shot.data, 'base64')
  }
}

/**
 * Снять один маршрут в одном вьюпорте.
 *
 * Порядок важен для детерминизма: перед навигацией чистим хранилище
 * origin (localStorage, service worker, кэш) — иначе состояние прошлого
 * маршрута влияет на следующий снимок.
 */
async function captureRoute(client, state, route, viewportName) {
  const viewport = VIEWPORTS[viewportName]
  const record = {
    route,
    viewport: viewportName,
    mode: state.mode,
    screenshot: null,
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    failedRequests: [],
    apiCalls: [],
    timings: {},
    firstContentMs: null,
    webglContextCount: 0,
  }
  state.current = record

  try {
    const origin = new URL(state.baseUrl).origin
    try {
      await client.send('Storage.clearDataForOrigin', {
        origin,
        storageTypes: 'all',
      })
    } catch {
      /* хранилище чистить нечем — не критично */
    }

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
    await client.send('Emulation.setEmulatedMedia', {
      features: state.reducedMotion
        ? [{ name: 'prefers-reduced-motion', value: 'reduce' }]
        : [],
    })

    const url = `${state.baseUrl}${route}`
    await navigate(client, url)

    // Ждём, пока улягутся GSAP-появления: снимок снимается ПОСЛЕ анимаций,
    // иначе картинка зависит от момента.
    await sleep(state.wait)

    const evaluated = await client.send('Runtime.evaluate', {
      expression: PAGE_TIMINGS,
      returnByValue: true,
    })
    const timings = evaluated?.result?.value ?? {}
    record.timings = timings
    record.firstContentMs = timings.firstContentMs ?? null
    record.webglContextCount = timings.webglContextCount ?? 0
    record.title = timings.title ?? null
    record.pageSize = {
      width: timings.scrollWidth ?? null,
      height: timings.scrollHeight ?? null,
    }

    const buffer = await captureScreenshot(client)
    const fileName = `${routeSlug(route)}-${state.mode}.png`
    const dir = join(state.outDir, viewportName)
    await mkdir(dir, { recursive: true })
    const filePath = join(dir, fileName)
    await writeFile(filePath, buffer)
    record.screenshot = pathRelative(state.outDir, filePath)
    record.screenshotBytes = buffer.length
  } finally {
    state.current = null
  }

  return record
}

/** Путь артефакта относительно каталога отчёта — для читаемого JSON. */
function pathRelative(base, full) {
  return full.startsWith(base) ? full.slice(base.length).replace(/^[\\/]/, '') : full
}

/* ==== Отчёт ============================================================= */

/** Человекочитаемая сводка по прогону. */
function renderReportMarkdown(report) {
  const lines = []
  lines.push(`# Browser QA — BMSTUDvach`)
  lines.push('')
  lines.push(`- Сгенерировано: ${report.generatedAt}`)
  lines.push(`- Режим фикстур: \`${report.mode}\``)
  lines.push(`- Вьюпорт(ы): ${report.viewports.join(', ')}`)
  lines.push(`- Ожидание перед снимком: ${report.waitMs} мс`)
  lines.push(`- Reduced motion: ${report.reducedMotion ? 'включён' : 'выключен'}`)
  lines.push(`- Приложение: ${report.appUrl}`)
  lines.push(
    `- Chrome: ${report.chrome?.path ?? '—'} (${report.chrome?.browser ?? '—'})`,
  )
  lines.push(`- Маршрутов снято: ${report.routes.length}`)
  lines.push('')
  lines.push('## Сводка')
  lines.push('')
  lines.push(
    '| Маршрут | Вьюпорт | Снимок | Ошибки | Предупр. | Исключения | Неудачные | Первый кадр, мс | WebGL |',
  )
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const item of report.routes) {
    lines.push(
      `| \`${item.route}\` | ${item.viewport} | ${item.screenshot ?? '—'} | ` +
        `${item.consoleErrors.length} | ${item.consoleWarnings.length} | ` +
        `${item.pageErrors.length} | ${item.failedRequests.length} | ` +
        `${item.firstContentMs ?? '—'} | ${item.webglContextCount} |`,
    )
  }
  lines.push('')

  const withErrors = report.routes.filter(
    (item) =>
      item.consoleErrors.length ||
      item.pageErrors.length ||
      item.failedRequests.length ||
      item.consoleWarnings.length,
  )
  lines.push('## Ошибки, исключения и неудачные запросы')
  lines.push('')
  if (!withErrors.length) {
    lines.push(
      'Чисто: ни одной ошибки консоли, ни одного исключения, ни одного упавшего запроса.',
    )
  } else {
    for (const item of withErrors) {
      lines.push(`### \`${item.route}\` (${item.viewport}, режим ${item.mode})`)
      lines.push('')
      for (const error of item.consoleErrors) lines.push(`- ошибка консоли: ${error}`)
      for (const warning of item.consoleWarnings)
        lines.push(`- предупреждение: ${warning}`)
      for (const error of item.pageErrors) lines.push(`- исключение: ${error}`)
      for (const failure of item.failedRequests) {
        lines.push(`- неудачный запрос: ${failure.reason} — ${failure.url}`)
      }
      lines.push('')
    }
  }

  lines.push('## Подменённые запросы API')
  lines.push('')
  for (const item of report.routes) {
    lines.push(`### \`${item.route}\` (${item.viewport})`)
    lines.push('')
    if (!item.apiCalls.length) {
      lines.push('- запросов к API не было')
    } else {
      for (const call of item.apiCalls) {
        lines.push(`- ${call.method} ${call.path} → ${call.status}`)
      }
    }
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

/* ==== CLI =============================================================== */

const HELP = `
browser-qa — визуальный QA-харнесс BMSTUDvach (реальный Chrome через CDP)

Использование:
  node scripts/browser-qa.mjs [флаги]

Флаги:
  --routes=<список>      Маршруты через запятую. По умолчанию — весь роутер:
                          ${DEFAULT_ROUTES.join(', ')}
  --viewport=<имя>       desktop (1440×900), wide (1920×1080),
                          mobile (390×844), narrow (320×720) или all.
                          По умолчанию desktop.
  --mode=<режим>         ok | empty | error | offline — режим фикстур.
                          По умолчанию ok.
  --out=<каталог>        Куда складывать артефакты. По умолчанию
                          frontend/.qa-artifacts/<метка времени>.
  --wait=<мс>            Ожидание перед снимком (по умолчанию 1500).
                          Снимок снимается ПОСЛЕ паузы, чтобы анимации
                          появления завершились.
  --reduced-motion       Эмулировать prefers-reduced-motion: reduce —
                          детерминированные снимки без движения.
  --base=<url>           Готовый адрес приложения вместо сборки и
                          vite preview.
  --help, -h             Эта справка.

Артефакты:
  <out>/<вьюпорт>/<маршрут>-<режим>.png   снимки
  <out>/report.json                        сводка по маршрутам
  <out>/report.md                          человекочитаемая сводка

Примеры:
  node scripts/browser-qa.mjs --routes=/,/platinum --viewport=desktop
  node scripts/browser-qa.mjs --routes=/ --viewport=mobile --mode=error
  node scripts/browser-qa.mjs --viewport=all --mode=empty --out=.qa-artifacts/empty
`

/** Разбор аргументов командной строки. */
export function parseArgs(argv) {
  const options = {
    routes: null,
    viewport: 'desktop',
    mode: 'ok',
    out: null,
    wait: 1500,
    reducedMotion: false,
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
      case '--viewport':
        options.viewport = takeValue().trim()
        break
      case '--mode':
        options.mode = takeValue().trim()
        break
      case '--out':
        options.out = takeValue().trim()
        break
      case '--wait': {
        const value = Number(takeValue())
        if (!Number.isFinite(value) || value < 0) {
          throw new Error(`Флаг --wait ждёт число миллисекунд, получено «${value}».`)
        }
        options.wait = value
        break
      }
      case '--base':
        options.base = takeValue().trim()
        break
      case '--reduced-motion':
        options.reducedMotion = true
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
  if (!options.routes || !options.routes.length) options.routes = [...DEFAULT_ROUTES]

  return options
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
      'Chrome не найден — съёмка невозможна.\n' +
        'Установите Google Chrome или задайте путь к браузеру в переменной CHROME_PATH.\n' +
        'Искали: CHROME_PATH, /Applications/Google Chrome.app/Contents/MacOS/Google Chrome, ' +
        '/Applications/Chromium.app/Contents/MacOS/Chromium, google-chrome, chromium, chrome.',
    )
    return 1
  }

  const viewports =
    options.viewport === 'all' ? Object.keys(VIEWPORTS) : [options.viewport]

  const outDir = options.out
    ? resolve(root, options.out)
    : join(root, '.qa-artifacts', new Date().toISOString().replace(/[:.]/g, '-'))
  await mkdir(outDir, { recursive: true })

  let server = null
  let chrome = null
  let client = null

  try {
    if (options.base) {
      server = { child: null, baseUrl: options.base.replace(/\/$/, '') }
      console.log(`[browser-qa] приложение: ${server.baseUrl} (из --base)`)
    } else {
      server = await startAppServer()
      console.log(`[browser-qa] приложение: ${server.baseUrl} (vite preview)`)
    }

    chrome = await launchChrome(chromePath)
    console.log(`[browser-qa] chrome: ${chrome.browser} (порт ${chrome.port})`)

    const target = await createTarget(chrome.port)
    client = await CdpClient.connect(target.webSocketDebuggerUrl)
    console.log(`[browser-qa] вкладка: ${target.id}`)

    const state = {
      mode: options.mode,
      baseUrl: server.baseUrl,
      outDir,
      wait: options.wait,
      reducedMotion: options.reducedMotion,
      current: null,
    }

    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('Network.enable')
    await client.send('Log.enable')
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: PAGE_INSTRUMENT,
    })
    try {
      // Service worker кэширует оболочку — для съёмки он лишний.
      await client.send('Network.setBypassServiceWorker', { bypass: true })
    } catch {
      /* метод может отсутствовать в старых сборках Chrome */
    }
    attachPageListeners(client, state)
    attachApiInterceptor(client, state)
    await client.send('Fetch.enable', {
      patterns: [{ urlPattern: API_PATTERN, requestStage: 'Request' }],
    })

    const routes = []
    for (const viewportName of viewports) {
      for (const route of options.routes) {
        process.stdout.write(`[browser-qa] ${viewportName} ${route} … `)
        const record = await captureRoute(client, state, route, viewportName)
        routes.push(record)
        console.log(
          `ok (кадр ${record.firstContentMs ?? '—'} мс, webgl ${record.webglContextCount}, ` +
            `ошибок ${record.consoleErrors.length + record.pageErrors.length})`,
        )
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      tool: 'browser-qa',
      mode: options.mode,
      viewports,
      requestedRoutes: options.routes,
      waitMs: options.wait,
      reducedMotion: options.reducedMotion,
      appUrl: server.baseUrl,
      chrome: { path: chromePath, browser: chrome.browser, port: chrome.port },
      routes,
    }

    await writeFile(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    await writeFile(join(outDir, 'report.md'), renderReportMarkdown(report))

    console.log('')
    console.log(`[browser-qa] артефакты: ${outDir}`)
    console.log(`[browser-qa] снимков: ${routes.length}`)
    console.log(
      `[browser-qa] отчёты: ${join(outDir, 'report.json')}, ${join(outDir, 'report.md')}`,
    )
    return 0
  } catch (error) {
    console.error(`[browser-qa] провал: ${error.message}`)
    if (process.env.QA_DEBUG) console.error(error)
    return 1
  } finally {
    try {
      client?.close()
    } catch {
      /* уже закрыт */
    }
    if (chrome?.child) {
      killTree(chrome.child, 'SIGTERM')
      await sleep(200)
      killTree(chrome.child, 'SIGKILL')
      if (chrome.userDataDir) {
        await rm(chrome.userDataDir, { recursive: true, force: true }).catch(() => {})
      }
    }
    if (server?.child) {
      killTree(server.child, 'SIGTERM')
      await sleep(200)
      killTree(server.child, 'SIGKILL')
    }
  }
}

const code = await main()
process.exit(code)
