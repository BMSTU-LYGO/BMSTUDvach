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


class TestTelemetryActivity:
    @pytest.mark.django_db
    def test_seven_day_window_is_fixed_length_and_ordered(self, api_client, board):
        from datetime import timedelta

        from django.utils import timezone

        from apps.forum.models import Post, Thread

        live = Thread.objects.create(board=board, title="Сегодняшний тред")
        Post.objects.create(thread=live, body="op", is_op=True)

        resp = api_client.get("/api/v1/telemetry/activity/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["days"] == 7
        assert len(data["points"]) == 7

        dates = [point["date"] for point in data["points"]]
        today = timezone.localdate()
        assert dates == sorted(dates)
        assert dates[-1] == today.isoformat()
        assert dates[0] == (today - timedelta(days=6)).isoformat()

        # days without content read as honest zeros
        today_point = data["points"][-1]
        assert today_point["posts"] == 1
        assert today_point["threads"] == 1
        for point in data["points"][:-1]:
            assert point["posts"] == 0
            assert point["threads"] == 0

    @pytest.mark.django_db
    def test_posts_bucket_into_their_own_days(self, api_client, board):
        from datetime import timedelta

        from django.utils import timezone

        from apps.forum.models import Post, Thread

        today = timezone.localdate()
        thread = Thread.objects.create(board=board, title="Тред")
        Post.objects.create(thread=thread, body="сегодня", is_op=True)
        yesterday = Post.objects.create(thread=thread, body="вчера")
        older = Post.objects.create(thread=thread, body="позавчера")

        Post.objects.filter(pk=yesterday.id).update(
            created_at=timezone.now() - timedelta(days=1)
        )
        Post.objects.filter(pk=older.id).update(
            created_at=timezone.now() - timedelta(days=3)
        )

        resp = api_client.get("/api/v1/telemetry/activity/?days=7")
        points = {point["date"]: point for point in resp.json()["points"]}
        assert points[today.isoformat()]["posts"] == 1
        assert points[(today - timedelta(days=1)).isoformat()]["posts"] == 1
        assert points[(today - timedelta(days=3)).isoformat()]["posts"] == 1

    @pytest.mark.django_db
    def test_hidden_and_inactive_content_not_counted(self, api_client, board):
        from apps.forum.models import Board, Post, Thread

        live = Thread.objects.create(board=board, title="Живой")
        Post.objects.create(thread=live, body="op", is_op=True)
        Post.objects.create(thread=live, body="видимый ответ")

        hidden_thread = Thread.objects.create(
            board=board, title="Скрытый тред", is_hidden=True
        )
        Post.objects.create(thread=hidden_thread, body="op", is_op=True)
        Post.objects.create(thread=live, body="скрытый ответ", is_hidden=True)

        inactive = Board.objects.create(slug="dead", name="Мёртвый", is_active=False)
        dead = Thread.objects.create(board=inactive, title="Тред мертвеца")
        Post.objects.create(thread=dead, body="op", is_op=True)

        resp = api_client.get("/api/v1/telemetry/activity/?days=7")
        today = resp.json()["points"][-1]
        assert today["threads"] == 1
        assert today["posts"] == 2

    @pytest.mark.django_db
    @pytest.mark.parametrize("raw", ["abc", "0", "-3", "31", "7.5", ""])
    def test_invalid_days_falls_back_to_seven(self, api_client, board, raw):
        resp = api_client.get(f"/api/v1/telemetry/activity/?days={raw}")
        assert resp.status_code == 200
        assert resp.json()["days"] == 7
        assert len(resp.json()["points"]) == 7

    @pytest.mark.django_db
    def test_thirty_day_window(self, api_client, board):
        resp = api_client.get("/api/v1/telemetry/activity/?days=30")
        assert resp.status_code == 200
        data = resp.json()
        assert data["days"] == 30
        assert len(data["points"]) == 30

    @pytest.mark.django_db
    def test_activity_is_public(self, api_client):
        resp = api_client.get("/api/v1/telemetry/activity/")
        assert resp.status_code == 200
        assert set(resp.json()) == {"days", "points"}
