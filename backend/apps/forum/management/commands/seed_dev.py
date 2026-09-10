"""seed_dev — idempotent development data loader."""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.forum.models import Board, Post, Thread
from apps.platinum.models import PlatinumStory

BOARDS = [
    {"slug": "b", "name": "Разное", "description": "Обо всём понемногу", "order": 0},
    {"slug": "study", "name": "Учёба", "description": "Обсуждение учёбы", "order": 1},
    {
        "slug": "campus",
        "name": "Кампус",
        "description": "Жизнь в вузе",
        "order": 2,
    },
    {
        "slug": "faculties",
        "name": "Факультеты",
        "description": "Разделы по факультетам",
        "order": 3,
    },
]

THREADS = [
    {
        "board": "b",
        "title": "Добро пожаловать на BMSTUDvach",
        "posts": [
            {"body": "Первый тред на форуме. Добро пожаловать!", "is_op": True},
            {"body": "Наконец-то нормальный форум для Баумана.", "is_op": False},
            {"body": "Плюсую.", "is_op": False},
        ],
    },
    {
        "board": "study",
        "title": "Советы по сдаче сессии",
        "posts": [
            {
                "body": "Как готовитесь к экзаменам? Делитесь советами.",
                "is_op": True,
            },
            {
                "body": "Начинайте за неделю, не откладывайте.",
                "is_op": False,
            },
        ],
    },
    {
        "board": "campus",
        "title": "Лучшие места в столовой",
        "posts": [
            {"body": "Где лучше всего обедать в корпусе на Ленинском?", "is_op": True},
        ],
    },
]

PLATINUM_STORIES = [
    {
        "title": "Как я проспал на защиту",
        "body": (
            "Это история о том, как я проспал на защиту курсовой. "
            "Будильник не сработал, а室友 уехал домой на выходные..."
        ),
        "source_type": "generated",
        "status": PlatinumStory.Status.PUBLISHED,
    },
]


class Command(BaseCommand):
    help = "Загрузить идемпотентные тестовые данные для разработки."

    def handle(self, *args, **options):
        self.stdout.write("Загрузка seed data...")

        for data in BOARDS:
            Board.objects.get_or_create(
                slug=data["slug"],
                defaults={
                    "name": data["name"],
                    "description": data["description"],
                    "order": data["order"],
                },
            )
        self.stdout.write(self.style.SUCCESS(f"  → {len(BOARDS)} разделов"))

        thread_count = 0
        post_count = 0
        for thread_data in THREADS:
            board = Board.objects.get(slug=thread_data["board"])
            thread, created = Thread.objects.get_or_create(
                board=board,
                title=thread_data["title"],
                defaults={"bumped_at": timezone.now()},
            )
            if created:
                thread_count += 1
                for _i, post_data in enumerate(thread_data["posts"]):
                    Post.objects.create(
                        thread=thread,
                        body=post_data["body"],
                        is_op=post_data["is_op"],
                    )
                    post_count += 1
        self.stdout.write(
            self.style.SUCCESS(f"  → {thread_count} тредов, {post_count} постов")
        )

        platinum_count = 0
        for story_data in PLATINUM_STORIES:
            _, created = PlatinumStory.objects.get_or_create(
                title=story_data["title"],
                defaults={
                    "body": story_data["body"],
                    "source_type": story_data["source_type"],
                    "status": story_data["status"],
                },
            )
            if created:
                platinum_count += 1
        self.stdout.write(self.style.SUCCESS(f"  → {platinum_count} платин"))

        self.stdout.write(self.style.SUCCESS("Seed data загружена."))
