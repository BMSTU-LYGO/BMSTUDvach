import pytest

RSS_CONTENT_TYPE = "application/rss+xml"


def _make_thread(board, title, *, is_hidden=False, body="OP тело"):
    from apps.forum.models import Post, Thread

    thread = Thread.objects.create(board=board, title=title, is_hidden=is_hidden)
    Post.objects.create(thread=thread, body=body, is_op=True)
    return thread


class TestLatestThreadsFeed:
    @pytest.mark.django_db
    def test_recent_feed_is_rss_and_lists_visible_thread(self, api_client, thread):
        resp = api_client.get("/feed/recent.xml")
        assert resp.status_code == 200
        assert resp["Content-Type"].startswith(RSS_CONTENT_TYPE)
        body = resp.content.decode()
        assert thread.title in body
        assert f"/threads/{thread.pk}/" in body
        assert "<rss" in body
        assert "<item>" in body

    @pytest.mark.django_db
    def test_recent_feed_hides_hidden_threads(self, api_client, board, thread):
        hidden = _make_thread(board, "СкрытыйТред", is_hidden=True)
        body = api_client.get("/feed/recent.xml").content.decode()
        assert thread.title in body
        assert hidden.title not in body
        assert f"/threads/{hidden.pk}/" not in body

    @pytest.mark.django_db
    def test_recent_feed_excludes_inactive_board_threads(self, api_client, thread):
        from apps.forum.models import Board

        inactive = Board.objects.create(slug="dead", name="Мёртвый", is_active=False)
        ghost = _make_thread(inactive, "ТредМёртвогоРаздела")
        body = api_client.get("/feed/recent.xml").content.decode()
        assert thread.title in body
        assert ghost.title not in body

    @pytest.mark.django_db
    def test_recent_feed_item_guid_is_unique(self, api_client, board):
        first = _make_thread(board, "Первый")
        second = _make_thread(board, "Второй")
        body = api_client.get("/feed/recent.xml").content.decode()
        assert f"bmstudvach:thread:{first.pk}" in body
        assert f"bmstudvach:thread:{second.pk}" in body
        assert body.count("<guid>") == 2

    @pytest.mark.django_db
    def test_recent_feed_is_limited_to_30_items(self, api_client, board):
        for index in range(35):
            _make_thread(board, f"Тред {index}")
        body = api_client.get("/feed/recent.xml").content.decode()
        assert body.count("<item>") == 30


class TestBoardThreadsFeed:
    @pytest.mark.django_db
    def test_board_feed_lists_only_its_threads(self, api_client, board):
        from apps.forum.models import Board

        other = Board.objects.create(slug="s", name="Учёба")
        mine = _make_thread(board, "ТредРазделаБ")
        foreign = _make_thread(other, "ТредДругогоРаздела")

        resp = api_client.get("/feed/board/b.xml")
        assert resp.status_code == 200
        assert resp["Content-Type"].startswith(RSS_CONTENT_TYPE)
        body = resp.content.decode()
        assert mine.title in body
        assert foreign.title not in body

    @pytest.mark.django_db
    def test_inactive_board_feed_returns_404(self, api_client):
        from apps.forum.models import Board

        Board.objects.create(slug="frozen", name="Замороженный", is_active=False)
        resp = api_client.get("/feed/board/frozen.xml")
        assert resp.status_code == 404

    @pytest.mark.django_db
    def test_unknown_board_feed_returns_404(self, api_client, db):
        resp = api_client.get("/feed/board/nope.xml")
        assert resp.status_code == 404


class TestThreadPostsFeed:
    @pytest.mark.django_db
    def test_thread_feed_lists_visible_posts(self, api_client, thread, op_post):
        from apps.forum.models import Post

        reply = Post.objects.create(thread=thread, body="Ответ в треде")
        resp = api_client.get(f"/feed/thread/{thread.pk}.xml")
        assert resp.status_code == 200
        assert resp["Content-Type"].startswith(RSS_CONTENT_TYPE)
        body = resp.content.decode()
        assert f"тред: {thread.title}" in body
        assert op_post.body in body
        assert reply.body in body

    @pytest.mark.django_db
    def test_thread_feed_hides_hidden_posts(self, api_client, thread):
        from apps.forum.models import Post

        visible = Post.objects.create(thread=thread, body="ВидимыйПост")
        hidden = Post.objects.create(thread=thread, body="СкрытыйПост", is_hidden=True)
        body = api_client.get(f"/feed/thread/{thread.pk}.xml").content.decode()
        assert visible.body in body
        assert hidden.body not in body

    @pytest.mark.django_db
    def test_hidden_thread_feed_returns_404(self, api_client, board):
        hidden = _make_thread(board, "СкрытыйТред", is_hidden=True)
        resp = api_client.get(f"/feed/thread/{hidden.pk}.xml")
        assert resp.status_code == 404

    @pytest.mark.django_db
    def test_missing_thread_feed_returns_404(self, api_client, db):
        resp = api_client.get("/feed/thread/999999.xml")
        assert resp.status_code == 404
