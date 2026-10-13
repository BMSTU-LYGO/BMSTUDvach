import pytest
from django.conf import settings
from django.test import override_settings

from apps.forum.models import Post

POSTS_URL = "/api/v1/threads/{thread_id}/posts/"


def add_posts(thread, count, *, is_op=False, sage=False, hidden=False):
    for start in range(0, count, 100):
        chunk = [
            Post(
                thread=thread,
                body=f"Тело {index}",
                is_op=is_op,
                sage=sage,
                is_hidden=hidden,
            )
            for index in range(start, min(start + 100, count))
        ]
        Post.objects.bulk_create(chunk)


@pytest.fixture
def pinned_thread(board):
    from apps.forum.models import Post, Thread

    thread = Thread.objects.create(
        board=board, title="Закреплённый тред", is_pinned=True
    )
    Post.objects.create(thread=thread, body="Тело OP", is_op=True)
    return thread


class TestAutolock:
    @pytest.mark.django_db
    def test_post_that_reaches_default_limit_locks_thread(
        self, api_client, board, thread
    ):
        assert settings.THREAD_POST_LIMIT == 500
        add_posts(thread, settings.THREAD_POST_LIMIT - 1)

        resp = api_client.post(
            POSTS_URL.format(thread_id=thread.pk), {"body": "Последний"}
        )
        assert resp.status_code == 201
        assert resp.json()["body"] == "Последний"

        thread.refresh_from_db()
        assert thread.is_locked is True

    @pytest.mark.django_db
    def test_reply_after_autolock_is_rejected(self, api_client, thread):
        with override_settings(THREAD_POST_LIMIT=2):
            assert api_client.post(
                POSTS_URL.format(thread_id=thread.pk), {"body": "Лимитный"}
            ).status_code == 201

        thread.refresh_from_db()
        assert thread.is_locked is True

        resp = api_client.post(
            POSTS_URL.format(thread_id=thread.pk), {"body": "Слишком поздно"}
        )
        assert resp.status_code == 400
        assert "locked" in str(resp.json())
        assert thread.posts.count() == 2

    @pytest.mark.django_db
    def test_autolock_honours_overridden_limit(self, api_client, thread):
        with override_settings(THREAD_POST_LIMIT=3):
            resp = api_client.post(
                POSTS_URL.format(thread_id=thread.pk), {"body": "Ответ"}
            )
            assert resp.status_code == 201

            thread.refresh_from_db()
            assert thread.is_locked is False

            resp = api_client.post(
                POSTS_URL.format(thread_id=thread.pk), {"body": "Лимитный ответ"}
            )
            assert resp.status_code == 201

        thread.refresh_from_db()
        assert thread.is_locked is True

    @pytest.mark.django_db
    def test_below_limit_thread_stays_open(self, api_client, thread):
        add_posts(thread, 10)
        resp = api_client.post(
            POSTS_URL.format(thread_id=thread.pk), {"body": "Ещё один"}
        )
        assert resp.status_code == 201

        thread.refresh_from_db()
        assert thread.is_locked is False
        assert thread.posts.count() == 12

    @pytest.mark.django_db
    def test_hidden_posts_do_not_reach_limit(self, api_client, thread):
        with override_settings(THREAD_POST_LIMIT=3):
            add_posts(thread, 6, hidden=True)

            resp = api_client.post(
                POSTS_URL.format(thread_id=thread.pk), {"body": "Живой"}
            )
            assert resp.status_code == 201

            thread.refresh_from_db()
            assert thread.is_locked is False
            assert thread.posts.filter(is_hidden=False).count() == 2

            resp = api_client.post(
                POSTS_URL.format(thread_id=thread.pk), {"body": "Лимитный"}
            )
            assert resp.status_code == 201

        thread.refresh_from_db()
        assert thread.is_locked is True

    @pytest.mark.django_db
    def test_sage_posts_count_towards_limit(self, api_client, thread):
        with override_settings(THREAD_POST_LIMIT=2):
            resp = api_client.post(
                POSTS_URL.format(thread_id=thread.pk),
                {"body": "Тихий сигнал", "sage": True},
            )
            assert resp.status_code == 201
            assert resp.json()["sage"] is True

        thread.refresh_from_db()
        assert thread.is_locked is True

    @pytest.mark.django_db
    def test_pinned_thread_autolocks(self, api_client, pinned_thread):
        with override_settings(THREAD_POST_LIMIT=3):
            add_posts(pinned_thread, 1)
            resp = api_client.post(
                POSTS_URL.format(thread_id=pinned_thread.pk), {"body": "Лимитный ответ"}
            )
            assert resp.status_code == 201

            pinned_thread.refresh_from_db()
            assert pinned_thread.is_locked is True
            assert pinned_thread.is_pinned is True
