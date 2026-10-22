#!/usr/bin/env node
/**
 * cdp — общий мини-CDP-клиент браузерного QA-контура BMSTUDvach.
 *
 * Один слой на несколько потребителей: `browser-qa.mjs` (снимки),
 * `perf-audit.mjs` (перф-проба) и, позже, `visual-regression.mjs`.
 * Ни одной зависимости: голый Node ≥ 22 с встроенными `WebSocket` и
 * `fetch` — CDP разговаривает сам с собой.
 *
 * Что внутри:
 *   — поиск Chrome в системе и запуск его в headless с DevTools;
 *   — подключение к вкладке и обмен CDP-командами/событиями;
 *   — перехват запросов через домен `Fetch` (подмена ответа задаёт
 *     вызывающий — здесь нет знания о фикстурах);
 *   — навигация, снятие скриншота, освобождение процессов.
 *
 * Почему отдельный файл, а не копия в каждом инструменте: логика CDP
 * одинакова для всех, но расходиться копиям нельзя — отсюда один
 * модуль, который ничего не знает про конкретные отчёты.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..') // frontend/

/** Таймаут одной CDP-команды по умолчанию, мс. */
export const STEP_TIMEOUT = 30000

/** Куда перехватываем API (тот же префикс, что в `src/api/client.ts`). */
export const API_PATTERN = 'http://localhost:8000/api/v1/*'

/** Вьюпорты съёмки — общие для всех инструментов. */
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900, mobile: false },
  wide: { width: 1920, height: 1080, mobile: false },
  mobile: { width: 390, height: 844, mobile: true },
  narrow: { width: 320, height: 720, mobile: true },
}

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
 * Флаги Chrome.
 *
 * `--enable-unsafe-swiftshader` вместе с `--use-gl=angle
 * --use-angle=swiftshader` включает программный WebGL 2.0 — без него
 * headless-Chrome не отдаёт контекст и 3D-сцена снимается пустой.
 *
 * Остальные флаги — про честность измерений:
 *   — `--enable-precise-memory-info` снимает квантизацию heap до 5 МБ;
 *   — `--js-flags=--expose-gc` открывает `window.gc()`, без него снимок
 *     памяти — лотерея: в куче может лежать мусор от предыдущего кадра;
 *   — `--disable-background-timer-throttling` и его соседи не дают
 *     headless-вкладке уйти в троттлинг (иначе rAF встаёт и FPS врёт).
 */
export const CHROME_FLAGS = [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--enable-precise-memory-info',
  '--js-flags=--expose-gc',
  '--force-device-scale-factor=1',
]

/* ==== Мелкие утилиты ==================================================== */

/** Пауза в миллисекундах. */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Свободный TCP-порт: сервер слушает на 0 и сразу освобождает порт. */
export function freePort() {
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
export function which(name) {
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

/** Убить процесс вместе с потомками (spawn порождает детей). */
export function killTree(child, signal = 'SIGTERM') {
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

/* ==== Chrome ============================================================= */

/**
 * Путь к Chrome или null, если браузера в системе нет.
 *
 * `CHROME_PATH` — точное указание: если он задан, но файла нет, молча
 * подставлять другой браузер нельзя (пользователь ждёт именно его),
 * поэтому в этом случае возвращаем null и честно объясняем проблему в выводе.
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

/**
 * Запуск Chrome в headless с DevTools.
 *
 * Сначала пробуем `--remote-debugging-port=0`: тогда Chrome сам выбирает
 * свободный порт и пишет его в `DevToolsActivePort`. Если файл не
 * появился — перезапускаем с явным свободным портом (иначе повторный
 * запуск падал бы на занятом порту).
 */
export async function launchChrome(chromePath, extraFlags = []) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'bmstudvach-qa-chrome-'))
  const spawnChrome = (port) =>
    spawn(
      chromePath,
      [
        ...CHROME_FLAGS,
        ...extraFlags,
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

/** Остановить Chrome и убрать его профиль. */
export async function stopChrome(chrome) {
  if (!chrome) return
  killTree(chrome.child, 'SIGTERM')
  await sleep(200)
  killTree(chrome.child, 'SIGKILL')
  if (chrome.userDataDir) {
    await rm(chrome.userDataDir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Новая вкладка Chrome; возвращает её `webSocketDebuggerUrl`. */
export async function createTarget(port) {
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

/* ==== CDP-клиент ======================================================== */

/**
 * Минимальный CDP-клиент на встроенном `WebSocket` Node.
 *
 * Прямое подключение к вкладке (а не к браузеру) — достаточно: нужны
 * только домены страницы, и заодно не тянутся цели браузера.
 */
export class CdpClient {
  #socket = null
  #nextId = 0
  #pending = new Map()
  #listeners = new Map()
  #closed = false

  constructor(url, label = 'cdp') {
    this.url = url
    this.label = label
  }

  static async connect(url, timeoutMs = STEP_TIMEOUT, label = 'cdp') {
    const client = new CdpClient(url, label)
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
        console.error(`[${this.label}] обработчик ${message.method}: ${error.message}`)
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

/* ==== Приложение ======================================================== */

/**
 * Поднять собранное приложение.
 *
 * Нужен готовый `dist` — инструменты меряют РЕАЛЬНЫЙ билд, а не исходники.
 * Если сборки нет, честно говорим об этом и выходим с кодом 1.
 */
export async function startAppServer(appRoot = root) {
  const distIndex = join(appRoot, 'dist', 'index.html')
  if (!existsSync(distIndex)) {
    throw new Error(
      'Нет собранного приложения: frontend/dist/index.html не найден. ' +
        'Сначала выполните `npm run build` в папке frontend.',
    )
  }

  const port = await freePort()
  const args = ['vite', 'preview', '--port', String(port), '--strictPort']
  const localBin = join(appRoot, 'node_modules', '.bin', 'vite')
  const command = existsSync(localBin) ? localBin : 'npx'
  const spawnArgs = existsSync(localBin) ? args.slice(1) : args

  const child = spawn(command, spawnArgs, {
    cwd: appRoot,
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

/** Остановить поднятое приложение. */
export async function stopAppServer(server) {
  if (!server?.child) return
  killTree(server.child, 'SIGTERM')
  await sleep(200)
  killTree(server.child, 'SIGKILL')
}

/* ==== Перехват запросов ================================================= */

/**
 * CORS-заголовки для подменённого ответа.
 *
 * Фронт ходит в API с `credentials: 'include'` и с заголовком
 * `Content-Type: application/json`, поэтому браузер спрашивает
 * preflight и требует честного `Access-Control-Allow-Origin`
 * (не `*` — с credentials звёздочка запрещена).
 */
export function corsHeaders(request) {
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

/**
 * Перехват запросов через домен `Fetch`.
 *
 * Знания о фикстурах здесь нет: вызывающий сам решает, что ответить,
 * и отдаёт `{ status, body }` либо `{ offline: true }` (запрос рвётся
 * на уровне сети). Так клиент остаётся пригодным для любых сценариев.
 *
 * @param {CdpClient} client
 * @param {{resolve?: (request: any) => ({status?: number, body?: unknown, offline?: boolean} | undefined), onRequest?: (info: any) => void}} options
 */
export function attachFetchInterceptor(client, options = {}) {
  const resolve = typeof options.resolve === 'function' ? options.resolve : null
  const onRequest = typeof options.onRequest === 'function' ? options.onRequest : null

  client.on('Fetch.requestPaused', async (params) => {
    const { requestId, request } = params
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
      const answer = resolve ? resolve(request) : undefined
      if (!answer) {
        await client.send('Fetch.continueRequest', { requestId })
        return
      }

      if (answer.offline) {
        await client.send('Fetch.failRequest', {
          requestId,
          errorReason: 'ConnectionFailed',
        })
        onRequest?.({ method: request.method, path: url.pathname, status: 'failed' })
        return
      }

      const status = Number.isFinite(answer.status) ? answer.status : 200
      await client.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: status,
        responseHeaders: [
          ...corsHeaders(request),
          { name: 'Content-Type', value: 'application/json; charset=utf-8' },
        ],
        body: Buffer.from(JSON.stringify(answer.body ?? null)).toString('base64'),
      })
      onRequest?.({ method: request.method, path: url.pathname, status })
    } catch (error) {
      console.error(`[${client.label}] подмена запроса не удалась: ${error.message}`)
      try {
        await client.send('Fetch.continueRequest', { requestId })
      } catch {
        /* запрос уже закрыт */
      }
    }
  })
}

/* ==== Страница ========================================================== */

/** Переход на маршрут с ожиданием загрузки. */
export async function navigate(client, url, timeoutMs = STEP_TIMEOUT) {
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
export async function captureScreenshot(client) {
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
 * Оценить выражение в странице и вернуть его значение.
 *
 * `awaitPromise` нужен для измерений, которые сами ждут (например, окно
 * FPS): без него ответ пришёл бы мгновенно, до конца измерения.
 */
export async function evaluate(client, expression, { awaitPromise = false, timeoutMs = STEP_TIMEOUT } = {}) {
  const response = await client.send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise },
    timeoutMs,
  )
  if (response?.exceptionDetails) {
    const details = response.exceptionDetails
    throw new Error(
      `Ошибка в странице: ${details.exception?.description ?? details.text ?? 'неизвестно'}`,
    )
  }
  return response?.result?.value ?? null
}
