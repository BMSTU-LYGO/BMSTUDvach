import pytest


class TestBoards:
    @pytest.mark.django_db
    def test_list_boards(self, api_client, board):
        resp = api_client.get("/api/v1/boards/")
        assert resp.status_code == 200
        assert any(b["slug"] == "b" for b in resp.json())

    @pytest.mark.django_db
    def test_retrieve_board(self, api_client, board):
        resp = api_client.get("/api/v1/boards/b/")
        assert resp.status_code == 200
        assert resp.json()["slug"] == "b"

    @pytest.mark.django_db
    def test_inactive_board_not_visible(self, api_client):
        from apps.forum.models import Board

        Board.objects.create(slug="hidden", name="Hidden", is_active=False)
        resp = api_client.get("/api/v1/boards/")
        assert not any(b["slug"] == "hidden" for b in resp.json())
        resp = api_client.get("/api/v1/boards/hidden/")
        assert resp.status_code == 404


class TestThreads:
    @pytest.mark.django_db
    def test_create_thread(self, api_client, board):
        resp = api_client.post(
            "/api/v1/boards/b/threads/",
            {"title": "Новый тред", "body": "Тело OP"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Новый тред"
        assert len(data["posts"]) == 1
        assert data["posts"][0]["is_op"] is True
        assert data["reply_count"] == 0

    @pytest.mark.django_db
    def test_create_thread_empty_title_fails(self, api_client, board):
        resp = api_client.post(
            "/api/v1/boards/b/threads/",
            {"title": "", "body": "Тело"},
        )
        assert resp.status_code == 400

    @pytest.mark.django_db
    def test_create_thread_empty_body_fails(self, api_client, board):
        resp = api_client.post(
            "/api/v1/boards/b/threads/",
            {"title": "Заголовок", "body": ""},
        )
        assert resp.status_code == 400

    @pytest.mark.django_db
    def test_list_threads(self, api_client, board, thread):
        resp = api_client.get("/api/v1/boards/b/threads/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 1
        assert data["results"][0]["title"] == "Тестовый тред"

    @pytest.mark.django_db
    def test_list_threads_pinned_first(self, api_client, board):
        from apps.forum.models import Post, Thread

        t1 = Thread.objects.create(board=board, title="Обычный")
        Post.objects.create(thread=t1, body="op1", is_op=True)
        t2 = Thread.objects.create(board=board, title="Закреп", is_pinned=True)
        Post.objects.create(thread=t2, body="op2", is_op=True)

        resp = api_client.get("/api/v1/boards/b/threads/")
        results = resp.json()["results"]
        assert results[0]["title"] == "Закреп"
        assert results[1]["title"] == "Обычный"

    @pytest.mark.django_db
    def test_retrieve_thread(self, api_client, board, thread, op_post):
        resp = api_client.get(f"/api/v1/threads/{thread.pk}/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Тестовый тред"
        assert len(data["posts"]) == 1

    @pytest.mark.django_db
    def test_hidden_thread_not_visible(self, api_client, board, thread):
        thread.is_hidden = True
        thread.save()
        resp = api_client.get(f"/api/v1/threads/{thread.pk}/")
        assert resp.status_code == 404


class TestPosts:
    @pytest.mark.django_db
    def test_create_reply(self, api_client, board, thread):
        resp = api_client.post(
            f"/api/v1/threads/{thread.pk}/posts/",
            {"body": "Ответ"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["body"] == "Ответ"
        assert data["is_op"] is False

    @pytest.mark.django_db
    def test_reply_bumps_thread(self, api_client, board, thread):
        old_bumped = thread.bumped_at
        api_client.post(
            f"/api/v1/threads/{thread.pk}/posts/",
            {"body": "Ответ"},
        )
        thread.refresh_from_db()
        assert thread.bumped_at >= old_bumped

    @pytest.mark.django_db
    def test_reply_to_locked_thread_fails(self, api_client, board, thread):
        thread.is_locked = True
        thread.save()
        resp = api_client.post(
            f"/api/v1/threads/{thread.pk}/posts/",
            {"body": "Ответ"},
        )
        assert resp.status_code == 400

    @pytest.mark.django_db
    def test_retrieve_post(self, api_client, op_post):
        resp = api_client.get(f"/api/v1/posts/{op_post.pk}/")
        assert resp.status_code == 200
        assert resp.json()["body"] == "Тело OP"

    @pytest.mark.django_db
    def test_hidden_post_not_visible(self, api_client, op_post):
        op_post.is_hidden = True
        op_post.save()
        resp = api_client.get(f"/api/v1/posts/{op_post.pk}/")
        assert resp.status_code == 404


class TestReports:
    @pytest.mark.django_db
    def test_create_report(self, api_client, op_post):
        resp = api_client.post(
            f"/api/v1/posts/{op_post.pk}/reports/",
            {"reason": "spam", "comment": "Спам-пост"},
        )
        assert resp.status_code == 201
        assert "id" in resp.json()

    @pytest.mark.django_db
    def test_report_invalid_reason_fails(self, api_client, op_post):
        resp = api_client.post(
            f"/api/v1/posts/{op_post.pk}/reports/",
            {"reason": "invalid_reason"},
        )
        assert resp.status_code == 400

    @pytest.mark.django_db
    def test_report_hidden_post_fails(self, api_client, op_post):
        op_post.is_hidden = True
        op_post.save()
        resp = api_client.post(
            f"/api/v1/posts/{op_post.pk}/reports/",
            {"reason": "spam"},
        )
        assert resp.status_code == 404
