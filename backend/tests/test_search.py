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
        hidden = Thread.objects.create(board=board, title="Скрытый тред", is_hidden=True)
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
