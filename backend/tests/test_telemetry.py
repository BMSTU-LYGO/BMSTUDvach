import pytest


class TestTelemetry:
    @pytest.mark.django_db
    def test_empty_network_returns_zeros(self, api_client):
        resp = api_client.get("/api/v1/telemetry/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["boards"] == 0
        assert data["threads"] == 0
        assert data["posts"] == 0
        assert data["attachments"] == 0
        assert data["last_24h"] == {"posts": 0, "threads": 0}
        assert data["busiest_board"] is None
        assert data["generated_at"]

    @pytest.mark.django_db
    def test_counts_visible_content(self, api_client, board, thread):
        from apps.forum.models import Attachment, Post, Thread

        second = Thread.objects.create(board=board, title="Второй тред")
        Post.objects.create(thread=second, body="op", is_op=True)
        reply = Post.objects.create(thread=thread, body="Ответ")
        Attachment.objects.create(post=reply, original_name="a.png")

        resp = api_client.get("/api/v1/telemetry/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["boards"] == 1
        assert data["threads"] == 2
        assert data["posts"] == 3
        assert data["attachments"] == 1

    @pytest.mark.django_db
    def test_hidden_and_inactive_content_not_counted(self, api_client, board):
        from apps.forum.models import Attachment, Board, Post, Thread

        visible_thread = Thread.objects.create(board=board, title="Видимый")
        visible_op = Post.objects.create(thread=visible_thread, body="op", is_op=True)
        Attachment.objects.create(post=visible_op, original_name="visible.png")
        hidden_post = Post.objects.create(
            thread=visible_thread, body="Скрытый ответ", is_hidden=True
        )
        Attachment.objects.create(post=hidden_post, original_name="hidden.png")

        hidden_thread = Thread.objects.create(
            board=board, title="Скрытый тред", is_hidden=True
        )
        Post.objects.create(thread=hidden_thread, body="op скрытого", is_op=True)

        inactive = Board.objects.create(slug="dead", name="Мёртвый", is_active=False)
        dead_thread = Thread.objects.create(board=inactive, title="Тред мертвеца")
        dead_post = Post.objects.create(thread=dead_thread, body="op", is_op=True)
        Attachment.objects.create(post=dead_post, original_name="dead.png")

        resp = api_client.get("/api/v1/telemetry/")
        data = resp.json()
        assert data["boards"] == 1
        assert data["threads"] == 1
        assert data["posts"] == 1
        assert data["attachments"] == 1
        assert data["last_24h"] == {"posts": 1, "threads": 1}
        assert data["busiest_board"] == {"slug": "b", "name": "Разное", "posts": 1}

    @pytest.mark.django_db
    def test_busiest_board_is_the_one_with_most_posts(self, api_client, board):
        from apps.forum.models import Board, Post, Thread

        other = Board.objects.create(slug="study", name="Учёба")
        quiet = Thread.objects.create(board=other, title="Тихий тред")
        Post.objects.create(thread=quiet, body="op", is_op=True)

        loud = Thread.objects.create(board=board, title="Шумный тред")
        Post.objects.create(thread=loud, body="op", is_op=True)
        for i in range(3):
            Post.objects.create(thread=loud, body=f"Ответ {i}")

        resp = api_client.get("/api/v1/telemetry/")
        busiest = resp.json()["busiest_board"]
        assert busiest == {"slug": "b", "name": "Разное", "posts": 4}

    @pytest.mark.django_db
    def test_busiest_board_ignores_hidden_posts(self, api_client, board):
        from apps.forum.models import Board, Post, Thread

        hidden_heavy = Thread.objects.create(board=board, title="Полный скрытых")
        for i in range(5):
            Post.objects.create(thread=hidden_heavy, body=f"Скрытый {i}", is_hidden=True)
        Post.objects.create(thread=hidden_heavy, body="op", is_op=True)

        other = Board.objects.create(slug="study", name="Учёба")
        visible = Thread.objects.create(board=other, title="Видимый")
        Post.objects.create(thread=visible, body="op", is_op=True)
        Post.objects.create(thread=visible, body="Ответ")

        resp = api_client.get("/api/v1/telemetry/")
        assert resp.json()["busiest_board"] == {
            "slug": "study",
            "name": "Учёба",
            "posts": 2,
        }

    @pytest.mark.django_db
    def test_last_24h_excludes_older_content(self, api_client, board):
        from datetime import timedelta

        from django.utils import timezone

        from apps.forum.models import Post, Thread

        old_thread = Thread.objects.create(board=board, title="Старый тред")
        old_post = Post.objects.create(thread=old_thread, body="op", is_op=True)
        Post.objects.filter(pk=old_post.id).update(
            created_at=timezone.now() - timedelta(hours=48)
        )
        Thread.objects.filter(pk=old_thread.id).update(
            created_at=timezone.now() - timedelta(hours=48)
        )

        fresh_thread = Thread.objects.create(board=board, title="Свежий тред")
        Post.objects.create(thread=fresh_thread, body="op", is_op=True)
        Post.objects.create(thread=fresh_thread, body="Свежий ответ")
        old_hidden_reply = Post.objects.create(
            thread=fresh_thread, body="Старый скрытый", is_hidden=True
        )
        Post.objects.filter(pk=old_hidden_reply.id).update(
            created_at=timezone.now() - timedelta(hours=48)
        )

        resp = api_client.get("/api/v1/telemetry/")
        data = resp.json()
        assert data["last_24h"] == {"posts": 2, "threads": 1}
        assert data["posts"] == 3
        assert data["threads"] == 2

    @pytest.mark.django_db
    def test_telemetry_is_public(self, api_client, board, thread):
        resp = api_client.get("/api/v1/telemetry/")
        assert resp.status_code == 200
        assert resp["Content-Type"] == "application/json"
        assert set(resp.json()) == {
            "boards",
            "threads",
            "posts",
            "attachments",
            "last_24h",
            "busiest_board",
            "generated_at",
        }
