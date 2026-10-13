import pytest


class TestReports:
    @pytest.mark.django_db
    def test_create_report(self, api_client, thread_with_op):
        _, op = thread_with_op
        resp = api_client.post(
            f"/api/v1/posts/{op.id}/reports/",
            {"reason": "spam", "comment": "флуд"},
        )
        assert resp.status_code == 201
        assert resp.json()["detail"] == "Report accepted."

        from apps.moderation.models import Report

        report = Report.objects.get()
        assert report.reason == "spam"
        assert report.comment == "флуд"
        assert report.status == Report.Status.NEW
        assert report.post_id == op.id

    @pytest.mark.django_db
    def test_report_without_comment(self, api_client, thread_with_op):
        _, op = thread_with_op
        resp = api_client.post(f"/api/v1/posts/{op.id}/reports/", {"reason": "abuse"})
        assert resp.status_code == 201

    @pytest.mark.django_db
    def test_report_invalid_reason_rejected(self, api_client, thread_with_op):
        _, op = thread_with_op
        resp = api_client.post(
            f"/api/v1/posts/{op.id}/reports/", {"reason": "not-a-reason"}
        )
        assert resp.status_code == 400

    @pytest.mark.django_db
    def test_report_missing_reason_rejected(self, api_client, thread_with_op):
        _, op = thread_with_op
        resp = api_client.post(f"/api/v1/posts/{op.id}/reports/", {})
        assert resp.status_code == 400

    @pytest.mark.django_db
    def test_report_on_hidden_post_is_404(self, api_client, thread_with_op):
        from apps.forum.models import Post

        _, op = thread_with_op
        Post.objects.filter(pk=op.id).update(is_hidden=True)
        resp = api_client.post(
            f"/api/v1/posts/{op.id}/reports/", {"reason": "spam"}
        )
        assert resp.status_code == 404


class TestModerationActions:
    """The staff-side of moderation: hiding content must actually hide it."""

    @pytest.mark.django_db
    def test_hidden_post_disappears_from_thread(self, api_client, thread_with_op):
        from apps.forum.models import Post

        thread, op = thread_with_op
        Post.objects.filter(pk=op.id).update(is_hidden=True)

        resp = api_client.get(f"/api/v1/threads/{thread.id}/")
        assert resp.status_code == 200
        assert resp.json()["posts"] == []

    @pytest.mark.django_db
    def test_hidden_thread_disappears_from_board(self, api_client, board, thread):
        from apps.forum.models import Thread

        Thread.objects.filter(pk=thread.id).update(is_hidden=True)

        resp = api_client.get(f"/api/v1/boards/{board.slug}/threads/")
        assert resp.status_code == 200
        assert resp.json()["results"] == []

    @pytest.mark.django_db
    def test_reply_to_locked_thread_rejected(self, api_client, thread):
        from apps.forum.models import Thread

        Thread.objects.filter(pk=thread.id).update(is_locked=True)

        resp = api_client.post(
            f"/api/v1/threads/{thread.id}/posts/", {"body": "Ответ в закрытый тред"}
        )
        assert resp.status_code == 400

    def test_throttle_scopes_configured(self):
        from django.conf import settings

        rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
        for scope in ("thread_create", "post_create", "report_create"):
            assert scope in rates
