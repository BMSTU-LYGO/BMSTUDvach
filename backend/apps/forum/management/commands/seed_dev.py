"""seed_dev — idempotent development data loader.

Populates the forum with realistic BMSTU-flavored content so the
interface can be judged on real data: multiple boards, threads with
pinned/locked states, replies that link to each other via `>>id`,
attachments in every allowed format, and a Platinum archive where
source/generated stories stay separated.

Safe to re-run: boards update by slug, threads and posts resolve by
natural keys, binary attachments are generated deterministically.
"""

from __future__ import annotations

import struct
import zlib

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.forum.models import Attachment, Board, Post, Thread
from apps.platinum.models import PlatinumStory, SourceStory

# --- tiny binary generators (no Pillow in the dev image) ---------------------


def _png(width: int, height: int, rgb: tuple[int, int, int]) -> bytes:
    """A valid solid-colour PNG — carries real dimensions for the UI."""

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    row = b"\x00" + bytes(rgb) * width
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(row * height))
        + chunk(b"IEND", b"")
    )


def _pdf(title: str, lines: list[str]) -> bytes:
    """A minimal but valid one-page PDF."""
    content = f"BT /F1 18 Tf 72 720 Td ({title}) Tj ET\n".encode("latin-1", "replace")
    y = 660
    for line in lines:
        content += f"BT /F1 11 Tf 72 {y} Td ({line}) Tj ET\n".encode(
            "latin-1", "replace"
        )
        y -= 18
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length "
        + str(len(content)).encode()
        + b" >>\nstream\n"
        + content
        + b"endstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = b"%PDF-1.4\n"
    for i, body in enumerate(objs, start=1):
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    out += b"trailer\n<< /Root 1 0 R /Size 5 >>\n%%EOF\n"
    return out


def _png_size(data: bytes) -> tuple[int | None, int | None]:
    """Read width/height from a PNG's IHDR chunk."""
    if len(data) >= 24 and data[12:16] == b"IHDR":
        return (
            struct.unpack(">I", data[16:20])[0],
            struct.unpack(">I", data[20:24])[0],
        )
    return None, None


def _txt(*lines: str) -> bytes:
    return ("\n".join(lines) + "\n").encode()


# --- content -----------------------------------------------------------------

BOARDS = [
    {
        "slug": "b",
        "name": "Разное",
        "description": "Обо всё — тот самый борд, куда можно написать что угодно",
        "rules": (
            "Оффтоп разрешён, но без спама и дублей.\n"
            "Не публикуйте личные данные — свои и чужие.\n"
            "Вложения только по теме раздела."
        ),
        "order": 0,
    },
    {
        "slug": "study",
        "name": "Учёба",
        "description": "Сессии, зачёты, лабы, диффуры и борьба с дедлайнами",
        "rules": (
            "Заголовок треда — по сути вопроса.\n"
            "Помогаем разобраться, а не сдаём работу за вас.\n"
            "Указывайте предмет и задачу, прикладывайте условие."
        ),
        "order": 1,
    },
    {
        "slug": "campus",
        "name": "Кампус",
        "description": "Жизнь в корпусах, столовые, общаги и всё остальное",
        "rules": "Про корпуса, столовые и общаги. Уважайте соседей и расписание.",
        "order": 2,
    },
    {
        "slug": "faculties",
        "name": "Факультеты",
        "description": "ИУ, РКТ, РЛ, СМ, Э, БМТ — разговор по факультетам",
        "order": 3,
    },
]

# Post bodies may reference earlier posts of the same thread with {0}, {1}…
# — the loader substitutes the actual post ids, producing real `>>id` links.
# The OP body of previously seeded threads matches the old seed exactly,
# so re-running merges instead of duplicating.
THREADS = [
    {
        "board": "b",
        "title": "Добро пожаловать на BMSTUDvach",
        "pinned": True,
        "hours_ago": 26,
        "posts": [
            {"body": "Первый тред на форуме. Добро пожаловать!", "is_op": True},
            {"body": "Значит, всё — анонимно и без регистрации? Идеально."},
            {"body": "Держите."},
            {"body": ">>{0}\nдобро пожаловать и тебя"},
        ],
    },
    {
        "board": "b",
        "title": "Что слушаешь по дороге до университета",
        "hours_ago": 20,
        "posts": [
            {"body": "Мне до Раушской 40 минут с пересадками. Нужен саундтрек."},
            {"body": "Подкасты по физике — как раз успеваю повторять."},
            {"body": ">>{0} уважение стационарным слушателям"},
            {"body": "Мёртвенную тишину, иначе не проснуться окончательно."},
            {"body": ">>{2} брат, мы одна команда"},
            {"body": "Плейлист из того, что играло в записи лекций."},
        ],
    },
    {
        "board": "b",
        "title": "Оффтоп: расскажите, зачем вы здесь",
        "hours_ago": 15,
        "posts": [
            {"body": "Никакой регистрации, никаких личных данных. Только треды."},
            {
                "body": "Впервые вижу форум, который выглядит как сеть, а не доска объявлений."
            },
            {"body": ">>{0} плюс, ответы тут чувствуются сигналами"},
            {"body": "За полезными сплетнями про сессию, если честно."},
        ],
    },
    {
        "board": "study",
        "title": "Советы по сдаче сессии",
        "hours_ago": 44,
        "pinned": True,
        "posts": [
            {"body": "Как готовитесь к экзаменам? Делитесь советами.", "is_op": True},
            {
                "body": "Начинайте за неделю, не откладывайте. Работает лучше любого совета."
            },
            {
                "body": "Разберите три прошлых года вариантов — половина вопросов повторяется."
            },
            {"body": ">>{0} подтверждаю, плюс конспекты лекций важнее интернета"},
            {"body": "Спите. Серьёзно, на переработке память отключается."},
            {"body": ">>{2} заспал на пересдаче — не повторяйте моих ошибок"},
            {"body": "Собирайтесь группами: объяснить вслух — лучшая проверка знаний."},
        ],
    },
    {
        "board": "study",
        "title": "Диффуры: с чего начать, если неделя",
        "hours_ago": 18,
        "posts": [
            {"body": "Зачёт через неделю, есть только конспект. С чего браться?"},
            {
                "body": "Линейные уравнения первого порядка и с заменой переменных — они дадут базу."
            },
            {
                "body": "Законспектировал по формуле. Держите образец, как раскладывать:",
                "files": [
                    {
                        "name": "diffury_conspect.png",
                        "content_type": "image/png",
                        "data": _png(560, 360, (216, 136, 42)),
                    },
                ],
            },
            {"body": ">>{0} спасибо, именно этого не хватало"},
            {"body": "Не пытайтесь выучить всё — идите по типам задач из сборника."},
        ],
    },
    {
        "board": "study",
        "title": "Годные бесплатные источники по матанализу",
        "hours_ago": 12,
        "posts": [
            {"body": "Скиньте что реально помогло, кроме лекций."},
            {"body": "Видеоразборы плюс задачник. Порядок такой и держите."},
            {
                "body": "Сохранил список, прикрепил файлом чтобы не потерялся:",
                "files": [
                    {
                        "name": "sources.txt",
                        "content_type": "text/plain",
                        "data": _txt(
                            "Лекции по матанализу (видео)",
                            "Задачник: ряды и пределы",
                            "Конспект seminar-notes.pdf",
                            "",
                            "Правило: вечером — теория, утром — задачи.",
                        ),
                    },
                ],
            },
            {"body": ">>{1} отличный список, распечатаю на ночь"},
        ],
    },
    {
        "board": "campus",
        "title": "Лучшие места в столовой",
        "hours_ago": 50,
        "posts": [
            {"body": "Где лучше обедать в корпусе на Ленинского?", "is_op": True},
            {"body": "Второй этаж после двух — очереди меньше, а выбор тот же."},
            {"body": ">>{0} плюс, там ещё и поспокойнее"},
            {"body": "Буфет у выхода — только если между парами и без вариантов."},
            {
                "body": "Сфоткал меню на сегодня, чтоб все знали:",
                "files": [
                    {
                        "name": "menu.png",
                        "content_type": "image/png",
                        "data": _png(480, 640, (90, 100, 128)),
                    },
                ],
            },
        ],
    },
    {
        "board": "campus",
        "title": "Тихие места для подготовки",
        "hours_ago": 9,
        "posts": [
            {"body": "Нужно тихое место, где можно час спокойно посидеть."},
            {"body": "Библиотека на верхнем этаже — лучшее открытие этого года."},
            {"body": ">>{0} только места берут заранее, поверьте"},
            {
                "body": "Ещё вариант — аудитории после шестого этажа, тоже пусто:",
                "files": [
                    {
                        "name": "quiet_rooms.png",
                        "content_type": "image/png",
                        "data": _png(512, 512, (128, 90, 200)),
                    },
                    {
                        "name": "reading_room.png",
                        "content_type": "image/png",
                        "data": _png(512, 288, (90, 128, 160)),
                    },
                ],
            },
            {"body": ">>{2} два скрина и один тихий вечер, спасибо"},
        ],
    },
    {
        "board": "campus",
        "title": "Как добраться до корпуса на Ленинского без пробок",
        "hours_ago": 30,
        "posts": [
            {"body": "Еду с севера — вечно час в дороге. Что не так с маршрутами?"},
            {
                "body": "Транспорт до конечной, потом 10 минут пешком — быстрее любой электрички."
            },
            {"body": ">>{0} подтверждаю, только учти утренний наплыв на входе"},
        ],
    },
    {
        "board": "faculties",
        "title": "ИУ7 / РКТ / РЛ — расскажите про свои факультеты",
        "hours_ago": 22,
        "pinned": True,
        "posts": [
            {"body": "Абитуриенты и первокурсники: спрашивайте, студенты отвечают."},
            {
                "body": "ИУ7 — программирование с первого курса, будьте готовы к матаналиу."
            },
            {"body": "РКТ — много физики, зато диплом признают везде."},
            {"body": ">>{0} на ИУ ещё English for engineers, не пугайтесь"},
            {"body": "РЛ — черчение с первой недели и робототехника дальше."},
            {"body": ">>{2} и генеральная линия: почувствуйте себя инженером"},
            {"body": "Спросите у старших по кафедре, а не только у однокурсников."},
        ],
    },
    {
        "board": "faculties",
        "title": "Перевод между факультетами — стоит ли?",
        "hours_ago": 7,
        "posts": [
            {
                "body": "Допустимо ли перевестись после первого курса и что для этого нужно?"
            },
            {"body": "Можно, но смотрим академическую разницу и свободные места."},
            {"body": ">>{0} и подготавливайте документы заранее, летом очередь"},
            {"body": "Я перевёлся в ИУ — не пожалел, но вспомните про друзей."},
        ],
    },
    {
        "board": "faculties",
        "title": "Зачем на факультете вообще военный цикл",
        "hours_ago": 60,
        "locked": True,
        "posts": [
            {"body": "Поясните коротко: зачем он и как влияет на расписание."},
            {"body": "Это часть программы: тактика, строевая и немного истории."},
            {"body": ">>{0} на втором курсе уже спокойнее, не переживайте"},
        ],
    },
]

# --- Platinum ----------------------------------------------------------------

SOURCES = [
    {
        "source_name": "студенческая газета",
        "source_identifier": "night-defense",
        "title": "Ночь перед защитой",
        "body": "Оригинальный текст, из которого сделана переработка.",
        "status": SourceStory.Status.USED,
        "meta": {"origin": "dev seed"},
    },
    {
        "source_name": "факультетская газета",
        "source_identifier": "first-scholarship",
        "title": "Первая стипендия",
        "body": "Оригинальный текст про первую выплату.",
        "status": SourceStory.Status.USED,
        "meta": {"origin": "dev seed"},
    },
    {
        "source_name": "студвесна",
        "source_identifier": "dorm-piano",
        "title": "Общага и пианино",
        "body": "Оригинальный текст про пианино на четвёртом этаже.",
        "status": SourceStory.Status.ALLOWED,
        "meta": {"origin": "dev seed"},
    },
    {
        "source_name": "внешний блог",
        "source_identifier": "random-story",
        "title": "Непроверенная история",
        "body": "Ожидает проверки — публиковать нельзя.",
        "status": SourceStory.Status.PENDING,
        "meta": {"origin": "dev seed"},
    },
]

PLATINUM_STORIES = [
    {
        "title": "Ночь перед защитой курсовой",
        "body": (
            "В корпусе было тихо, как не бывает даже в воскресенье. Артём сидел "
            "над чертежом, который не трогал двое суток, и вдруг понял, что боится "
            "не защиты — боится собственного молчания перед комиссией. За окном "
            "гас свет в соседнем крыле, и каждая минута казалась последней.\n\n"
            "Утром он пришёл первым, разложил листы и произнёс вслух ту самую фразу, "
            "которую репетировал полмесяца. Комиссия кивнула. Курсовую приняли, "
            "а он так и не узнал, чего боялся больше — неудовлетворительной оценки "
            "или того, что окажется недостаточно просто успеть."
        ),
        "source_type": "generated",
        "status": PlatinumStory.Status.PUBLISHED,
        "source": "night-defense",
    },
    {
        "title": "Первая стипендия",
        "body": (
            "Стипендия пришла в четверг, и почему-то именно тогда всё вокруг "
            "преобразилось. Кофе в автомате на первом этаже, который обычно "
            "казался горьким, оказался вполне терпимым, а путь до метро — "
            "самым коротким за семестр.\n\n"
            "Она ушла на три вещи: конспект за домашним столом, поездку к друзьям "
            "и маленький презент себе на день рождения, который будет только "
            "в марте. Вечером он написал домой: «Всё нормально. Учусь. Иногда "
            "даже хорошо получается»."
        ),
        "source_type": "generated",
        "status": PlatinumStory.Status.PUBLISHED,
        "source": "first-scholarship",
    },
    {
        "title": "Дедлайн в общаге на Раушской",
        "body": (
            "Четвёртый этаж, комната в конце коридора и один общий стол, за которым "
            "пятеро готовились к сессии одновременно. Кто-то решал диффуры, кто-то "
            "рисовал детали, кто-то просто спал, приложив к лицу учебник.\n\n"
            "К трём ночи до них дошло, что дедлайн — не враг. Враг — попытка сделать "
            "идеально в последний день. Они сдали работу с пометкой «будем "
            "дорабатывать», а потом дорабатывали. И выжили."
        ),
        "source_type": "generated",
        "status": PlatinumStory.Status.PUBLISHED,
    },
    {
        "title": "Как я нашёл свою кафедру",
        "body": (
            "На первом курсе всё казалось одновременно правильным выбором "
            "и ошибкой. Кафедру он нашёл не на ярмарке факультетов, а в "
            "разговоре после лекции, когда преподаватель сказал: «Вы слишком "
            "много думаете, чтобы просто сдавать».\n\n"
            "Он остался. Не потому что понял предмет, а потому что впервые "
            "почувствовал, что инженерия — это не про расчёты, а про решения, "
            "которые кто-то будет использовать."
        ),
        "source_type": "generated",
        "status": PlatinumStory.Status.PUBLISHED,
        "source": "dorm-piano",
    },
    {
        "title": "Один вопрос, который изменил взгляд на физику",
        "body": (
            "Она подняла руку на последней минуте лекции и спросила то, о чём "
            "думали полторы сотни человек. Преподаватель замолчал, посмотрел "
            "на доску и сказал: «Правильный вопрос. Разберём в следующий раз».\n\n"
            "В следующий раз очередь из желающих понять детали выстроилась у "
            "кафедры. Физика осталась физикой, но перестала быть стеной."
        ),
        "source_type": "generated",
        "status": PlatinumStory.Status.PUBLISHED,
    },
    {
        "title": "Общага, пианино и четвёртый этаж",
        "body": (
            "На четвёртом этаже стояло пианино, которое никто не настраивал "
            "с конца прошлого века. Вечерами туда приходили послушать, "
            "как кто-то пытается сыграть что-то сложное.\n\n"
            "Звук был расстроен, соседи стучали в трубу, но именно там "
            "впервые почувствовалось, что университет — это не только "
            "экзамены. Иногда это комната с расстроенным пианино "
            "и людьми, которые просто слушают."
        ),
        "source_type": "generated",
        "status": PlatinumStory.Status.PUBLISHED,
        "source": "dorm-piano",
    },
]

# Неопубликованное: в публичном архиве не должно отображаться.
PLATINUM_STORIES += [
    {
        "title": "Черновик: история про первый поезд в метро",
        "body": "Ещё не готова к публикации.",
        "source_type": "generated",
        "status": PlatinumStory.Status.GENERATED,
    },
    {
        "title": "Отклонённая история",
        "body": "История, не прошедшая проверку.",
        "source_type": "generated",
        "status": PlatinumStory.Status.REJECTED,
    },
]


class Command(BaseCommand):
    help = "Загрузить идемпотентные тестовые данные для разработки."

    def handle(self, *args, **options):
        self.stdout.write("Загрузка seed data...")

        # --- boards ---------------------------------------------------------
        boards = {}
        for data in BOARDS:
            board, _ = Board.objects.update_or_create(
                slug=data["slug"],
                defaults={
                    "name": data["name"],
                    "description": data["description"],
                    "rules": data.get("rules", ""),
                    "order": data["order"],
                    "is_active": True,
                },
            )
            boards[data["slug"]] = board
        self.stdout.write(self.style.SUCCESS(f"  → {len(boards)} разделов"))

        # --- threads + posts --------------------------------------------------
        thread_count = 0
        post_count = 0
        for spec in THREADS:
            board = boards[spec["board"]]
            thread = Thread.objects.filter(board=board, title=spec["title"]).first()
            if thread is None:
                thread = Thread.objects.create(
                    board=board,
                    title=spec["title"],
                    bumped_at=timezone.now(),
                )
                thread_count += 1

            has_op = thread.posts.filter(is_op=True).exists()
            # ids по порядку, чтобы {0}, {1}… превращались в настоящие >>ссылки
            post_ids = list(thread.posts.order_by("id").values_list("id", flat=True))
            for index, post_spec in enumerate(spec["posts"]):
                try:
                    body = post_spec["body"].format(*post_ids)
                except IndexError:
                    body = post_spec["body"]
                is_op = bool(post_spec.get("is_op")) or (index == 0 and not has_op)
                post, created = Post.objects.get_or_create(
                    thread=thread,
                    body=body,
                    defaults={"is_op": is_op},
                )
                if created:
                    if is_op and not has_op:
                        has_op = True
                    post_ids.append(post.id)
                    post_count += 1
                # even for existing posts: attachments are created/self-healed
                self._attach(post, post_spec.get("files", []))

            # сроки: раскладываем треды по времени, чтобы порядок был живым
            age_hours = spec.get("hours_ago", 1)
            Thread.objects.filter(pk=thread.pk).update(
                bumped_at=timezone.now() - timezone.timedelta(hours=age_hours),
                created_at=timezone.now() - timezone.timedelta(hours=age_hours + 2),
                is_pinned=spec.get("pinned", False),
                is_locked=spec.get("locked", False),
            )
        self.stdout.write(
            self.style.SUCCESS(f"  → {thread_count} тредов, {post_count} постов")
        )

        # --- sources + platinum ------------------------------------------------
        sources = {}
        for spec in SOURCES:
            source, _ = SourceStory.objects.update_or_create(
                source_identifier=spec["source_identifier"],
                defaults={
                    "source_name": spec["source_name"],
                    "title": spec["title"],
                    "body": spec["body"],
                    "status": spec["status"],
                    "meta": spec["meta"],
                },
            )
            sources[spec["source_identifier"]] = source

        platinum_count = 0
        for spec in PLATINUM_STORIES:
            defaults = {
                "body": spec["body"],
                "source_type": spec["source_type"],
                "status": spec["status"],
            }
            if spec["status"] == PlatinumStory.Status.PUBLISHED:
                defaults["published_at"] = timezone.now() - timezone.timedelta(
                    days=platinum_count
                )
            source = sources.get(spec.get("source", ""))
            if source is not None:
                defaults["source_story"] = source
            _, created = PlatinumStory.objects.update_or_create(
                title=spec["title"], defaults=defaults
            )
            if created:
                platinum_count += 1
        self.stdout.write(self.style.SUCCESS(f"  → {platinum_count} платин"))

        self.stdout.write(self.style.SUCCESS("Seed data загружена."))

    def _attach(self, post: Post, files: list[dict]) -> None:
        if not files:
            return
        pending = list(
            post.attachments.filter(original_name__in=[f["name"] for f in files])
        )
        for spec in files:
            data = spec["data"]
            width, height = _png_size(data)
            existing = next(
                (a for a in pending if a.original_name == spec["name"]), None
            )
            if existing is not None:
                # self-heal: earlier seeds stored attachments without dims
                if existing.width is None and width:
                    existing.width = width
                    existing.height = height
                    existing.save()
                continue
            upload = ContentFile(data, name=spec["name"])
            upload.content_type = spec["content_type"]  # type: ignore[attr-defined]
            Attachment.objects.create(
                post=post,
                file=upload,
                mime_type=spec["content_type"],
                size=len(data),
                width=width,
                height=height,
                original_name=spec["name"],
            )
