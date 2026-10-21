#!/usr/bin/env node
/**
 * qa-fixtures — детерминированные ответы API для браузерного QA.
 *
 * Форум анонимный и без бэкенда в QA-контуре: страницы получают данные
 * не из сети, а из перехвата запросов (см. `browser-qa.mjs`). Фикстуры
 * здесь — единственный источник этих данных, поэтому они обязаны быть
 * ПОВТОРЯЕМЫМИ: два запуска подряд должны давать байт-в-байт одинаковый
 * ответ на один и тот же путь. Отсюда правило файла:
 *
 *   — никаких `Date.now()`, `new Date()` без аргумента и `Math.random()`;
 *   — все даты — фиксированные ISO-строки;
 *   — никаких персональных данных и секретов (трипкоды в фикстурах —
 *     выдуманные, никаких реальных отпечатков).
 *
 * Формы данных повторяют типы проекта (`src/types/index.ts` и
 * `src/api/*.ts`): `Board`, `ThreadSummary`, `ThreadDetail`, `Post`,
 * `Attachment`, `PlatinumStory`, `Telemetry`, `Paginated<T>`.
 */

/** Опорный момент времени фикстур — «сейчас» с��мора. */
export const FIXTURE_EPOCH = '2026-03-14T09:00:00Z'

/** Префикс API, который перехватывает харнесс. */
const API_PREFIX = '/api/v1'

/* ==== Данные ============================================================= */

/**
 * Разделы. Имена разной длины — так снимок показывает, как вёрстка
 * ведёт себя и с коротким заголовком, и с длинным.
 */
const BOARDS = [
  {
    id: 1,
    slug: 'general',
    name: 'Общий раздел',
    description:
      'Свободное общение: учёба, быт, общежитие, скука и всё, что не нашло себе отдельного раздела.',
    rules: 'Без спама, без политики, без рекламы.',
    is_active: true,
    order: 1,
    thread_count: 1284,
    created_at: '2024-09-01T08:00:00Z',
    updated_at: '2026-03-13T21:40:00Z',
  },
  {
    id: 2,
    slug: 'mech',
    name: 'Механика и машиностроение',
    description:
      'Термеха, сопротивление материалов, кинематика, теория механизмов и машин — с чертежами и формулами.',
    rules: 'Решение задачи — с рисунком или с формулами, а не «а погугли».',
    is_active: true,
    order: 2,
    thread_count: 967,
    created_at: '2024-09-01T08:05:00Z',
    updated_at: '2026-03-12T18:03:00Z',
  },
  {
    id: 3,
    slug: 'it',
    name: 'ИТ и разработка',
    description:
      'Языки, базы данных, деплой, железо и всё, что по пятницам вечером падает само.',
    rules: 'Код — в блоке, не картинкой.',
    is_active: true,
    order: 3,
    thread_count: 1543,
    created_at: '2024-09-01T08:10:00Z',
    updated_at: '2026-03-14T07:12:00Z',
  },
  {
    id: 4,
    slug: 'theory',
    name: 'Теория',
    description:
      'Высшая математика, физика, теория вероятностей: длинные разборы, конспекты и споры о методе.',
    is_active: true,
    order: 4,
    thread_count: 812,
    created_at: '2024-09-02T09:00:00Z',
    updated_at: '2026-03-10T11:26:00Z',
  },
  {
    id: 5,
    slug: 'university',
    name: 'Жизнь в университете',
    description:
      'Сессии, стипендии, общежитие, старосты, деканаты и прочие бюрократические ритуалы.',
    rules: 'Личные данные — в тред не пишем.',
    is_active: true,
    order: 5,
    thread_count: 640,
    created_at: '2024-09-03T10:15:00Z',
    updated_at: '2026-03-09T15:47:00Z',
  },
  {
    id: 6,
    slug: 'physics-lab',
    name: 'Физлаб',
    description: 'Установки, методички, приборы и графы ошибок.',
    is_active: false,
    order: 6,
    thread_count: 0,
    created_at: '2024-09-04T12:00:00Z',
    updated_at: '2026-01-05T09:00:00Z',
  },
]

/** Треды: длинные и короткие заголовки, разные даты, разные разделы. */
const THREADS = [
  {
    id: 1,
    board: 'general',
    title: 'Как сдать экзамен по матанализу, если ты не спал три ночи',
    is_pinned: false,
    is_locked: false,
    created_at: '2026-03-13T17:02:00Z',
    updated_at: '2026-03-14T08:41:00Z',
    bumped_at: '2026-03-14T08:41:00Z',
    reply_count: 42,
    op_snippet:
      'Сижу на коленях перед дверью аудитории, конспекты в руках, глаза не открываются.',
  },
  {
    id: 2,
    board: 'general',
    title: 'Расписание пар на весенний семестр — собираем в один тред',
    is_pinned: true,
    is_locked: false,
    created_at: '2026-03-02T09:14:00Z',
    updated_at: '2026-03-13T20:02:00Z',
    bumped_at: '2026-03-13T20:02:00Z',
    reply_count: 118,
    op_snippet: 'Фотка расписания, разбираем по группам. Пишите свою.',
  },
  {
    id: 3,
    board: 'general',
    title: 'Что взять на лабораторную?',
    is_pinned: false,
    is_locked: false,
    created_at: '2026-03-11T12:30:00Z',
    updated_at: '2026-03-11T12:30:00Z',
    bumped_at: '2026-03-11T12:30:00Z',
    reply_count: 3,
    op_snippet: 'Список на две страницы, половина — не нужна.',
  },
  {
    id: 4,
    board: 'mech',
    title:
      'Термех: как правильно искать реакции в статически неопределимых системах, если опор четыре, а стержней два',
    is_pinned: false,
    is_locked: false,
    created_at: '2026-03-08T08:45:00Z',
    updated_at: '2026-03-14T06:20:00Z',
    bumped_at: '2026-03-14T06:20:00Z',
    reply_count: 27,
    op_snippet: 'Метод сил даёт систему из шести неизвестных, а уравнений пять.',
  },
  {
    id: 5,
    board: 'mech',
    title: 'Сопротивление материалов — разбор серии задач',
    is_pinned: true,
    is_locked: false,
    created_at: '2026-02-20T14:10:00Z',
    updated_at: '2026-03-12T16:55:00Z',
    bumped_at: '2026-03-12T16:55:00Z',
    reply_count: 64,
    op_snippet: 'Собрал в одну тему то, что идёт третьим колонтитулом.',
  },
  {
    id: 6,
    board: 'it',
    title: 'PostgreSQL на 4 GB RAM: какие настройки вообще имеет смысл трогать',
    is_pinned: false,
    is_locked: false,
    created_at: '2026-03-12T11:02:00Z',
    updated_at: '2026-03-14T09:05:00Z',
    bumped_at: '2026-03-14T09:05:00Z',
    reply_count: 31,
    op_snippet: 'После тюнинга p95 на чтении упал с 480 мс до 90 мс.',
  },
  {
    id: 7,
    board: 'it',
    title: 'Деплой: nginx + systemd, или systemd + nginx, или всё-таки Docker?',
    is_pinned: false,
    is_locked: false,
    created_at: '2026-03-10T19:44:00Z',
    updated_at: '2026-03-13T22:31:00Z',
    bumped_at: '2026-03-13T22:31:00Z',
    reply_count: 55,
    op_snippet: 'Спор из-за systemd-юнита, уходящего в бесконечный restart.',
  },
  {
    id: 8,
    board: 'it',
    title: 'Git-сервер за минуту',
    is_pinned: false,
    is_locked: false,
    created_at: '2026-03-06T07:00:00Z',
    updated_at: '2026-03-06T07:00:00Z',
    bumped_at: '2026-03-06T07:00:00Z',
    reply_count: 2,
    op_snippet: 'Короткий рецепт без SSH-ключей.',
  },
  {
    id: 9,
    board: 'theory',
    title: 'Случайные блуждания: почему диффузия медленнее, чем кажется на картинке',
    is_pinned: false,
    is_locked: false,
    created_at: '2026-03-01T15:20:00Z',
    updated_at: '2026-03-10T11:26:00Z',
    bumped_at: '2026-03-10T11:26:00Z',
    reply_count: 19,
    op_snippet: 'На картинке — прямая, в жизни — парабола.',
  },
  {
    id: 10,
    board: 'university',
    title: 'Стипендия: кому писать, если ведомость не обновили',
    is_pinned: false,
    is_locked: false,
    created_at: '2026-03-09T10:05:00Z',
    updated_at: '2026-03-13T18:12:00Z',
    bumped_at: '2026-03-13T18:12:00Z',
    reply_count: 8,
    op_snippet: 'Деканат не отвечает, стипендия пришла в декабре.',
  },
  {
    id: 11,
    board: 'university',
    title: 'Общежитие: мелочи, которые стоит завести в первый же день',
    is_pinned: false,
    is_locked: true,
    created_at: '2026-02-14T18:00:00Z',
    updated_at: '2026-03-09T15:47:00Z',
    bumped_at: '2026-03-05T09:11:00Z',
    reply_count: 46,
    op_snippet: 'Из личного опыта: удлинитель, крючки, чашка.',
  },
]

/**
 * Картинка-вложение рисуется прямо в фикстуре.
 *
 * Настоящий файл тянуть нельзя: приложение работает без бэкенда, а
 * битая картинка в снимке — это артефакт фикстуры, который потом принимают
 * за дефект интерфейса. Поэтому вложение-изображение — это data-URI с
 * маленькой «консолью»: сетевого запроса нет, снимок детерминирован.
 */
const TERMINAL_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">',
  '<rect width="1280" height="720" fill="#F2EDE0"/>',
  '<rect x="36" y="36" width="1208" height="648" fill="none" stroke="#1B1A17" stroke-width="2"/>',
  '<rect x="36" y="36" width="1208" height="56" fill="#1B1A17"/>',
  '<circle cx="72" cy="64" r="9" fill="#B4462F"/>',
  '<circle cx="104" cy="64" r="9" fill="#C9A227"/>',
  '<circle cx="136" cy="64" r="9" fill="#4A7C59"/>',
  '<text x="180" y="72" font-family="monospace" font-size="22" fill="#F2EDE0">bash — qa</text>',
  '<text x="80" y="160" font-family="monospace" font-size="26" fill="#1B1A17">$ node scripts/browser-qa.mjs --routes=/,/platinum</text>',
  '<text x="80" y="212" font-family="monospace" font-size="26" fill="#1B1A17">$ npm run verify:3d &amp;&amp; npm run verify:motion</text>',
  '<text x="80" y="264" font-family="monospace" font-size="26" fill="#1B1A17">$ npm run build &amp;&amp; npm run test</text>',
  '<text x="80" y="332" font-family="monospace" font-size="26" fill="#4A7C59">ok — всё зелёное, снимки сняты</text>',
  '<text x="80" y="620" font-family="monospace" font-size="24" fill="#6B6459">BMSTUDvach · browser QA</text>',
  '</svg>',
].join('')

/** Вложение одного из постов — чтобы на снимке была видна сетка вложений. */
const ATTACHMENTS = [
  {
    id: 9001,
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(TERMINAL_SVG)}`,
    mime_type: 'image/svg+xml',
    size: 184320,
    width: 1280,
    height: 720,
    original_name: 'terminal.svg',
    created_at: '2026-03-13T18:05:00Z',
  },
  {
    id: 9002,
    url: '/media/qa/schema.sql',
    mime_type: 'application/sql',
    size: 2048,
    width: null,
    height: null,
    original_name: 'schema.sql',
    created_at: '2026-03-13T18:07:00Z',
  },
]

/** Посты треда №1 — цитаты, код, ссылка, вложение, «тихий» пост. */
const POSTS = [
  {
    id: 101,
    thread: 1,
    body:
      'Конспект по матанализу, который я писал последние три ночи, прилагаю кодом ' +
      '(да, это нечитаемо, но мне — читаемо):\n\n' +
      '```\n' +
      'def integrate(f, a, b, n=1000):\n' +
      '    h = (b - a) / n\n' +
      '    s = f(a) + f(b)\n' +
      '    for i in range(1, n):\n' +
      '        s += (4 if i % 2 else 2) * f(a + i * h)\n' +
      '    return s * h / 3\n' +
      '```\n\n' +
      'Справочник по формулам: https://example.edu/handbook/limits\n\n' +
      'Кто-нибудь помнит, с чего начинается билет №3? Там вроде двойной интеграл и смена переменных.',
    is_op: true,
    sage: false,
    created_at: '2026-03-13T17:02:00Z',
    updated_at: '2026-03-13T17:02:00Z',
    author: 'Аноним',
    tripcode: '',
    attachments: [],
  },
  {
    id: 102,
    thread: 1,
    body:
      '>>1\n' +
      'Билет №3 — двойной интеграл в полярных координатах, дальше интеграл по области и ' +
      'вычисление объёма. Формулы: F(ρ, φ) = ∫∫_D ρ·f(ρ, φ) dρ dφ.\n\n' +
      'Совет: перечитай определение интеграла по области, а не по функциям — половина потерь именно там.',
    is_op: false,
    sage: false,
    created_at: '2026-03-13T17:19:00Z',
    updated_at: '2026-03-13T17:19:00Z',
    author: 'Аноним',
    tripcode: '',
    attachments: [],
  },
  {
    id: 103,
    thread: 1,
    body:
      'Спасибо. Скидываю скриншот, как это выглядит в методичке — вдруг пригодится ' +
      'кому-то ещё с задней парты.\n\n' +
      'И да: на экзамене можно взять один лист, проверено в прошлом семестре.',
    is_op: false,
    sage: true,
    created_at: '2026-03-13T18:05:00Z',
    updated_at: '2026-03-13T18:05:00Z',
    author: 'Аноним',
    tripcode: '!qa71',
    attachments: [ATTACHMENTS[0]],
  },
  {
    id: 104,
    thread: 1,
    body:
      'Держите схему, по которой я разбирал билеты — вдруг кому-то покажется удобнее ' +
      'своя. Это просто SQL, но с комментариями.',
    is_op: false,
    sage: false,
    created_at: '2026-03-13T18:07:00Z',
    updated_at: '2026-03-13T18:07:00Z',
    author: 'Аноним',
    tripcode: '',
    attachments: [ATTACHMENTS[1]],
  },
  {
    id: 105,
    thread: 1,
    body:
      'Не спать три ночи ради экзамена — это, конечно, сильно, но я бы всё-таки поспал. ' +
      'Мозг на недосыпе работает хуже, чем кажется: на параллельном экзамене сбивается ' +
      'не на формуле, а на том, что читает условие.',
    is_op: false,
    sage: false,
    created_at: '2026-03-14T08:41:00Z',
    updated_at: '2026-03-14T08:41:00Z',
    author: 'Аноним',
    tripcode: '',
    attachments: [],
  },
  {
    id: 201,
    thread: 2,
    body:
      'Фотка расписания на весенний семестр. Разбираем по группам: пишите свою группу ' +
      'и курс — соберу единую таблицу, чтобы не искать по десяти чатам.',
    is_op: true,
    sage: false,
    created_at: '2026-03-02T09:14:00Z',
    updated_at: '2026-03-02T09:14:00Z',
    author: 'Аноним',
    tripcode: '',
    attachments: [],
  },
  {
    id: 202,
    thread: 2,
    body:
      '>>201\n' +
      'Группа БМ1-4, второй курс. Вторник — лекция, четверг — лаба, пятница — семинар.',
    is_op: false,
    sage: false,
    created_at: '2026-03-13T20:02:00Z',
    updated_at: '2026-03-13T20:02:00Z',
    author: 'Аноним',
    tripcode: '',
    attachments: [],
  },
  {
    id: 401,
    thread: 4,
    body:
      'Система из шести неизвестных при пяти уравнениях — это не ошибка, это статическая ' +
      'неопределимость. Решение ищут через перемещение связей или через метод ' +
      'перемещений в дифференциальной форме.\n\n' +
      'Силовой метод хорош, пока выбираешь правильное разделяемое уравнение: ' +
      'если моменты в одной точке не совпадают по знаку — уравнение бессмысленно.',
    is_op: true,
    sage: false,
    created_at: '2026-03-08T08:45:00Z',
    updated_at: '2026-03-08T08:45:00Z',
    author: 'Аноним',
    tripcode: '',
    attachments: [],
  },
  {
    id: 601,
    thread: 6,
    body:
      'Конфиг, который у меня стоит на 4 ГБ:\n\n' +
      '```ini\n' +
      'shared_buffers = 1GB\n' +
      'effective_cache_size = 3GB\n' +
      'work_mem = 32MB\n' +
      'max_connections = 60\n' +
      '```\n\n' +
      'Главное — не выкручивать work_mem: на 200 соединениях это съедает всю память ' +
      'и роняет планировщик. Дальше — pg_stat_statements и смотреть, где реально тормозит.',
    is_op: true,
    sage: false,
    created_at: '2026-03-12T11:02:00Z',
    updated_at: '2026-03-12T11:02:00Z',
    author: 'Аноним',
    tripcode: '',
    attachments: [],
  },
  {
    id: 701,
    thread: 7,
    body:
      'Ответ: systemd.unit с Restart=always, а nginx — отдельным юнитом, который ' +
      'стартует после сокета. Docker здесь только добавляет слой, который приходится ' +
      'объяснять новичкам.',
    is_op: true,
    sage: false,
    created_at: '2026-03-10T19:44:00Z',
    updated_at: '2026-03-10T19:44:00Z',
    author: 'Аноним',
    tripcode: '',
    attachments: [],
  },
]

/** Платинум-истории архива: длинные заголовки и многостраничные тела. */
const PLATINUM_STORIES = [
  {
    id: 1,
    title:
      'Ночная защита: как Артём понял, что боится не комиссии, а собственного молчания',
    body:
      'В корпусе было тихо, как не бывает даже в воскресенье. Артём сидел над ' +
      'чертежом, который не трогал двое суток, и вдруг понял, что боится не защиты — ' +
      'боится собственного молчания перед комиссией. За окном гас свет в соседнем ' +
      'крыле, и каждая минута казалась последней.\n\n' +
      'Утром он пришёл первым, разложил листы и произнёс вслух ту самую фразу, которую ' +
      'репетировал полмесяца. Комиссия кивнула. Курсовую приняли, а он так и не узнал, ' +
      'чего боялся больше — неудовлетворительной оценки или того, что окажется ' +
      'недостаточно просто успеть.',
    source_type: 'generated',
    status: 'published',
    generation_metadata: {
      model: 'fake',
      prompt: 'ночная защита, одиночество, инженерный корпус',
      tokens: 812,
    },
    created_at: '2026-02-01T10:00:00Z',
    published_at: '2026-02-03T10:00:00Z',
  },
  {
    id: 2,
    title: 'Первая стипендия',
    body:
      'Стипендия пришла в четверг, и почему-то именно тогда всё вокруг преобразилось. ' +
      'Кофе в автомате на первом этаже, который обычно казался горьким, оказался вполне ' +
      'терпимым, а путь до метро — самым коротким за семестр.\n\n' +
      'Он шёл и думал, что теперь-то всё пойдёт по плану: курсовая, диплом, работа. ' +
      'План, конечно, не сбылся, но тот четверг он запомнил навсегда.',
    source_type: 'generated',
    status: 'published',
    generation_metadata: {
      model: 'fake',
      prompt: 'стипендия, четверг, автомат',
      tokens: 402,
    },
    created_at: '2026-01-12T09:30:00Z',
    published_at: '2026-01-14T09:30:00Z',
  },
  {
    id: 3,
    title: 'Скорость ветра в трубе',
    body:
      'Лаборатория стояла на третьем этаже, и окно открывалось только на восемь ' +
      'сантиметров — ровно настолько, чтобы впустить воздух, но не зимний свет.\n\n' +
      'Когда принесли первую партию датчиков, оказалось, что половина показывает одно ' +
      'и то же, потому что их калибровали на одном стенде. Это потом вошло в отчёт как ' +
      '«методическая погрешность», а на деле это была неделя работы.',
    source_type: 'imported',
    status: 'published',
    generation_metadata: {
      model: 'fake',
      prompt: 'лаборатория, датчики, труба',
      tokens: 655,
    },
    created_at: '2025-11-20T14:00:00Z',
    published_at: '2025-12-01T14:00:00Z',
  },
  {
    id: 4,
    title: 'Черновик',
    body:
      'Заготовка, ещё не опубликованная. В архив не попадает, но состояние видно ' +
      'в списке — поэтому фикстура её держит.',
    source_type: 'custom',
    status: 'draft',
    generation_metadata: {},
    created_at: '2026-03-10T08:00:00Z',
    published_at: null,
  },
]

/** Объявления (полоса над контентом). */
const ANNOUNCEMENTS = [
  { id: 1, text: 'Ночью сети лучше видно: с 02:00 до 05:00 узлы отвечают быстрее.' },
  { id: 2, text: 'Архив платинума пополнен — 12 новых фрагментов.' },
]

/** Упоминания: ответы на посты с выдуманным трипкодом. */
const MENTIONS = {
  tripcode: '!qa71',
  count: 2,
  mentions: [
    {
      post: 105,
      thread: 1,
      thread_title: 'Как сдать экзамен по матанализу, если ты не спал три ночи',
      body:
        '>>103\n' +
        'Скидываю скриншот, как это выглядит в методичке — вдруг пригодится кому-то ещё ' +
        'с задней парты.',
      created_at: '2026-03-14T08:41:00Z',
      snippet: 'вдруг пригодится кому-то ещё с задней парты',
    },
    {
      post: 202,
      thread: 2,
      thread_title: 'Расписание пар на весенний семестр — собираем в один тред',
      body:
        '>>103\n' +
        'Группа БМ1-4, второй курс. Вторник — лекция, четверг — лаба, пятница — семинар.',
      created_at: '2026-03-13T20:02:00Z',
      snippet: 'Вторник — лекция, четверг — лаба, пятница — семинар',
    },
  ],
}

/** Телеметрия сети — сводка на главной и на странице статистики. */
const TELEMETRY = {
  boards: 6,
  threads: 5246,
  posts: 187392,
  attachments: 3128,
  last_24h: { posts: 412, threads: 37 },
  busiest_board: { slug: 'it', name: 'ИТ и разработка', posts: 118 },
  generated_at: FIXTURE_EPOCH,
}

/** Суточная серия активности за 7 дней — данные графика на /stats. */
const ACTIVITY_7 = [
  { date: '2026-03-08', posts: 288, threads: 24 },
  { date: '2026-03-09', posts: 341, threads: 31 },
  { date: '2026-03-10', posts: 297, threads: 22 },
  { date: '2026-03-11', posts: 402, threads: 35 },
  { date: '2026-03-12', posts: 358, threads: 29 },
  { date: '2026-03-13', posts: 445, threads: 41 },
  { date: '2026-03-14', posts: 412, threads: 37 },
]

/** Серия за 30 дней — тот же график, но другое окно. */
const ACTIVITY_30 = ACTIVITY_7.concat(
  Array.from({ length: 23 }, (_, index) => ({
    date: `2026-02-${String(index + 9).padStart(2, '0')}`,
    posts: 260 + ((index * 37) % 180),
    threads: 18 + ((index * 7) % 24),
  })),
)

/** Очередь жалоб модерации. */
const REPORTS = [
  {
    id: 501,
    reason: 'spam',
    comment: 'Одно и то же сообщение в пяти тредах подряд.',
    status: 'new',
    created_at: '2026-03-14T07:31:00Z',
    post: {
      id: 102,
      thread: 1,
      thread_title: 'Как сдать экзамен по матанализу, если ты не спал три ночи',
      is_hidden: false,
      body: '>>1\nБилет №3 — двойной интеграл в полярных координатах.',
      poster_fingerprint: 'fp-7ac1',
    },
  },
  {
    id: 502,
    reason: 'abuse',
    comment: '',
    status: 'new',
    created_at: '2026-03-13T22:08:00Z',
    post: {
      id: 701,
      thread: 7,
      thread_title:
        'Деплой: nginx + systemd, или systemd + nginx, или всё-таки Docker?',
      is_hidden: false,
      body: 'Ответ: systemd.unit с Restart=always…',
      poster_fingerprint: 'fp-31bd',
    },
  },
]

/** Журнал действий модератора. */
const MODERATION_LOG = [
  {
    id: 900,
    actor: 'qa-operator',
    action: 'hide_post',
    target_type: 'post',
    target_id: 102,
    note: 'спам',
    created_at: '2026-03-13T18:40:00Z',
  },
  {
    id: 901,
    actor: 'qa-operator',
    action: 'lock_thread',
    target_type: 'thread',
    target_id: 11,
    note: 'офтоп',
    created_at: '2026-03-09T15:45:00Z',
  },
]

/* ==== Сборка ответов ==================================================== */

/** Посты по треду — в порядке появления. */
function postsOf(threadId) {
  return POSTS.filter((post) => post.thread === threadId)
}

/** Тред-саммари: список для раздела, «свежие», пагинация. */
function threadSummary(thread) {
  return {
    id: thread.id,
    board: thread.board,
    title: thread.title,
    is_pinned: thread.is_pinned,
    is_locked: thread.is_locked,
    created_at: thread.created_at,
    updated_at: thread.updated_at,
    bumped_at: thread.bumped_at,
    reply_count: thread.reply_count,
    op_snippet: thread.op_snippet,
  }
}

/** Полный тред: саммари + посты. */
function threadDetail(thread) {
  return { ...threadSummary(thread), posts: postsOf(thread.id) }
}

/** Обёртка пагинации — форма `Paginated<T>` проекта. */
function paginated(items, { page = 1, pageSize = 20 } = {}) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize))
  const start = (page - 1) * pageSize
  return {
    count: items.length,
    page,
    pages,
    page_size: pageSize,
    results: items.slice(start, start + pageSize),
  }
}

/** Раздел по slug; неизвестный slug — 404. */
function boardBySlug(slug) {
  return BOARDS.find((board) => board.slug === slug) ?? null
}

/**
 * Ошибка API в форме проекта: `{detail}` — то, что покажет ErrorState.
 */
function apiError(detail) {
  return { detail }
}

/**
 * Маршруты API. Порядок важен: более специфичные пути стоят раньше
 * (например, `/posts/mentions/` раньше `/posts/<id>/`).
 */
const ROUTES = [
  {
    name: 'announcements',
    method: 'GET',
    pattern: /^\/announcements\/$/,
    build: () => ANNOUNCEMENTS,
  },
  {
    name: 'boards',
    method: 'GET',
    pattern: /^\/boards\/$/,
    build: () => BOARDS,
  },
  {
    name: 'board-threads',
    method: 'GET',
    pattern: /^\/boards\/([a-z0-9-]+)\/threads\/$/,
    build: (match, url) => {
      const slug = match[1]
      if (!boardBySlug(slug))
        return { status: 404, body: apiError('Раздел не найден.') }
      const order = url.searchParams.get('order') ?? 'bump'
      const page = Number(url.searchParams.get('page') ?? '1') || 1
      const list = THREADS.filter((thread) => thread.board === slug).map(threadSummary)
      const sorted = sortThreads(list, order)
      return { status: 200, body: paginated(sorted, { page }) }
    },
  },
  {
    name: 'board',
    method: 'GET',
    pattern: /^\/boards\/([a-z0-9-]+)\/$/,
    build: (match) => {
      const board = boardBySlug(match[1])
      if (!board) return { status: 404, body: apiError('Раздел не найден.') }
      return { status: 200, body: board }
    },
  },
  {
    name: 'recent-threads',
    method: 'GET',
    pattern: /^\/threads\/recent\/$/,
    build: (_match, url) => {
      const limit = Number(url.searchParams.get('limit') ?? '6') || 6
      const list = [...THREADS].sort((a, b) => (a.bumped_at < b.bumped_at ? 1 : -1))
      return { status: 200, body: list.slice(0, limit).map(threadSummary) }
    },
  },
  {
    name: 'thread',
    method: 'GET',
    pattern: /^\/threads\/(\d+)\/$/,
    build: (match) => {
      const thread = THREADS.find((item) => item.id === Number(match[1]))
      if (!thread) return { status: 404, body: apiError('Тред не найден.') }
      return { status: 200, body: threadDetail(thread) }
    },
  },
  {
    name: 'mentions',
    method: 'GET',
    pattern: /^\/posts\/mentions\/$/,
    build: () => MENTIONS,
  },
  {
    name: 'post',
    method: 'GET',
    pattern: /^\/posts\/(\d+)\/$/,
    build: (match) => {
      const post = POSTS.find((item) => item.id === Number(match[1]))
      if (!post) return { status: 404, body: apiError('Сообщение не найдено.') }
      return { status: 200, body: post }
    },
  },
  {
    name: 'post-report',
    method: 'POST',
    pattern: /^\/posts\/(\d+)\/reports\/$/,
    build: (match) => ({
      status: 201,
      body: { detail: 'Жалоба принята.', id: 900 + Number(match[1]) },
    }),
  },
  {
    name: 'create-post',
    method: 'POST',
    pattern: /^\/threads\/(\d+)\/posts\/$/,
    build: (match) => ({
      status: 201,
      body: {
        id: 9000 + Number(match[1]),
        thread: Number(match[1]),
        body: 'Ответ из фикстуры.',
        is_op: false,
        sage: false,
        created_at: FIXTURE_EPOCH,
        updated_at: FIXTURE_EPOCH,
        author: 'Аноним',
        tripcode: '',
        attachments: [],
      },
    }),
  },
  {
    name: 'create-thread',
    method: 'POST',
    pattern: /^\/boards\/([a-z0-9-]+)\/threads\/$/,
    build: (match) => ({
      status: 201,
      body: {
        ...threadSummary({
          id: 9500,
          board: match[1],
          title: 'Новый тред из фикстуры',
          is_pinned: false,
          is_locked: false,
          created_at: FIXTURE_EPOCH,
          updated_at: FIXTURE_EPOCH,
          bumped_at: FIXTURE_EPOCH,
          reply_count: 0,
          op_snippet: '',
        }),
        posts: [],
      },
    }),
  },
  {
    name: 'platinum-story',
    method: 'GET',
    pattern: /^\/platinum\/(\d+)\/$/,
    build: (match) => {
      const story = PLATINUM_STORIES.find((item) => item.id === Number(match[1]))
      if (!story) return { status: 404, body: apiError('История не найдена.') }
      return { status: 200, body: story }
    },
  },
  {
    name: 'platinum',
    method: 'GET',
    pattern: /^\/platinum\/$/,
    build: (_match, url) => {
      const page = Number(url.searchParams.get('page') ?? '1') || 1
      const search = (url.searchParams.get('search') ?? '').trim().toLowerCase()
      const published = PLATINUM_STORIES.filter((story) => story.status === 'published')
      const filtered = search
        ? published.filter(
            (story) =>
              story.title.toLowerCase().includes(search) ||
              story.body.toLowerCase().includes(search),
          )
        : published
      return { status: 200, body: paginated(filtered, { page }) }
    },
  },
  {
    name: 'telemetry-activity',
    method: 'GET',
    pattern: /^\/telemetry\/activity\/$/,
    build: (_match, url) => {
      const days = Number(url.searchParams.get('days') ?? '7') || 7
      const points = days >= 30 ? ACTIVITY_30 : ACTIVITY_7
      return { status: 200, body: { days, points } }
    },
  },
  {
    name: 'telemetry',
    method: 'GET',
    pattern: /^\/telemetry\/$/,
    build: () => TELEMETRY,
  },
  {
    name: 'search',
    method: 'GET',
    pattern: /^\/search\/$/,
    build: (_match, url) => {
      const query = url.searchParams.get('q') ?? ''
      const needle = query.trim().toLowerCase()
      const threads = needle
        ? THREADS.filter((thread) => thread.title.toLowerCase().includes(needle)).map(
            threadSummary,
          )
        : []
      const posts = needle
        ? POSTS.filter((post) => post.body.toLowerCase().includes(needle)).map(
            (post) => ({
              id: post.id,
              thread: post.thread,
              thread_title:
                THREADS.find((thread) => thread.id === post.thread)?.title ?? '',
              is_op: post.is_op,
              snippet: post.body.slice(0, 140),
            }),
          )
        : []
      return { status: 200, body: { query, threads, posts, board: null } }
    },
  },
  {
    name: 'staff-me',
    method: 'GET',
    pattern: /^\/moderation\/me\/$/,
    // Сессияstaff в фикстуре: консоль должна быть видна целиком, иначе
    // на снимке только ворота входа и половина вью не проверяется.
    build: () => ({ is_staff: true, username: 'qa-operator' }),
  },
  {
    name: 'moderation-reports',
    method: 'GET',
    pattern: /^\/moderation\/reports\/$/,
    build: () => ({ reports: REPORTS }),
  },
  {
    name: 'moderation-log',
    method: 'GET',
    pattern: /^\/moderation\/log\/$/,
    build: () => ({ actions: MODERATION_LOG }),
  },
  {
    name: 'moderation-fingerprints',
    method: 'GET',
    pattern: /^\/moderation\/fingerprints\/([^/]+)\/posts\/$/,
    build: (match) => {
      const fingerprint = decodeURIComponent(match[1])
      const posts = REPORTS.filter(
        (report) => report.post.poster_fingerprint === fingerprint,
      ).map((report) => ({
        id: report.post.id,
        thread: report.post.thread,
        thread_title: report.post.thread_title,
        body: report.post.body,
        is_hidden: report.post.is_hidden,
        sage: false,
        created_at: report.created_at,
      }))
      return { status: 200, body: { fingerprint, count: posts.length, posts } }
    },
  },
]

/** Сортировка тредов раздела — как в бэкенде. */
function sortThreads(list, order) {
  const copy = [...list]
  if (order === 'replies') {
    return copy.sort((a, b) => b.reply_count - a.reply_count)
  }
  if (order === 'newest') {
    return copy.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  }
  return copy.sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
    return a.bumped_at < b.bumped_at ? 1 : -1
  })
}

/**
 * Эндпоинты, которые в режиме `error` отдают 500.
 *
 * Ошибка нужна на страницах с состояниями: без неё ErrorState не
 * проверить. Служебные вызовы (создание треда, создание поста, отчёт)
 * в список не входят — их падение проверяется отдельно.
 */
const ERROR_ROUTES = new Set([
  'announcements',
  'boards',
  'board',
  'board-threads',
  'recent-threads',
  'thread',
  'post',
  'mentions',
  'platinum',
  'platinum-story',
  'telemetry',
  'telemetry-activity',
  'search',
  'staff-me',
  'moderation-reports',
  'moderation-log',
  'moderation-fingerprints',
])

/** Эндпоинты, которые в режиме `empty` отдают пустой список. */
const EMPTY_ROUTES = new Set([
  'announcements',
  'boards',
  'board-threads',
  'recent-threads',
  'platinum',
  'search',
])

/** Пустой ответ пагинации — та же форма, что и у полного. */
function emptyPaginated() {
  return paginated([], { page: 1 })
}

/**
 * Ответ API для пути.
 *
 * @param {string} pathname — путь запроса (с префиксом `/api/v1` или без).
 * @param {'ok'|'empty'|'error'|'offline'} mode — режим фикстур.
 * @param {string} method — HTTP-метод (по умолчанию GET).
 * @returns {{status: number, body: unknown, offline?: boolean}}
 */
export function fixturesFor(pathname, mode = 'ok', method = 'GET') {
  const clean = normalizePath(pathname)
  const url = new URL(clean, 'http://fixtures.local')

  if (mode === 'offline') {
    // Сеть недоступна: ответить нечем — харнесс рвёт запрос.
    return { status: 0, body: null, offline: true }
  }

  for (const route of ROUTES) {
    if (route.method !== method.toUpperCase()) continue
    const match = route.pattern.exec(url.pathname)
    if (!match) continue

    if (mode === 'error' && ERROR_ROUTES.has(route.name)) {
      return {
        status: 500,
        body: apiError('Сервер сети недоступен: попробуйте позже.'),
      }
    }

    if (mode === 'empty' && EMPTY_ROUTES.has(route.name)) {
      if (route.name === 'board-threads') return { status: 200, body: emptyPaginated() }
      if (route.name === 'platinum') return { status: 200, body: emptyPaginated() }
      if (route.name === 'search') {
        return {
          status: 200,
          body: {
            query: url.searchParams.get('q') ?? '',
            threads: [],
            posts: [],
            board: null,
          },
        }
      }
      return { status: 200, body: [] }
    }

    const built = route.build(match, url)
    const wrapped =
      built && typeof built === 'object' && !Array.isArray(built) && 'status' in built
    const status = wrapped ? built.status : 200
    const payload = wrapped ? built.body : built

    if (mode === 'empty') {
      if (EMPTY_ROUTES.has(route.name)) {
        if (route.name === 'board-threads' || route.name === 'platinum') {
          return { status: 200, body: emptyPaginated() }
        }
        if (route.name === 'search') {
          return {
            status: 200,
            body: {
              query: url.searchParams.get('q') ?? '',
              threads: [],
              posts: [],
              board: null,
            },
          }
        }
        return { status: 200, body: [] }
      }
      // Одиночные записи в пустом режиме остаются, но без вложенных списков:
      // тред без постов, телеметрия без счётчиков, упоминания без ответов.
      if (route.name === 'thread') {
        return { status, body: { ...payload, posts: [] } }
      }
      if (route.name === 'telemetry') {
        return {
          status,
          body: {
            ...payload,
            boards: 0,
            threads: 0,
            posts: 0,
            attachments: 0,
            last_24h: { posts: 0, threads: 0 },
            busiest_board: null,
          },
        }
      }
      if (route.name === 'mentions') {
        return { status, body: { ...payload, count: 0, mentions: [] } }
      }
    }

    return { status, body: payload }
  }

  // Неизвестный путь — чтобы «незакрытый» эндпоинт не выглядел как
  // «просто нет данных», отдаём честную ошибку маршрутизации.
  return {
    status: 404,
    body: apiError(`Эндпоинт не покрыт фикстурами: ${url.pathname}`),
  }
}

/**
 * Путь без префикса API и без хвостовых слэшей — так маршруты
 * сопоставляются независимо от того, как приложение их собрало.
 */
export function normalizePath(pathname) {
  let path = String(pathname ?? '/')
  const query = path.indexOf('?')
  if (query !== -1) path = path.slice(0, query)
  if (path.startsWith(API_PREFIX)) path = path.slice(API_PREFIX.length) || '/'
  if (!path.startsWith('/')) path = `/${path}`
  return path
}

/** Список покрытых эндпоинтов — для отчёта и для самопроверки. */
export function fixtureRoutes() {
  return ROUTES.map((route) => ({ name: route.name, method: route.method }))
}

export const FIXTURES = {
  boards: BOARDS,
  threads: THREADS,
  posts: POSTS,
  platinum: PLATINUM_STORIES,
  telemetry: TELEMETRY,
  activity: ACTIVITY_7,
  announcements: ANNOUNCEMENTS,
  mentions: MENTIONS,
  reports: REPORTS,
  moderationLog: MODERATION_LOG,
}
