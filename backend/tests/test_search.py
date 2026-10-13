import pytest


class TestSearch:
    @pytest.mark.django_db
    def test_search_requires_query(self, api_client):
        resp = api_client.get("/api/v1/search/")
        assert resp.status_code == 200
        assert resp.json() == {"query": "", "threads": [], "posts": []}

    @pytest.mark.django_db
    def test_search_finds_threads_by_title(self, api_client, board):
        from apps.forum.models import Post, Thread

        t = Thread.objects.create(board=board, title="Где лучше обедать")
        Post.objects.create(thread=t, body="Тело OP", is_op=True)

        resp = api_client.get("/api/v1/search/?q=обедать")
        assert resp.status_code == 200
        titles = [t["title"] for t in resp.json()["threads"]]
        assert titles == ["Где лучше обедать"]

    @pytest.mark.django_db
    def test_search_finds_posts_with_snippet(self, api_client, thread):
        resp = api_client.get("/api/v1/search/?q=Тело")
        posts = resp.json()["posts"]
        assert len(posts) == 1
        assert posts[0]["thread"] == thread.id
        assert posts[0]["thread_title"] == thread.title
        assert "Тело" in posts[0]["snippet"]

    @pytest.mark.django_db
    def test_search_skips_hidden_content(self, api_client, board):
        from apps.forum.models import Post, Thread

        visible = Thread.objects.create(board=board, title="Видимый тред")
        Post.objects.create(thread=visible, body="Тело OP", is_op=True)
        hidden = Thread.objects.create(
            board=board, title="Скрытый тред", is_hidden=True
        )
        Post.objects.create(thread=hidden, body="Тело скрытого", is_op=True)

        resp = api_client.get("/api/v1/search/?q=тред")
        titles = [t["title"] for t in resp.json()["threads"]]
        assert titles == ["Видимый тред"]

        posts = resp.json()["posts"]
        assert all(p["thread_title"] != "Скрытый тред" for p in posts)

    @pytest.mark.django_db
    def test_search_case_insensitive(self, api_client, thread):
        resp = api_client.get("/api/v1/search/?q=тело")
        assert len(resp.json()["posts"]) == 1

    @pytest.mark.django_db
    def test_search_board_scope_narrows_threads_and_posts(self, api_client, board):
        from apps.forum.models import Board, Post, Thread

        tech = Board.objects.create(slug="tech", name="Технологии")

        target = Thread.objects.create(board=tech, title="Кофе и процессоры")
        Post.objects.create(thread=target, body="Тело OP", is_op=True)
        Post.objects.create(thread=target, body="жажда кофе")

        noise = Thread.objects.create(board=board, title="Кофе в столовой")
        Post.objects.create(thread=noise, body="Тело OP", is_op=True)
        Post.objects.create(thread=noise, body="где кофе?")

        resp = api_client.get("/api/v1/search/?q=кофе&board=tech")
        assert resp.status_code == 200
        body = resp.json()
        assert [t["title"] for t in body["threads"]] == ["Кофе и процессоры"]
        assert [p["thread_title"] for p in body["posts"]] == ["Кофе и процессоры"]

    @pytest.mark.django_db
    def test_search_unknown_board_returns_empty_lists(self, api_client, thread):
        resp = api_client.get("/api/v1/search/?q=Тело&board=no-such-board")
        assert resp.status_code == 200
        body = resp.json()
        assert body["query"] == "Тело"
        assert body["threads"] == []
        assert body["posts"] == []

    @pytest.mark.django_db
    def test_search_without_board_spans_every_board(self, api_client, board):
        from apps.forum.models import Board, Post, Thread

        tech = Board.objects.create(slug="tech", name="Технологии")

        first = Thread.objects.create(board=board, title="Кофе в столовой")
        Post.objects.create(thread=first, body="Тело OP", is_op=True)
        second = Thread.objects.create(board=tech, title="Кофе и процессоры")
        Post.objects.create(thread=second, body="Тело OP", is_op=True)
        Post.objects.create(thread=second, body="вкус кофе")

        resp = api_client.get("/api/v1/search/?q=кофе")
        assert resp.status_code == 200
        body = resp.json()
        assert sorted(t["title"] for t in body["threads"]) == [
            "Кофе в столовой",
            "Кофе и процессоры",
        ]
        assert [p["thread_title"] for p in body["posts"]] == ["Кофе и процессоры"]

    @pytest.mark.django_db
    def test_search_board_scope_hides_other_boards_posts(self, api_client, board):
        from apps.forum.models import Board, Post, Thread

        tech = Board.objects.create(slug="tech", name="Технологии")

        own = Thread.objects.create(board=tech, title="череп для тех")
        Post.objects.create(thread=own, body="череп", is_op=True)
        other = Thread.objects.create(board=board, title="череп для разного")
        Post.objects.create(thread=other, body="череп", is_op=True)

        resp = api_client.get("/api/v1/search/?q=череп&board=tech")
        body = resp.json()
        assert [t["title"] for t in body["threads"]] == ["череп для тех"]
        assert [p["thread_title"] for p in body["posts"]] == ["череп для тех"]

    @pytest.mark.django_db
    def test_search_empty_board_param_behaves_like_no_board(self, api_client, board):
        from apps.forum.models import Board, Post, Thread

        tech = Board.objects.create(slug="tech", name="Технологии")

        first = Thread.objects.create(board=board, title="Кофе в столовой")
        Post.objects.create(thread=first, body="Тело OP", is_op=True)
        second = Thread.objects.create(board=tech, title="Кофе и процессоры")
        Post.objects.create(thread=second, body="утро и кофе", is_op=True)

        resp = api_client.get("/api/v1/search/?q=кофе&board=")
        body = resp.json()
        assert sorted(t["title"] for t in body["threads"]) == [
            "Кофе в столовой",
            "Кофе и процессоры",
        ]
        assert [p["thread_title"] for p in body["posts"]] == ["Кофе и процессоры"]

    @pytest.mark.django_db
    def test_search_snippet_marks_bounds(self, api_client, board):
        from apps.forum.models import Post, Thread

        t = Thread.objects.create(board=board, title="Тред")
        Post.objects.create(
            thread=t,
            body="начало " + "очень " * 40 + "КОНТЕКСТ" + " далеко " * 40 + "конец",
            is_op=True,
        )
        resp = api_client.get("/api/v1/search/?q=КОНТЕКСТ")
        snippet = resp.json()["posts"][0]["snippet"]
        assert snippet.startswith("…") and snippet.endswith("…")
        assert "КОНТЕКСТ" in snippet
        assert len(snippet) < 400
