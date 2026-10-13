import pytest


class TestSitemap:
    @pytest.mark.django_db
    def test_sitemap_contains_thread_and_board(self, api_client, board, thread):
        resp = api_client.get("/sitemap.xml")
        assert resp.status_code == 200
        body = resp.content.decode()
        assert f"/threads/{thread.pk}/" in body
        assert f"/boards/{board.slug}/" in body
        assert "<changefreq>hourly</changefreq>" in body
        assert "<priority>0.6</priority>" in body

    @pytest.mark.django_db
    def test_hidden_thread_not_in_sitemap(self, api_client, board, thread):
        from apps.forum.models import Post, Thread

        hidden = Thread.objects.create(board=board, title="Скрытый", is_hidden=True)
        Post.objects.create(thread=hidden, body="op", is_op=True)

        body = api_client.get("/sitemap.xml").content.decode()
        assert f"/threads/{thread.pk}/" in body
        assert f"/threads/{hidden.pk}/" not in body

    @pytest.mark.django_db
    def test_inactive_board_thread_not_in_sitemap(self, api_client, board, thread):
        from apps.forum.models import Board, Post, Thread

        inactive = Board.objects.create(slug="secret", name="Тайный", is_active=False)
        hidden_by_board = Thread.objects.create(board=inactive, title="Тред")
        Post.objects.create(thread=hidden_by_board, body="op", is_op=True)

        body = api_client.get("/sitemap.xml").content.decode()
        assert "/boards/secret/" not in body
        assert f"/threads/{hidden_by_board.pk}/" not in body
        assert f"/boards/{board.slug}/" in body
        assert f"/threads/{thread.pk}/" in body

    @pytest.mark.django_db
    def test_boards_section_contains_only_boards(self, api_client, board, thread):
        resp = api_client.get("/sitemap-boards.xml")
        assert resp.status_code == 200
        body = resp.content.decode()
        assert f"/boards/{board.slug}/" in body
        assert f"/threads/{thread.pk}/" not in body

    @pytest.mark.django_db
    def test_threads_section_contains_only_threads(self, api_client, board, thread):
        resp = api_client.get("/sitemap-threads.xml")
        assert resp.status_code == 200
        body = resp.content.decode()
        assert f"/threads/{thread.pk}/" in body
        assert f"/boards/{board.slug}/" not in body

    @pytest.mark.django_db
    def test_unknown_section_returns_404(self, api_client, board):
        resp = api_client.get("/sitemap-nope.xml")
        assert resp.status_code == 404

    @pytest.mark.django_db
    def test_thread_url_is_spa_path(self, api_client, board, thread):
        from apps.forum.sitemap import ThreadSitemap

        location = ThreadSitemap().location(thread)
        assert location == f"/threads/{thread.pk}/"
        assert ThreadSitemap().lastmod(thread) == thread.updated_at


class TestRobotsTxt:
    @pytest.mark.django_db
    def test_robots_txt(self, api_client):
        resp = api_client.get("/robots.txt")
        assert resp.status_code == 200
        assert resp["Content-Type"].startswith("text/plain")
        body = resp.content.decode()
        assert "User-agent: *" in body
        assert "Disallow: /api/" in body
        assert "Disallow: /admin/" in body
        assert "Allow: /" in body
        assert "Sitemap: " in body
        assert body.splitlines()[-1].strip().endswith("/sitemap.xml")
        assert "http://testserver/sitemap.xml" in body
