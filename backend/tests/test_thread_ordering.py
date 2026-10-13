from datetime import timedelta

import pytest
from django.utils import timezone

from apps.forum.models import Post, Thread

THREADS_URL = "/api/v1/boards/b/threads/"


def add_thread(
    board,
    title,
    *,
    replies=0,
    bump_offset=0,
    age_offset=0,
    pinned=False,
) -> Thread:
    now = timezone.now()
    thread = Thread.objects.create(
        board=board,
        title=title,
        is_pinned=pinned,
        bumped_at=now - timedelta(minutes=bump_offset),
    )
    Post.objects.create(thread=thread, body="Тело OP", is_op=True)
    for index in range(replies):
        Post.objects.create(thread=thread, body=f"Ответ {index}")
    if age_offset:
        Thread.objects.filter(pk=thread.pk).update(
            created_at=now - timedelta(minutes=age_offset)
        )
    return thread


@pytest.fixture
def threads(board):
    """Three threads whose bump, reply and creation orders all differ."""
    return {
        "busy": add_thread(
            board, "Много ответов", replies=3, bump_offset=120, age_offset=180
        ),
        "fresh": add_thread(board, "Свежий", replies=1, bump_offset=60, age_offset=10),
        "bumped": add_thread(board, "Поднятый", bump_offset=5, age_offset=90),
    }


BUMP_ORDER = ("bumped", "fresh", "busy")


def result_ids(response) -> list[int]:
    return [row["id"] for row in response.json()["results"]]


def thread_ids(threads, keys) -> list[int]:
    return [threads[key].id for key in keys]


class TestThreadOrdering:
    @pytest.mark.django_db
    def test_default_order_is_bump(self, api_client, board, threads):
        resp = api_client.get(THREADS_URL)
        assert resp.status_code == 200
        assert result_ids(resp) == thread_ids(threads, BUMP_ORDER)

    @pytest.mark.django_db
    def test_order_replies_sorts_by_reply_count(self, api_client, board, threads):
        resp = api_client.get(THREADS_URL, {"order": "replies"})
        assert resp.status_code == 200
        assert result_ids(resp) == thread_ids(threads, ("busy", "fresh", "bumped"))

    @pytest.mark.django_db
    def test_order_newest_sorts_by_created_at(self, api_client, board, threads):
        resp = api_client.get(THREADS_URL, {"order": "newest"})
        assert resp.status_code == 200
        assert result_ids(resp) == thread_ids(threads, ("fresh", "bumped", "busy"))

    @pytest.mark.django_db
    def test_pinned_thread_leads_every_order(self, api_client, board, threads):
        pinned = add_thread(
            board, "Закреп", bump_offset=300, age_offset=300, pinned=True
        )
        for order in ("bump", "replies", "newest"):
            resp = api_client.get(THREADS_URL, {"order": order})
            assert resp.status_code == 200
            assert result_ids(resp)[0] == pinned.id

    @pytest.mark.django_db
    def test_unknown_order_falls_back_to_bump(self, api_client, board, threads):
        resp = api_client.get(THREADS_URL, {"order": "sideways"})
        assert resp.status_code == 200
        assert result_ids(resp) == thread_ids(threads, BUMP_ORDER)

    @pytest.mark.django_db
    def test_empty_order_falls_back_to_bump(self, api_client, board, threads):
        resp = api_client.get(THREADS_URL, {"order": ""})
        assert resp.status_code == 200
        assert result_ids(resp) == thread_ids(threads, BUMP_ORDER)

    @pytest.mark.django_db
    def test_order_value_is_matched_exactly(self, api_client, board, threads):
        resp = api_client.get(THREADS_URL, {"order": "REPLIES"})
        assert resp.status_code == 200
        assert result_ids(resp) == thread_ids(threads, BUMP_ORDER)
