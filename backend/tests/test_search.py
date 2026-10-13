from urllib.parse import urlencode

import pytest

from apps.forum.search_query import parse_search_query


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

    # --- SEARCH-02: operators in the query string ---

    @pytest.mark.django_db
    def test_title_operator_searches_titles_only(self, api_client, board):
        from apps.forum.models import Post, Thread

        titled = Thread.objects.create(board=board, title="Диффуры и зачёты")
        Post.objects.create(thread=titled, body="тело", is_op=True)
        Post.objects.create(thread=titled, body="диффуры в теле")
        noisy = Thread.objects.create(board=board, title="Сплетни")
        Post.objects.create(thread=noisy, body="диффуры в теле", is_op=True)

        resp = api_client.get("/api/v1/search/?" + urlencode({"q": "title:диффуры"}))
        assert resp.status_code == 200
        body = resp.json()
        assert [t["title"] for t in body["threads"]] == ["Диффуры и зачёты"]
        assert body["posts"] == []

    @pytest.mark.django_db
    def test_board_operator_narrows_both_lists(self, api_client, board):
        from apps.forum.models import Board, Post, Thread

        tech = Board.objects.create(slug="tech", name="Технологии")

        target = Thread.objects.create(board=tech, title="Кофе и процессоры")
        Post.objects.create(thread=target, body="Тело OP", is_op=True)
        Post.objects.create(thread=target, body="утро и кофе")
        noise = Thread.objects.create(board=board, title="Кофе в столовой")
        Post.objects.create(thread=noise, body="Тело OP", is_op=True)
        Post.objects.create(thread=noise, body="где кофе?")

        resp = api_client.get(
            "/api/v1/search/?" + urlencode({"q": "board:tech кофе"})
        )
        assert resp.status_code == 200
        body = resp.json()
        assert [t["title"] for t in body["threads"]] == ["Кофе и процессоры"]
        assert [p["thread_title"] for p in body["posts"]] == ["Кофе и процессоры"]

    @pytest.mark.django_db
    def test_operator_ands_with_plain_word(self, api_client, board):
        from apps.forum.models import Post, Thread

        target = Thread.objects.create(board=board, title="Диффуры и сессия")
        Post.objects.create(thread=target, body="тело", is_op=True)
        loose = Thread.objects.create(board=board, title="Диффуры одни")
        Post.objects.create(thread=loose, body="тело", is_op=True)

        resp = api_client.get(
            "/api/v1/search/?" + urlencode({"q": "title:диффуры сессия"})
        )
        body = resp.json()
        assert [t["title"] for t in body["threads"]] == ["Диффуры и сессия"]
        assert body["posts"] == []

    @pytest.mark.django_db
    def test_several_title_operators_are_ored(self, api_client, board):
        from apps.forum.models import Post, Thread

        first = Thread.objects.create(board=board, title="Диффуры и зачёты")
        Post.objects.create(thread=first, body="тело", is_op=True)
        second = Thread.objects.create(board=board, title="Сплетни у доски")
        Post.objects.create(thread=second, body="тело", is_op=True)
        third = Thread.objects.create(board=board, title="Что на обед")
        Post.objects.create(thread=third, body="тело", is_op=True)

        resp = api_client.get(
            "/api/v1/search/?" + urlencode({"q": "title:диффуры title:сплетни"})
        )
        body = resp.json()
        assert sorted(t["title"] for t in body["threads"]) == [
            "Диффуры и зачёты",
            "Сплетни у доски",
        ]

    @pytest.mark.django_db
    def test_unknown_slug_in_board_operator_returns_empty_lists(
        self, api_client, thread
    ):
        resp = api_client.get(
            "/api/v1/search/?" + urlencode({"q": "title:тело board:no-such-board"})
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["query"] == "title:тело board:no-such-board"
        assert body["threads"] == []
        assert body["posts"] == []

    @pytest.mark.django_db
    def test_operator_token_is_not_searched_as_text(self, api_client, board):
        from apps.forum.models import Post, Thread

        t = Thread.objects.create(board=board, title="Шпаргалка по диффурам")
        Post.objects.create(thread=t, body="тело", is_op=True)

        resp = api_client.get("/api/v1/search/?" + urlencode({"q": "title:шпаргалка"}))
        body = resp.json()
        assert [t["title"] for t in body["threads"]] == ["Шпаргалка по диффурам"]
        assert body["posts"] == []

    @pytest.mark.django_db
    def test_response_query_echoes_the_raw_string(self, api_client, board):
        from apps.forum.models import Post, Thread

        t = Thread.objects.create(board=board, title="Диффуры и сессия")
        Post.objects.create(thread=t, body="тело", is_op=True)

        raw = "title:диффуры   board:b"
        resp = api_client.get("/api/v1/search/?" + urlencode({"q": raw}))
        assert resp.json()["query"] == raw

    @pytest.mark.django_db
    def test_board_operator_beats_board_query_param(self, api_client, board):
        from apps.forum.models import Board, Post, Thread

        tech = Board.objects.create(slug="tech", name="Технологии")

        wanted = Thread.objects.create(board=tech, title="Кофе и процессоры")
        Post.objects.create(thread=wanted, body="утро и кофе", is_op=True)
        noise = Thread.objects.create(board=board, title="Кофе в столовой")
        Post.objects.create(thread=noise, body="где кофе?", is_op=True)

        resp = api_client.get(
            "/api/v1/search/?" + urlencode({"q": "board:tech кофе", "board": "b"})
        )
        body = resp.json()
        assert [t["title"] for t in body["threads"]] == ["Кофе и процессоры"]
        assert [p["thread_title"] for p in body["posts"]] == ["Кофе и процессоры"]

    @pytest.mark.django_db
    def test_bare_operator_without_value_matches_nothing(self, api_client, board):
        from apps.forum.models import Post, Thread

        t = Thread.objects.create(board=board, title="Диффуры и зачёты")
        Post.objects.create(thread=t, body="тело", is_op=True)

        resp = api_client.get("/api/v1/search/?" + urlencode({"q": "title:"}))
        body = resp.json()
        assert body["threads"] == []
        assert body["posts"] == []


class TestParseSearchQuery:
    def test_plain_query_has_only_terms(self):
        parsed = parse_search_query("кофе утром")
        assert parsed.terms == ["кофе", "утром"]
        assert parsed.title_terms == []
        assert parsed.board_slug is None
        assert parsed.title_only is False
        assert parsed.has_criteria is True

    def test_title_operator_is_collected(self):
        parsed = parse_search_query("title:диффуры")
        assert parsed.terms == []
        assert parsed.title_terms == ["диффуры"]
        assert parsed.title_only is True

    def test_board_operator_is_collected(self):
        parsed = parse_search_query("board:study кофе")
        assert parsed.terms == ["кофе"]
        assert parsed.board_slug == "study"
        assert parsed.title_only is False

    def test_repeated_title_operators_are_all_kept(self):
        parsed = parse_search_query("title:диффуры title:сплетни")
        assert parsed.title_terms == ["диффуры", "сплетни"]

    def test_last_board_operator_wins(self):
        parsed = parse_search_query("board:study board:b")
        assert parsed.board_slug == "b"

    def test_operator_needs_a_word_boundary(self):
        parsed = parse_search_query("subtitle:диффуры Board:study")
        assert parsed.terms == ["subtitle:диффуры", "Board:study"]
        assert parsed.board_slug is None
        assert parsed.title_terms == []

    def test_trailing_punctuation_is_dropped(self):
        parsed = parse_search_query("title:диффуры, board:study.")
        assert parsed.title_terms == ["диффуры"]
        assert parsed.board_slug == "study"

    def test_empty_or_bare_operators_leave_nothing_to_match(self):
        assert parse_search_query("").has_criteria is False
        assert parse_search_query("title:").has_criteria is False
        assert parse_search_query("board:...").has_criteria is False

