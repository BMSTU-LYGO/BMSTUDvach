#!/usr/bin/env node
/**
 * qa-motion-frames — серия кадров анимаций в НАСТОЯЩЕМ Chrome.
 *
 * Зачем он нужен: «анимация выглядит нормально» — не проверка. Один снимок
 * не показывает ни «застрявшего» элемента (текст не виден, `opacity: 0`),
 * ни «прыжка» в финальном кадре, ни двойной анимации одного свойства
 * (CSS transition + GSAP tween), ни «мигания». Нужна серия кадров одной и той
 * же сцены — снятая с интервалом, — плюс измерение состояния DOM в каждом
 * кадре.
 *
 * Что делает скрипт:
 *   1. поднимает настоящий Chrome через CDP (тот же путь, что `browser-qa.mjs`,
 *      но этот скript — отдельный слой и общий харнесс не трогает);
 *   2. подменяет API детерминированными ответами (`qa-fixtures.mjs`);
 *   3. для каждой сцены снимает серию кадров (PNG) и в каждом кадре
 *      ЗАМЕРЯЕТ состояние DOM: прозрачность, transform, маски, анимации;
 *   4. для каждой сцены снимает такую же серию при
 *      `prefers-reduced-motion: reduce` — эталон «статичного» кадра;
 *   5. сравнивает финальные кадры (движение ↔ статика) — это и есть проверка
 *      «нет прыжка», и сверка «при reduced-motion контент виден»;
 *   6. пишет `report.json` + `report.md` рядом с кадрами.
 *
 * Ограничения, которые здесь принципиальны:
 *   — ни одной новой зависимости: голый Node (≥ 22) с встроенными
 *     `WebSocket` и `fetch`;
 *   — приложение не трогается: скрипт живёт целиком в `scripts/`;
 *   — данные детерминированы: снимок сегодня сравним со снимком завтра.
 *
 * Использование:
 *   node scripts/qa-motion-frames.mjs --scenes=home,board,thread --viewport=desktop
 *   node scripts/qa-motion-frames.mjs --help
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

/** Кадры по умолчанию: от первого кадра до устоявшегося состояния. */
const DEFAULT_FRAMES = [0, 100, 250, 500, 900, 1500, 2200]

/**
 * Кадры для сцен с действием: переход живёт 150–600 мс, поэтому шаг здесь
 * мельче — иначе начало анимации не попадёт в кадр.
 */
const ACTION_FRAMES = [0, 30, 80, 150, 250, 400, 700]

/**
 * Сцены — те переходы, ради которых снимается серия.
 *
 * `route` — куда идём; `action` — что делаем ПОСЛЕ загрузки (клик по
 * селектору). Для сцен без действия отсчёт кадров идёт от `load`.
 */
const SCENES = {
  home: { route: '/', label: 'Главная: появление героя и секций' },
  board: { route: '/boards/general', label: 'Раздел: появление списка тредов' },
  thread: { route: '/threads/1', label: 'Тред: появление постов' },
  platinum: { route: '/platinum/1', label: 'Платиновая история: появление' },
  lens: {
    route: '/threads/1',
    label: 'Command Lens: открытие оверлея',
    action: { selector: '[data-testid="dock-lens"]', kind: 'click' },
  },
  bay: {
    route: '/boards/general',
    label: 'Launch Bay: открытие оверлея',
    action: { selector: '.launch-trigger', kind: 'click' },
  },
  search: {
    route: '/threads/1',
    label: 'Панель поиска в треде: раскрытие',
    action: { selector: '[data-testid="thread-search-toggle"]', kind: 'click' },
  },
  morph: {
    route: '/',
    label: 'Переход маршрута: карточка раздела → раздел',
    action: { selector: '.board-card-3d a, .board-card-3d', kind: 'click' },
  },
  panels: {
    route: '/',
    label: 'Главная: панели Watch/Drafts (нужен посев localStorage)',
    seed: 'panels',
  },
  'panels-view': {
    route: '/',
    label: 'Главная: панели Watch/Drafts в кадре (прокрутка вниз)',
    action: { selector: null, kind: 'scroll' },
  },
}
/**
 * Посев localStorage: Watch Panel и Drafts Panel читают локальное хранилище
 * и без него просто не существуют. Данные фиксированы (никаких «сейчас»),
 * чтобы кадры оставались сравнимыми.
 */
const SEED_SCRIPT = `
(() => {
  try {
    localStorage.setItem('bmstudvach-watchlist', JSON.stringify([
      { threadId: 1, title: 'Как сдать экзамен по матанализу, если ты не спал три ночи', seenReplies: 40, updatedAt: 1773478800000 },
      { threadId: 2, title: 'Расписание пар на весенний семестр — собираем в один тред', seenReplies: 118, updatedAt: 1773478700000 },
    ]));
    localStorage.setItem('draft:signal-1', JSON.stringify({
      body: 'Черновик ответа в треде #1 — проверка панели черновиков.',
      files: [],
      timestamp: 1773478800000,
    }));
    localStorage.setItem('draft:launch-general', JSON.stringify({
      title: 'Черновик нового треда',
      body: 'Тело черновика треда для раздела general.',
      files: [{ name: 'схема.png', size: 20480 }],
      timestamp: 1773478700000,
    }));
  } catch (error) {
    /* хранилище недоступно — сцены без панелей всё равно снимаются */
  }
})()
`

/**
 * Каталог «приборного» языка: элементы, у которых должна быть ОДИНАКОВАЯ
 * подпись в пределах роли. Сравнивать их между ролями бессмысленно, а вот
 * разъезд внутри роли — это ровно тот дефект, который ищем.
 */
const CONSISTENCY_GROUPS = {
  'кнопки': [
    '.overlay-cta',
    '.launch-trigger',
    '.watch-toggle',
    '.thread-search-toggle',
    '.lens__item',
    '.thread-search__close',
  ],
  'микро-лейблы': [
    '.meta-label',
    '.label-index',
    '.label-meta',
    '.lens__kicker',
    '.card-slug',
    '.thread-pin__label',
  ],
  'панели и карточки': [
    '.surface-paper',
    '.board-card-3d',
    '.thread-item',
    '.lens',
    '.thread-search',
    '.watch',
    '.post-item',
  ],
}

/** Все селекторы, которые снимаем в каждом кадре. */
const CONSISTENCY_SELECTORS = [...new Set(Object.values(CONSISTENCY_GROUPS).flat())]

/**
 * Замер состояния DOM в одном кадре.
 *
 * Собираем ровно то, что нужно для проверок:
 *   — `hidden` — элементы с размером, но прозрачностью 0 (кандидаты в
 *     «застрявшее» стартовое состояние);
 *   — `tracked` — элементы, которые двигаются или несут анимацию
 *     (прозрачность < 1, transform, transition, animation, `data-testid`);
 *   — `masks` — насколько текст под маской (KineticText) виден в кадре;
 *   — `anims` — живые CSS-анимации и переходы (Web Animations API).
 */
const PROBE = `
(() => {
  const CONSISTENCY_SELECTORS = ${JSON.stringify(CONSISTENCY_SELECTORS)}
  const path = (el) => {
    const parts = []
    let node = el
    let depth = 0
    while (node && node.nodeType === 1 && depth < 10) {
      depth += 1
      let part = node.tagName.toLowerCase()
      if (node.id) {
        parts.unshift('#' + node.id)
        break
      }
      const parent = node.parentElement
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName)
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')'
      }
      parts.unshift(part)
      node = node.parentElement
    }
    return parts.join('>')
  }

  const num = (value) => {
    const parsed = parseFloat(value)
    return Number.isFinite(parsed) ? Math.round(parsed * 1000) / 1000 : null
  }

  const hidden = []
  const tracked = []
  const all = document.querySelectorAll('body *')

  for (const el of all) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    const opacity = num(cs.opacity) ?? 1
    const transform = cs.transform
    const translate = cs.translate
    const hasTransition = cs.transitionProperty && cs.transitionProperty !== 'none'
    const hasAnimation = cs.animationName && cs.animationName !== 'none'
    const testid = el.getAttribute('data-testid')

    if (opacity <= 0.02) {
      hidden.push({
        path: path(el),
        tag: el.tagName.toLowerCase(),
        testid: testid || null,
        cls: (el.getAttribute('class') || '').slice(0, 120),
        opacity: opacity,
        ariaHidden: el.getAttribute('aria-hidden') === 'true',
        area: Math.round(rect.width * rect.height),
        rect: {
          x: Math.round(rect.left + scrollX),
          y: Math.round(rect.top + scrollY),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
        text: (el.textContent || '').trim().slice(0, 60),
      })
      continue
    }

    const interesting =
      testid ||
      opacity < 0.995 ||
      (transform && transform !== 'none') ||
      (translate && translate !== 'none') ||
      hasTransition ||
      hasAnimation ||
      el.hasAttribute('aria-hidden')

    if (!interesting) continue

    const transitionProperty = cs.transitionProperty
    const transitionDuration = cs.transitionDuration
    const inline = el.style
    tracked.push({
      path: path(el),
      tag: el.tagName.toLowerCase(),
      testid: testid || null,
      cls: (el.getAttribute('class') || '').slice(0, 120),
      opacity: opacity,
      transform: transform,
      translate: translate,
      filter: cs.filter,
      backdropFilter: cs.backdropFilter,
      boxShadow: cs.boxShadow === 'none' ? null : 'set',
      transitionProperty: transitionProperty,
      transitionDuration: transitionDuration,
      animationName: cs.animationName,
      willChange: cs.willChange,
      inlineTransform: inline.transform || null,
      inlineOpacity: inline.opacity || null,
      inlineTranslate: inline.translate || null,
      area: Math.round(rect.width * rect.height),
      rect: {
        x: Math.round(rect.left + scrollX),
        y: Math.round(rect.top + scrollY),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
      text: (el.textContent || '').trim().slice(0, 60),
    })
  }

  const masks = []
  for (const mask of document.querySelectorAll('[data-testid="kinetic-mask"]')) {
    const mr = mask.getBoundingClientRect()
    for (const piece of mask.querySelectorAll('[data-testid="kinetic-piece"]')) {
      const pr = piece.getBoundingClientRect()
      const visible =
        Math.max(0, Math.min(mr.bottom, pr.bottom) - Math.max(mr.top, pr.top))
      masks.push({
        maskPath: path(mask),
        piecePath: path(piece),
        visibleRatio:
          mr.height > 0 ? Math.round((visible / mr.height) * 100) / 100 : 1,
        text: (piece.textContent || '').trim().slice(0, 40),
      })
    }
  }

  const anims = []
  for (const a of document.getAnimations()) {
    const target = a.effect && a.effect.target
    const timing = a.effect && a.effect.getTiming ? a.effect.getTiming() : null
    anims.push({
      kind: a.constructor && a.constructor.name,
      name: a.animationName || a.transitionProperty || '',
      target: target ? path(target) : null,
      state: a.playState,
      duration: timing && Number.isFinite(timing.duration) ? timing.duration : null,
    })
  }

  // Кнопки без типографического сброса: в Chrome <button> по умолчанию
  // рисуется системным Arial 13.33px. Если сброса нет, часть кнопок
  // выпадает из шрифтовой системы интерфейса.
  const uaFontButtons = []
  for (const button of document.querySelectorAll('button')) {
    const cs = getComputedStyle(button)
    if (!/^Arial/.test(cs.fontFamily)) continue
    const rect = button.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    uaFontButtons.push({
      path: path(button),
      testid: button.getAttribute('data-testid') || null,
      cls: (button.getAttribute('class') || '').slice(0, 100),
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      text: (button.textContent || '').trim().slice(0, 40),
    })
  }

  // Подписи «приборного» языка: одинаковые ли кнопки, микро-лейблы и
  // панели выглядят одинаково на разных экранах. Снимаем подпись стиля
  // и сравниваем между сценами уже в Node.
  const SIGNATURE_PROPS = [
    'fontSize',
    'fontFamily',
    'fontWeight',
    'letterSpacing',
    'textTransform',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderRadius',
    'borderTopWidth',
    'borderTopColor',
    'borderBottomWidth',
    'backgroundColor',
    'minHeight',
    'gap',
  ]
  const signatures = {}
  for (const sel of CONSISTENCY_SELECTORS) {
    const el = document.querySelector(sel)
    if (!el) continue
    const cs = getComputedStyle(el)
    const signature = {}
    for (const prop of SIGNATURE_PROPS) signature[prop] = cs[prop]
    signature.height = Math.round(el.getBoundingClientRect().height)
    signatures[sel] = signature
  }

  // Точечная проверка «а что вообще объявлено у этого элемента» — по
  // каталогу селекторов, ради которого и снимается серия.
  const named = {}
  for (const sel of [
    '[data-testid="command-lens"]',
    '[data-testid="thread-search"]',
    '.launch-bay',
    '.threads-list',
    '.catalog-grid',
    '.posts',
    '.post-item',
    '.thread-item',
    '.board-card-3d',
    '.boards-grid',
  ]) {
    const el = document.querySelector(sel)
    if (!el) continue
    const cs = getComputedStyle(el)
    named[sel] = {
      transitionProperty: cs.transitionProperty,
      transitionDuration: cs.transitionDuration,
      animationName: cs.animationName,
      opacity: num(cs.opacity),
      transform: cs.transform,
    }
  }

  return {
    t: Math.round(performance.now()),
    scrollY: Math.round(scrollY),
    docHeight: Math.round(document.documentElement.scrollHeight),
    reducedMotion:
      typeof matchMedia === 'function'
        ? matchMedia('(prefers-reduced-motion: reduce)').matches
        : null,
    noPreference:
      typeof matchMedia === 'function'
        ? matchMedia('(prefers-reduced-motion: no-preference)').matches
        : null,
    hidden,
    tracked,
    masks,
    anims,
    named,
    signatures,
    uaFontButtons,
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
const CHROME_NAMES = ['google-chrome', 'chromium', 'chrome']

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

/* ==== CDP-клиент ======================================================== */

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
        console.error(`[qa-motion-frames] обработчик ${message.method}: ${error.message}`)
      }
    }
  }

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

async function launchChrome(chromePath) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'bmstudvach-frames-chrome-'))
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
      const { status, body, offline } = fixturesFor(url.pathname, state.mode, request.method)

      if (offline) {
        await client.send('Fetch.failRequest', {
          requestId,
          errorReason: 'ConnectionFailed',
        })
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
        record.apiCalls.push({ method: request.method, path: url.pathname, status })
      }
    } catch (error) {
      console.error(`[qa-motion-frames] подмена запроса не удалась: ${error.message}`)
      try {
        await client.send('Fetch.continueRequest', { requestId })
      } catch {
        /* запрос уже закрыт */
      }
    }
  })
}

/* ==== Съёмка ============================================================ */

/** Переход на маршрут с ожиданием загрузки (ожидание можно не ждать). */
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
  return { loaded, result }
}

/** Дождаться `load`, не бросая при таймауте: кадры снимаются и без него. */
async function waitLoad(loaded, timeoutMs = STEP_TIMEOUT) {
  try {
    await Promise.race([
      loaded,
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ])
  } catch {
    /* страница не догрузилась — кадры всё равно снимем */
  }
}

/** Снимок видимой области (не всей страницы): кадр — это то, что видит глаз. */
async function captureViewport(client) {
  const shot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  })
  return Buffer.from(shot.data, 'base64')
}

async function evaluate(client, expression) {
  const evaluated = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: false,
  })
  if (evaluated?.exceptionDetails) {
    throw new Error(
      `Runtime.evaluate: ${evaluated.exceptionDetails.exception?.description ?? evaluated.exceptionDetails.text}`,
    )
  }
  return evaluated?.result?.value ?? null
}

/**
 * Серия кадров одной сцены.
 *
 * `t0` — момент, от которого считаются кадры:
 *   — для сцены БЕЗ действия это момент ЗАПРОСА навигации («0 мс после
 *     навигации»: так видно и загрузку, и само появление);
 *   — для сцены С действием это момент клика (действие запускает переход,
 *     а страница к этому моменту уже устоялась).
 *
 * Кадр снимается в вьюпорт: полный скриншот всей страницы смешивал бы
 * «что видит глаз» с «что есть в DOM».
 */
async function captureSeries(client, state, scene, viewportName, mode) {
  const spec = SCENES[scene]
  const viewport = VIEWPORTS[viewportName]
  const record = {
    scene,
    label: spec.label,
    route: spec.route,
    viewport: viewportName,
    mode,
    frames: [],
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    apiCalls: [],
    actionError: null,
  }
  state.current = record

  try {
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
      features:
        mode === 'reduced'
          ? [{ name: 'prefers-reduced-motion', value: 'reduce' }]
          : // Явно «no-preference»: headless Chrome по умолчанию отдаёт
            // `reduce`, и без этого «серия с движением» снимала бы страницу
            // с выключенной анимацией.
            [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    })

    const url = `${state.baseUrl}${spec.route}`
    const navStart = Date.now()
    const { loaded } = await navigate(client, url)
    // Кадры сцены: явный список из CLI важнее, иначе — свой набор для
    // сцен с действием (переход живёт 150–600 мс, шаг должен быть мельче).
    const sceneFrames = state.framesExplicit
      ? state.frames
      : spec.action
        ? ACTION_FRAMES
        : DEFAULT_FRAMES

    let t0 = navStart
    if (spec.action) {
      // Страница должна устояться до клика: иначе кадр покажет загрузку,
      // а не переход.
      await waitLoad(loaded)
      await sleep(state.settle)
      // Замер ДО действия: без него нельзя отличить «появилось и уехало»
      // от «появилось жёстким катом» — первый кадр снимается уже после
      // того, как Vue обновил DOM.
      record.preProbe = await evaluate(client, PROBE)
      if (spec.action.kind === 'scroll') {
        await evaluate(
          client,
          `(() => { window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' }); return 'scrolled' })()`,
        )
      } else {
        const clicked = await evaluate(
          client,
          `(() => {
            const el = document.querySelector(${JSON.stringify(spec.action.selector)})
            if (!el) return 'not-found'
            const target = el.tagName === 'A' ? el : (el.querySelector('a') || el)
            target.click()
            return 'clicked'
          })()`,
        )
        if (clicked !== 'clicked') {
          record.actionError = `элемент ${spec.action.selector} не найден (${clicked})`
        }
      }
      t0 = Date.now()
    } else {
      // Сцена без действия: ждём загрузку, но кадры считаем от навигации.
      await waitLoad(loaded)
    }

    for (const offset of sceneFrames) {
      const due = t0 + offset
      const wait = due - Date.now()
      if (wait > 0) await sleep(wait)
      const startedMs = Date.now() - t0
      const buffer = await captureViewport(client)
      const capturedMs = Date.now() - t0
      const probe = await evaluate(client, PROBE)
      const probedMs = Date.now() - t0
      const fileName = `frame-${String(offset).padStart(4, '0')}ms.png`
      const dir = join(state.outDir, viewportName, scene, mode)
      await mkdir(dir, { recursive: true })
      const filePath = join(dir, fileName)
      await writeFile(filePath, buffer)
      record.frames.push({
        offset,
        actualMs: capturedMs,
        startedMs,
        capturedMs,
        probedMs,
        screenshot: filePath.slice(state.outDir.length).replace(/^[\\/]/, ''),
        probe,
      })
    }
  } finally {
    state.current = null
  }

  return record
}

/* ==== Анализ ============================================================ */

/** Площадь поверхности, начиная с которой тень/фильтр считаются «дорогими». */
const LARGE_SURFACE_AREA = 40000

/** Порог расхождения финального кадра, px. */
const JUMP_PX = 2

/** Порог расхождения прозрачности. */
const OPACITY_DELTA = 0.05

function byPath(items) {
  const map = new Map()
  for (const item of items) map.set(item.path, item)
  return map
}

/** Элемент, «застрявший» в стартовом состоянии, в финальном кадре. */
function findStuck(frame) {
  const out = []
  for (const item of frame.probe.hidden) {
    // Скрытая копия текста для скринридера — служебная, её прятать нужно.
    if (item.cls && item.cls.includes('kinetic-text__sr')) continue
    // Декоративные элементы (aria-hidden) имеют право быть прозрачными.
    if (item.ariaHidden) continue
    // Служебные поля ввода размером 1×1 — не «застрявший» контент.
    if ((item.area ?? 0) < 4) continue
    out.push(item)
  }
  for (const mask of frame.probe.masks) {
    if (mask.visibleRatio >= 0.6) continue
    out.push({
      path: mask.piecePath,
      tag: 'span',
      testid: 'kinetic-piece',
      cls: 'kinetic-text__piece',
      opacity: 1,
      rect: { x: 0, y: 0, w: 0, h: 0 },
      text: mask.text,
      visibleRatio: mask.visibleRatio,
    })
  }
  return out
}

/** Расхождение финальных кадров «движение» и «статика». */
function compareFinals(motionFrame, reducedFrame) {
  const diffs = []
  const motionItems = byPath(motionFrame.probe.tracked)
  const reducedItems = byPath(reducedFrame.probe.tracked)
  // Мигающие элементы (каретка) сравнивать бессмысленно: в одном прогоне
  // они пойманы в одной фазе, в другом — в противоположной.
  const blinking = new Set(
    (motionFrame.probe.anims ?? [])
      .filter((anim) => anim.kind === 'CSSAnimation')
      .map((anim) => anim.target),
  )
  for (const [key, motionItem] of motionItems) {
    if (blinking.has(key)) continue
    const reducedItem = reducedItems.get(key)
    if (!reducedItem) continue
    const dx = Math.abs(motionItem.rect.x - reducedItem.rect.x)
    const dy = Math.abs(motionItem.rect.y - reducedItem.rect.y)
    const dw = Math.abs(motionItem.rect.w - reducedItem.rect.w)
    const dh = Math.abs(motionItem.rect.h - reducedItem.rect.h)
    const dOpacity = Math.abs(motionItem.opacity - reducedItem.opacity)
    if (
      dx > JUMP_PX ||
      dy > JUMP_PX ||
      dw > JUMP_PX ||
      dh > JUMP_PX ||
      dOpacity > OPACITY_DELTA
    ) {
      diffs.push({
        path: key,
        testid: motionItem.testid,
        cls: motionItem.cls,
        motion: motionItem.rect,
        reduced: reducedItem.rect,
        dx,
        dy,
        dw,
        dh,
        dOpacity: Math.round(dOpacity * 1000) / 1000,
        text: motionItem.text,
      })
    }
  }
  return diffs
}

/**
 * Есть ли у элемента переход вообще.
 *
 * `transition-property` по умолчанию равен `all`, а `transition-duration` —
 * `0s`. Поэтому «есть переход» — это не только свойство, но и ненулевая
 * длительность: иначе в отчёт попадает весь документ.
 */
function transitionActive(item) {
  const props = String(item.transitionProperty || '')
  if (!props || props === 'none') return false
  const durations = String(item.transitionDuration || '').split(',')
  return durations.some((d) => parseFloat(d) > 0)
}

/** Элемент, у которого одно свойство анимируется дважды. */
function findDoubleAnimation(frame) {
  const out = []
  for (const item of frame.probe.tracked) {
    if (!transitionActive(item)) continue
    const props = String(item.transitionProperty || '')
    const list = props.split(',').map((p) => p.trim())
    if (item.inlineTransform && list.includes('transform')) {
      out.push({ ...item, property: 'transform' })
    }
    if (item.inlineOpacity && list.includes('opacity')) {
      out.push({ ...item, property: 'opacity' })
    }
    if (item.inlineTranslate && list.includes('translate')) {
      out.push({ ...item, property: 'translate' })
    }
  }
  return out
}

/** Повторное появление: элемент то исчезает, то появляется снова. */
function findFlicker(frames) {
  const series = new Map()
  for (const frame of frames) {
    for (const item of frame.probe.tracked) {
      if (!series.has(item.path)) series.set(item.path, [])
      series.get(item.path).push({ t: frame.actualMs, opacity: item.opacity, item })
    }
  }
  const out = []
  for (const [key, points] of series) {
    if (points.length < 3) continue
    // «Мигание» — это именно возврат: было видно, стало не видно, снова видно.
    // Простое затухание (элемент гаснет и остаётся гаснуть) — не мигание.
    for (let i = 0; i < points.length - 2; i += 1) {
      for (let j = i + 1; j < points.length - 1; j += 1) {
        for (let k = j + 1; k < points.length; k += 1) {
          if (
            points[i].opacity >= 0.8 &&
            points[j].opacity <= 0.5 &&
            points[k].opacity >= 0.8
          ) {
            out.push({
              path: key,
              testid: points[i].item.testid,
              cls: points[i].item.cls,
              series: points.map((p) => ({ t: p.t, opacity: p.opacity })),
              text: points[i].item.text,
            })
            i = points.length
            break
          }
        }
      }
    }
  }
  return out
}

/** Дорогие для перерисовки свойства в анимации на крупных поверхностях. */
function findExpensiveSurfaces(frame) {
  const out = []
  for (const item of frame.probe.tracked) {
    if (!transitionActive(item)) continue
    const props = String(item.transitionProperty || '')
    const list = props.split(',').map((p) => p.trim())
    const heavy = list.filter((p) =>
      ['box-shadow', 'filter', 'backdrop-filter', 'width', 'height', 'top', 'left'].includes(
        p,
      ),
    )
    if (!heavy.length) continue
    if (item.area < LARGE_SURFACE_AREA) continue
    out.push({ ...item, heavy })
  }
  return out
}

/** Вечный `will-change` и `transition: all` в финальном кадре. */
function findStaticAntiPatterns(frame) {
  const willChange = []
  const transitionAll = []
  for (const item of frame.probe.tracked) {
    if (item.willChange && item.willChange !== 'auto') {
      willChange.push({ ...item, willChange: item.willChange })
    }
    if (item.transitionProperty === 'all' && transitionActive(item)) {
      transitionAll.push(item)
    }
  }
  return { willChange, transitionAll }
}

/**
 * Разница между двумя последними кадрами статичной (reduced) серии.
 *
 * Сравниваются именно последние два кадра: под reduced-motion страница должна
 * УЖЕ стоять. Сравнивать с самым первым кадром бессмысленно — там ещё идёт
 * загрузка и только что открылась панель.
 */
function findReducedMotionDrift(reducedFrames) {
  if (reducedFrames.length < 2) return []
  const first = reducedFrames[reducedFrames.length - 2]
  const last = reducedFrames[reducedFrames.length - 1]
  const firstItems = byPath(first.probe.tracked)
  const lastItems = byPath(last.probe.tracked)
  const out = []
  for (const [key, lastItem] of lastItems) {
    const firstItem = firstItems.get(key)
    if (!firstItem) continue
    const dx = Math.abs(lastItem.rect.x - firstItem.rect.x)
    const dy = Math.abs(lastItem.rect.y - firstItem.rect.y)
    const dOpacity = Math.abs(lastItem.opacity - firstItem.opacity)
    if (dx > JUMP_PX || dy > JUMP_PX || dOpacity > OPACITY_DELTA) {
      out.push({
        path: key,
        testid: lastItem.testid,
        cls: lastItem.cls,
        dx,
        dy,
        dOpacity: Math.round(dOpacity * 1000) / 1000,
        text: lastItem.text,
      })
    }
  }
  return out
}

/**
 * Произошло ли хоть какое-то движение между кадрами.
 *
 * Считаем элементы, у которых между двумя соседними кадрами изменились
 * прозрачность, transform или положение. Если за всю серию не изменилось
 * ничего — сцена не анимируется вовсе: это тоже находка («переход
 * объявлен, но не проигрывается»), и без замера её легко пропустить.
 */
function findMotionActivity(frames, preProbe = null) {
  const changes = []
  let moving = 0
  let appeared = 0
  let disappeared = 0
  // Действие: первый «кадр» — это состояние ДО клика.
  const sequence = preProbe
    ? [
        { actualMs: -1, probe: preProbe },
        ...frames.map((frame) => ({ actualMs: frame.actualMs, probe: frame.probe })),
      ]
    : frames.map((frame) => ({ actualMs: frame.actualMs, probe: frame.probe }))
  for (let index = 1; index < sequence.length; index += 1) {
    const before = byPath(sequence[index - 1].probe.tracked)
    const after = byPath(sequence[index].probe.tracked)
    for (const key of after.keys()) {
      if (!before.has(key)) appeared += 1
    }
    for (const key of before.keys()) {
      if (!after.has(key)) disappeared += 1
    }
    for (const [key, afterItem] of after) {
      const beforeItem = before.get(key)
      if (!beforeItem) continue
      const dOpacity = Math.abs(afterItem.opacity - beforeItem.opacity)
      const transformChanged = afterItem.transform !== beforeItem.transform
      const translateChanged = afterItem.translate !== beforeItem.translate
      const dx = Math.abs(afterItem.rect.x - beforeItem.rect.x)
      const dy = Math.abs(afterItem.rect.y - beforeItem.rect.y)
      if (dOpacity > 0.01 || transformChanged || translateChanged || dx > 1 || dy > 1) {
        moving += 1
        if (changes.length < 12) {
          changes.push({
            path: key,
            testid: afterItem.testid,
            cls: afterItem.cls,
            from: {
              opacity: beforeItem.opacity,
              transform: beforeItem.transform,
              rect: beforeItem.rect,
            },
            to: {
              opacity: afterItem.opacity,
              transform: afterItem.transform,
              rect: afterItem.rect,
            },
            text: afterItem.text,
          })
        }
      }
    }
  }
  return { moving, appeared, disappeared, changes }
}

/* ==== CLI =============================================================== */

const HELP = `
qa-motion-frames — серия кадров анимаций BMSTUDvach (реальный Chrome через CDP)

Использование:
  node scripts/qa-motion-frames.mjs [флаги]

Флаги:
  --scenes=<список>       Сцены через запятую. По умолчанию все:
                          ${Object.keys(SCENES).join(', ')}
  --viewport=<имя>        desktop (1440×900), wide (1920×1080),
                          mobile (390×844), narrow (320×720) или all.
                          По умолчанию desktop.
  --frames=<мс>           Моменты кадров через запятую. По умолчанию
                          ${DEFAULT_FRAMES.join(', ')}
  --out=<каталог>         Куда складывать артефакты. По умолчанию
                          frontend/.qa-artifacts/motion-frames.
  --settle=<мс>           Пауза перед кликом в сценах с действием
                          (страница должна устояться). По умолчанию 900.
  --base=<url>            Готовый адрес приложения вместо сборки и
                          vite preview.
  --no-reduced            Не снимать эталонную серию с
                          prefers-reduced-motion: reduce.
  --help, -h              Эта справка.

Артефакты:
  <out>/<вьюпорт>/<сцена>/motion/frame-<мс>ms.png   кадры с движением
  <out>/<вьюпорт>/<сцена>/reduced/frame-<мс>ms.png  кадры без движения
  <out>/report.json                                 замеры и находки
  <out>/report.md                                   человекочитаемая сводка
`

export function parseArgs(argv) {
  const options = {
    scenes: null,
    viewport: 'desktop',
    frames: [...DEFAULT_FRAMES],
    framesExplicit: false,
    out: null,
    base: null,
    settle: 900,
    reduced: true,
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
      case '--scenes':
        options.scenes = takeValue()
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
        break
      case '--viewport':
        options.viewport = takeValue().trim()
        break
      case '--frames':
        options.frames = takeValue()
          .split(',')
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isFinite(value) && value >= 0)
        options.framesExplicit = true
        break
      case '--out':
        options.out = takeValue().trim()
        break
      case '--base':
        options.base = takeValue().trim()
        break
      case '--settle': {
        const value = Number(takeValue())
        if (!Number.isFinite(value) || value < 0) {
          throw new Error(`Флаг --settle ждёт число миллисекунд, получено «${value}».`)
        }
        options.settle = value
        break
      }
      case '--no-reduced':
        options.reduced = false
        break
      default:
        throw new Error(`Неизвестный флаг: ${name}. Список флагов — в --help.`)
    }
  }

  if (!options.scenes || !options.scenes.length) options.scenes = Object.keys(SCENES)
  for (const scene of options.scenes) {
    if (!SCENES[scene]) {
      throw new Error(
        `Неизвестная сцена: ${scene}. Доступны: ${Object.keys(SCENES).join(', ')}.`,
      )
    }
  }
  if (options.viewport !== 'all' && !VIEWPORTS[options.viewport]) {
    throw new Error(
      `Неизвестный вьюпорт: ${options.viewport}. Доступны: ${Object.keys(VIEWPORTS).join(', ')}, all.`,
    )
  }
  if (!options.frames.length) options.frames = [...DEFAULT_FRAMES]

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
        'Установите Google Chrome или задайте путь к браузеру в переменной CHROME_PATH.',
    )
    return 1
  }

  const viewports =
    options.viewport === 'all' ? Object.keys(VIEWPORTS) : [options.viewport]

  const outDir = options.out
    ? resolve(root, options.out)
    : join(root, '.qa-artifacts', 'motion-frames')
  await mkdir(outDir, { recursive: true })

  let server = null
  let chrome = null
  let client = null

  try {
    if (options.base) {
      server = { child: null, baseUrl: options.base.replace(/\/$/, '') }
      console.log(`[qa-motion-frames] приложение: ${server.baseUrl} (из --base)`)
    } else {
      server = await startAppServer()
      console.log(`[qa-motion-frames] приложение: ${server.baseUrl} (vite preview)`)
    }

    chrome = await launchChrome(chromePath)
    console.log(`[qa-motion-frames] chrome: ${chrome.browser} (порт ${chrome.port})`)

    const target = await createTarget(chrome.port)
    client = await CdpClient.connect(target.webSocketDebuggerUrl)

    const state = {
      mode: 'ok',
      baseUrl: server.baseUrl,
      outDir,
      frames: options.frames,
      framesExplicit: options.framesExplicit,
      settle: options.settle,
      current: null,
    }

    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('Network.enable')
    await client.send('Log.enable')
    try {
      await client.send('Network.setBypassServiceWorker', { bypass: true })
    } catch {
      /* метод может отсутствовать в старых сборках Chrome */
    }
    attachApiInterceptor(client, state)
    await client.send('Fetch.enable', {
      patterns: [{ urlPattern: API_PATTERN, requestStage: 'Request' }],
    })

    // Посев localStorage: выполняется ДО кода приложения в каждом документе.
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: SEED_SCRIPT })

    client.on('Runtime.consoleAPICalled', (params) => {
      const record = state.current
      if (!record) return
      const text = (params.args ?? [])
        .map((arg) => (arg.value !== undefined ? String(arg.value) : arg.description ?? ''))
        .join(' ')
        .trim()
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

    const scenes = []
    for (const viewportName of viewports) {
      for (const scene of options.scenes) {
        process.stdout.write(`[qa-motion-frames] ${viewportName} ${scene} … `)
        const motion = await captureSeries(client, state, scene, viewportName, 'motion')
        let reduced = null
        if (options.reduced) {
          reduced = await captureSeries(client, state, scene, viewportName, 'reduced')
        }
        scenes.push({ scene, viewport: viewportName, motion, reduced })
        console.log(
          `ok (кадров ${motion.frames.length}${reduced ? ` + ${reduced.frames.length}` : ''})`,
        )
      }
    }

    // ==== Разбор ====
    const findings = []
    for (const entry of scenes) {
      const motionFrames = entry.motion.frames
      const finalFrame = motionFrames[motionFrames.length - 1]
      const firstFrame = motionFrames[0]
      const activity = findMotionActivity(motionFrames, entry.motion.preProbe ?? null)

      // Сцена объявлена как переход, но за всю серию НИ ОДИН элемент не
      // сдвинулся: либо контент появился «жёстким катом» (без перехода),
      // либо сцена не анимируется вовсе.
      if (activity.moving === 0) {
        findings.push({
          kind: activity.appeared > 0 ? 'hard-cut' : 'no-motion',
          scene: entry.scene,
          viewport: entry.viewport,
          route: entry.motion.route,
          item: {
            frames: motionFrames.map((f) => f.actualMs),
            changedElements: 0,
            appearedElements: activity.appeared,
            disappearedElements: activity.disappeared,
          },
        })
      }

      for (const item of findStuck(finalFrame)) {
        findings.push({
          kind: 'stuck',
          scene: entry.scene,
          viewport: entry.viewport,
          route: entry.motion.route,
          item,
        })
      }

      for (const item of findDoubleAnimation(finalFrame)) {
        findings.push({
          kind: 'double-animation',
          scene: entry.scene,
          viewport: entry.viewport,
          route: entry.motion.route,
          item,
        })
      }

      for (const item of findFlicker(motionFrames)) {
        findings.push({
          kind: 'flicker',
          scene: entry.scene,
          viewport: entry.viewport,
          route: entry.motion.route,
          item,
        })
      }

      for (const item of findExpensiveSurfaces(finalFrame)) {
        findings.push({
          kind: 'expensive-surface',
          scene: entry.scene,
          viewport: entry.viewport,
          route: entry.motion.route,
          item,
        })
      }

      const staticPatterns = findStaticAntiPatterns(finalFrame)
      for (const item of staticPatterns.willChange) {
        findings.push({
          kind: 'will-change',
          scene: entry.scene,
          viewport: entry.viewport,
          route: entry.motion.route,
          item,
        })
      }
      for (const item of staticPatterns.transitionAll) {
        findings.push({
          kind: 'transition-all',
          scene: entry.scene,
          viewport: entry.viewport,
          route: entry.motion.route,
          item,
        })
      }

      if (entry.reduced) {
        const reducedFinal = entry.reduced.frames[entry.reduced.frames.length - 1]
        for (const item of findStuck(reducedFinal)) {
          findings.push({
            kind: 'stuck-reduced',
            scene: entry.scene,
            viewport: entry.viewport,
            route: entry.motion.route,
            item,
          })
        }
        for (const diff of compareFinals(finalFrame, reducedFinal)) {
          findings.push({
            kind: 'jump',
            scene: entry.scene,
            viewport: entry.viewport,
            route: entry.motion.route,
            item: diff,
          })
        }
        for (const drift of findReducedMotionDrift(entry.reduced.frames)) {
          findings.push({
            kind: 'reduced-drift',
            scene: entry.scene,
            viewport: entry.viewport,
            route: entry.motion.route,
            item: drift,
          })
        }
      }

      // «Прыжок» между кадрами одной серии: элемент не должен смещаться
      // после того, как анимация закончилась (последние два кадра).
      const tail = motionFrames.slice(-2)
      if (tail.length === 2) {
        const before = byPath(tail[0].probe.tracked)
        const after = byPath(tail[1].probe.tracked)
        for (const [key, afterItem] of after) {
          const beforeItem = before.get(key)
          if (!beforeItem) continue
          const dx = Math.abs(afterItem.rect.x - beforeItem.rect.x)
          const dy = Math.abs(afterItem.rect.y - beforeItem.rect.y)
          if (dx > JUMP_PX || dy > JUMP_PX) {
            findings.push({
              kind: 'late-shift',
              scene: entry.scene,
              viewport: entry.viewport,
              route: entry.motion.route,
              item: {
                path: key,
                testid: afterItem.testid,
                cls: afterItem.cls,
                dx,
                dy,
                text: afterItem.text,
              },
            })
          }
        }
      }

      entry.summary = {
        frames: motionFrames.length,
        firstFrameMs: firstFrame.actualMs,
        lastFrameMs: finalFrame.actualMs,
        reducedMotionInPage: finalFrame.probe.reducedMotion,
        hiddenInFinal: finalFrame.probe.hidden.length,
        liveAnimationsInFinal: finalFrame.probe.anims.length,
        movingElements: activity.moving,
        consoleErrors: entry.motion.consoleErrors.length,
        pageErrors: entry.motion.pageErrors.length,
      }
    }
    // ==== Консистентность между экранами ====
    // Один и тот же элемент роли должен выглядеть одинаково на всех вью:
    // иначе «приборный» язык расползается. Сравниваем внутри роли.
    const consistency = []
    const samplesBySelector = new Map()
    for (const entry of scenes) {
      const frame = entry.motion.frames[entry.motion.frames.length - 1]
      for (const [selector, signature] of Object.entries(frame.probe.signatures ?? {})) {
        if (!samplesBySelector.has(selector)) samplesBySelector.set(selector, [])
        samplesBySelector.get(selector).push({
          scene: entry.scene,
          viewport: entry.viewport,
          route: entry.motion.route,
          signature,
        })
      }
    }
    const INVARIANTS = [
      'fontSize',
      'fontWeight',
      'fontFamily',
      'letterSpacing',
      'textTransform',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'borderRadius',
      'borderTopWidth',
      'borderBottomWidth',
      'minHeight',
    ]
    for (const [group, selectors] of Object.entries(CONSISTENCY_GROUPS)) {
      const present = selectors
        .map((selector) => [selector, samplesBySelector.get(selector) ?? []])
        .filter(([, samples]) => samples.length > 0)
      for (const [selector, samples] of present) {
        for (const other of present) {
          if (other[0] === selector) continue
          const a = samples[0].signature
          const b = other[1][0].signature
          for (const prop of INVARIANTS) {
            if (a[prop] === b[prop]) continue
            consistency.push({
              group,
              selector,
              other: other[0],
              prop,
              a: { scene: samples[0].scene, viewport: samples[0].viewport, value: a[prop] },
              b: { scene: other[1][0].scene, viewport: other[1][0].viewport, value: b[prop] },
            })
          }
        }
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      tool: 'qa-motion-frames',
      appUrl: server.baseUrl,
      chrome: { path: chromePath, browser: chrome.browser },
      frames: options.frames,
      reducedCaptured: options.reduced,
      scenes: scenes.map((entry) => ({
        scene: entry.scene,
        label: entry.motion.label,
        route: entry.motion.route,
        viewport: entry.viewport,
        summary: entry.summary,
        actionError: entry.motion.actionError,
        consoleErrors: entry.motion.consoleErrors,
        consoleWarnings: entry.motion.consoleWarnings,
        pageErrors: entry.motion.pageErrors,
        frames: entry.motion.frames.map((frame) => ({
          offset: frame.offset,
          actualMs: frame.actualMs,
          startedMs: frame.startedMs,
          capturedMs: frame.capturedMs,
          probedMs: frame.probedMs,
          screenshot: frame.screenshot,
          hiddenCount: frame.probe.hidden.length,
          liveAnimations: frame.probe.anims.length,
          anims: frame.probe.anims,
          named: frame.probe.named,
          signatures: frame.probe.signatures,
          uaFontButtons: frame.probe.uaFontButtons,
          docHeight: frame.probe.docHeight,
        })),
        reducedFrames: entry.reduced
          ? entry.reduced.frames.map((frame) => ({
              offset: frame.offset,
              actualMs: frame.actualMs,
              startedMs: frame.startedMs,
              capturedMs: frame.capturedMs,
              probedMs: frame.probedMs,
              screenshot: frame.screenshot,
              hiddenCount: frame.probe.hidden.length,
              liveAnimations: frame.probe.anims.length,
              anims: frame.probe.anims,
              named: frame.probe.named,
              signatures: frame.probe.signatures,
              uaFontButtons: frame.probe.uaFontButtons,
            }))
          : [],
      })),
      findings,
      consistency,
    }

    await writeFile(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    await writeFile(join(outDir, 'report.md'), renderReportMarkdown(report))

    console.log('')
    console.log(`[qa-motion-frames] артефакты: ${outDir}`)
    console.log(`[qa-motion-frames] сцен: ${scenes.length}`)
    console.log(`[qa-motion-frames] находок: ${findings.length}`)
    for (const kind of new Set(findings.map((f) => f.kind))) {
      console.log(`  — ${kind}: ${findings.filter((f) => f.kind === kind).length}`)
    }
    return 0
  } catch (error) {
    console.error(`[qa-motion-frames] провал: ${error.message}`)
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

/** Человекочитаемая сводка по прогону. */
function renderReportMarkdown(report) {
  const lines = []
  lines.push('# QA motion frames — BMSTUDvach')
  lines.push('')
  lines.push(`- Сгенерировано: ${report.generatedAt}`)
  lines.push(`- Приложение: ${report.appUrl}`)
  lines.push(`- Chrome: ${report.chrome?.browser ?? '—'}`)
  lines.push(`- Моменты кадров, мс: ${report.frames.join(', ')}`)
  lines.push('')
  lines.push('## Сцены')
  lines.push('')
  lines.push('| Сцена | Маршрут | Вьюпорт | Кадров | Скрытых в финале | Живых анимаций | Ошибки |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- |')
  for (const scene of report.scenes) {
    lines.push(
      `| \`${scene.scene}\` | \`${scene.route}\` | ${scene.viewport} | ${scene.summary.frames} | ` +
        `${scene.summary.hiddenInFinal} | ${scene.summary.liveAnimationsInFinal} | ` +
        `${scene.summary.consoleErrors + scene.summary.pageErrors} |`,
    )
  }
  lines.push('')
  lines.push('## Консистентность между экранами')
  lines.push('')
  if (!report.consistency.length) {
    lines.push('Расхождений нет: внутри роли стиль один и тот же на всех сценах.')
  } else {
    lines.push('| Роль | Элемент | Свойство | Первый | Второй |')
    lines.push('| --- | --- | --- | --- | --- |')
    for (const item of report.consistency) {
      lines.push(
        `| ${item.group} | \`${item.selector}\` | ${item.prop} | ` +
          `${item.a.scene}: \`${item.a.value}\` | ${item.b.scene}: \`${item.b.value}\` |`,
      )
    }
  }
  lines.push('')
  lines.push('## Находки')
  lines.push('')
  if (!report.findings.length) {
    lines.push('Пусто: замеры не нашли ни одного отклонения.')
  } else {
    for (const finding of report.findings) {
      lines.push(
        `### ${finding.kind} — \`${finding.scene}\` (${finding.viewport}, ${finding.route})`,
      )
      lines.push('')
      lines.push('```json')
      lines.push(JSON.stringify(finding.item, null, 2))
      lines.push('```')
      lines.push('')
    }
  }
  return `${lines.join('\n')}\n`
}

const code = await main()
process.exit(code)
