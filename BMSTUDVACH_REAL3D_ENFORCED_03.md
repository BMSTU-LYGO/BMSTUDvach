# BMSTUDvach — REAL 3D ENFORCED — Phase 03

## 0. Цель

Фаза 02 запрещала Three.js. Теперь настоящий 3D **включается принудительно**
(ENFORCED), но с жёсткими guardrails: деградация качества, полный cleanup,
отсутствие падения без WebGL, уважение к prefers-reduced-motion.

Результат: на главной вращается 3D-шестерня (эмблема Бауманки) в wireframe,
частицы живут на GPU-слое, в тредах — фон из плавающих геометрических тел,
качество переключается пользователем и автоматически деградирует по FPS.

---

## 1. Принципы

1. **three.js грузится лениво** (`await import('three')`) — форум работает,
   пока 3D-библиотека ещё не скачалась, и работает без неё при `off`.
2. **Один quality-менеджер** — источник правды для всех 3D-сцен.
   Уровни: `high | low | off`, настройка: `auto | high | low | off`.
3. **Любая 3D-сцена обязана**: пауза при скрытии вкладки/ухода из viewport,
   dispose всей геометрии/материалов/текстур при unmount, try/catch на WebGL,
   CSS-фолбэк при провале.
4. **FPS-автодеградация**: high → low → off, односторонне, до смены настройки.
5. API/store/роутинг не трогаем.

---

## 2. Зависимости

```bash
npm install three        # типизация встроена (r157+), @types/three не нужен
```

---

## 3. Блоки

### 3D-01: Quality-менеджер + useThreeScene (фундамент)

**Файлы:**
- `composables/useQuality3D.ts` — NEW
  - setting: `auto|high|low|off` (localStorage `bmstudvach-3d`)
  - resolved: `high|low|off` = setting + device detect (pointer:coarse, cores)
    + prefers-reduced-motion(auto→off) + runtime override от деградации
  - `cycleSetting()`, `degrade()`
- `composables/useThreeScene.ts` — NEW
  - lifecycle: lazy import three → renderer(alpha, antialias=high, DPR cap
    2 на high / 1 на low) → scene/camera → build callback → rAF loop
  - pause: `visibilitychange` + IntersectionObserver
  - FPS-мониторинг окна 90 кадров, среднее > 33мс → degrade()
  - race-guard (token-сессии) для async-init
  - dispose: traverse scene → geometry/material/texture dispose,
    renderer.dispose(), observers disconnect
  - возврат `{ supported, active }` — supported=false → CSS-фолбэк
- `vite.config.ts` — manualChunks: three отдельным чанком

**Коммит:** `3D-01: add three.js foundation — quality manager and scene lifecycle`

---

### 3D-02: GearHero — шестерня в hero главной

**Файлы:**
- `components/three/GearHero.vue` — NEW
- `views/HomeView.vue` — встроить за hero-контентом

**Контент сцены:**
- Две wireframe-шестерни (ExtrudeGeometry + EdgesGeometry): большая 16 зубов,
  малая 10, вращаются в противофазе (передаточное отношение)
- GridHelper «пол», лёгкий наклон группы (инженерный чертёж)
- Мышь: camera lerp-параллакс; скролл не блокируем
- Фолбэк: CSS-градиентное свечение при !active

**Коммит:** `3D-02: add wireframe gear hero scene`

---

### 3D-03: ParticleField3D + AmbientField (переключатель)

**Файлы:**
- `components/three/ParticleField3D.vue` — NEW
- `components/three/AmbientField.vue` — NEW (обёртка: 3D vs Canvas2D)
- `layouts/DefaultLayout.vue` — использовать AmbientField (async)

**ParticleField3D:**
- THREE.Points, OrthographicCamera в экранных координатах (1 юнит = 1 px)
- CPU-обновление позиций (dt-нормализованное), мышь-притяжение как в 2D
- Sprite: радиальный градиент на CanvasTexture, AdditiveBlending, vertexColors
- Count: high=160, low=70
- Проксимити-линии НЕ переносим (O(n²) на CPU — не нужно на GPU-версии)

**AmbientField:** `resolved !== off` → 3D-версия, иначе существующий
Canvas2D ParticleField (который уже уважает reduced-motion).

**Коммит:** `3D-03: add GPU particle field with 2D fallback switch`

---

### 3D-04: FloatingShapes3D — фон страницы треда

**Файлы:**
- `components/three/FloatingShapes3D.vue` — NEW
- `views/ThreadView.vue` — fixed-слой за контентом

**Контент сцены:**
- 5–10 wireframe-тел (icosahedron/octahedron/torus), случайные позиции по z,
  медленное вращение + синусоидальный дрейф
- Мышь-параллакс камеры; opacity 0.2–0.3, цвет — приглушённый янтарь
- Только на thread-странице (разгрузка главных сцен)

**Коммит:** `3D-04: add floating shapes backdrop for thread view`

---

### 3D-05: Post reveals — глубина

**Файлы:**
- `composables/usePostReveal.ts` — апгрейд

**Что:**
- Появление постов через `transformPerspective: 900` + `rotateX: -12`
  (карточка «опрокидывается» в плоскость), не только y/opacity
- Hover на `.post-item`: translateZ-подобный lift (CSS, без WebGL)

**Коммит:** `3D-05: add depth to post reveal animations`

---

### 3D-06: Настройки 3D в шапке

**Файлы:**
- `components/layout/AppHeader.vue`

**Что:**
- Кнопка `3D` рядом с CRT/звуком: цикл auto → high → low → off
- Отображает режим: `3D·AUTO / 3D·HI / 3D·LO / 3D·OFF`
- aria-label на русском, tooltip с объяснением
- Смена настройки сбрасывает runtime-degrade override

**Коммит:** `3D-06: add 3D quality switch to header`

---

### 3D-07: Финальные guardrails

**Что:**
- Ревизия: все сцены проверяются на cleanup (нет утечек после 10 навигаций)
- `powerPreference: 'high-performance'`, offscreen canvas pause — из 3D-01
- Ограничение: максимум 2 активных WebGL-контекста (Ambient + локальная)
- Документировать в README раздел «3D-настройки»

**Коммит:** `3D-07: enforce 3D guardrails and context budget`

---

### 3D-08: Аудит

**Что:**
- `npm run build` / `lint` / `test` — зелёные
- Проверка: главный чанк НЕ содержит three (динамик-импорт)
- Docker smoke: API-флоу не сломан
- Статус-таблица в этом файле обновлена

**Коммит:** `3D-08: final audit and plan status update`

---

## 4. Definition of Done

- [ ] Шестерня в hero: wireframe, вращение, мышь-параллакс
- [ ] Частицы: GPU-версия при 3D, Canvas2D при off, без просадок
- [ ] Фон тредов: плавающие тела, не мешают чтению
- [ ] Раскрытие постов с 3D-глубиной
- [ ] Переключатель 3D в шапке (auto/high/low/off), persisted
- [ ] FPS-деградация high→low→off
- [ ] Без WebGL / с off — чистый CSS-фолбэк, контент полностью доступен
- [ ] reduced-motion (auto) → 3D off
- [ ] После unmount сцены: renderer/геометрии/текстуры disposed
- [ ] three — отдельный ленивый чанк, главный бандл не раздут
- [ ] build/lint/tests зелёные, API-смоук зелёный

## 5. Что НЕ делать

- GLTF-модели, постобработка (bloom/SSAO), физика, raycasting-интерактив
- 3D на каждой странице — только hero, ambient-частицы, фон тредов
- Серверный рендер сцены, SSR
- Платные ассеты / внешние CDN-модели
