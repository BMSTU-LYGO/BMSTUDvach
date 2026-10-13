import pytest


def login_staff(api_client, django_user_model):
    user = django_user_model.objects.create_user(
        username="moder", password="testpass123", is_staff=True
    )
    api_client.force_authenticate(user=user)
    return user


class TestModerationApi:
    @pytest.mark.django_db
    def test_reports_require_staff(self, api_client):
        assert api_client.get("/api/v1/moderation/reports/").status_code in (401, 403)
        assert api_client.post("/api/v1/moderation/posts/1/hide/").status_code in (
            401,
            403,
            404,
        )

    @pytest.mark.django_db
    def test_queue_lists_reports_with_post_context(
        self, api_client, django_user_model, thread_with_op
    ):
        login_staff(api_client, django_user_model)
        _, op = thread_with_op
        api_client.post(
            f"/api/v1/posts/{op.id}/reports/", {"reason": "spam", "comment": "флуд"}
        )

        resp = api_client.get("/api/v1/moderation/reports/")
        assert resp.status_code == 200
        reports = resp.json()["reports"]
        assert len(reports) == 1
        assert reports[0]["post"]["id"] == op.id
        assert reports[0]["reason"] == "spam"
        assert reports[0]["post"]["thread_title"] == thread_with_op[0].title

    @pytest.mark.django_db
    def test_action_hides_post_and_resolves_report(
        self, api_client, django_user_model, thread_with_op
    ):
        login_staff(api_client, django_user_model)
        _, op = thread_with_op
        api_client.post(f"/api/v1/posts/{op.id}/reports/", {"reason": "abuse"})
        report_id = api_client.get("/api/v1/moderation/reports/").json()["reports"][0][
            "id"
        ]

        resp = api_client.post(
            f"/api/v1/moderation/reports/{report_id}/resolve/", {"action": "action"}
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "actioned"

        op.refresh_from_db()
        assert op.is_hidden is True
        # hidden post disappears from the public thread
        detail = api_client.get(f"/api/v1/threads/{thread_with_op[0].id}/")
        assert all(p["id"] != op.id for p in detail.json()["posts"])

    @pytest.mark.django_db
    def test_dismiss_keeps_post_visible(
        self, api_client, django_user_model, thread_with_op
    ):
        login_staff(api_client, django_user_model)
        _, op = thread_with_op
        api_client.post(f"/api/v1/posts/{op.id}/reports/", {"reason": "offtopic"})
        report_id = api_client.get("/api/v1/moderation/reports/").json()["reports"][0][
            "id"
        ]

        api_client.post(
            f"/api/v1/moderation/reports/{report_id}/resolve/", {"action": "dismiss"}
        )
        op.refresh_from_db()
        assert op.is_hidden is False
        # queue no longer shows it under the default 'new' filter
        queue = api_client.get("/api/v1/moderation/reports/")
        assert queue.json()["reports"] == []

    @pytest.mark.django_db
    def test_thread_hide_and_lock_actions(self, api_client, django_user_model, thread):
        login_staff(api_client, django_user_model)

        resp = api_client.post(f"/api/v1/moderation/threads/{thread.id}/lock/")
        assert resp.status_code == 200
        assert resp.json()["is_locked"] is True

        resp = api_client.post(f"/api/v1/moderation/threads/{thread.id}/hide/")
        assert resp.json()["is_hidden"] is True

        # hidden thread is gone from the board listing
        thread.refresh_from_db()
        assert thread.is_hidden is True

        resp = api_client.post(f"/api/v1/moderation/threads/{thread.id}/show/")
        assert resp.json()["is_hidden"] is False

    @pytest.mark.django_db
    def test_thread_pin_and_unpin_actions(self, api_client, django_user_model, thread):
        login_staff(api_client, django_user_model)

        resp = api_client.post(f"/api/v1/moderation/threads/{thread.id}/pin/")
        assert resp.status_code == 200
        assert resp.json()["is_pinned"] is True

        thread.refresh_from_db()
        assert thread.is_pinned is True

        resp = api_client.post(f"/api/v1/moderation/threads/{thread.id}/unpin/")
        assert resp.status_code == 200
        assert resp.json()["is_pinned"] is False

        thread.refresh_from_db()
        assert thread.is_pinned is False

    @pytest.mark.django_db
    def test_thread_pin_requires_staff(self, api_client, django_user_model, thread):
        user = django_user_model.objects.create_user(
            username="plain", password="testpass"
        )
        api_client.force_authenticate(user=user)
        resp = api_client.post(f"/api/v1/moderation/threads/{thread.id}/pin/")
        assert resp.status_code == 403

    @pytest.mark.django_db
    def test_thread_unknown_action_is_rejected(
        self, api_client, django_user_model, thread
    ):
        login_staff(api_client, django_user_model)
        resp = api_client.post(f"/api/v1/moderation/threads/{thread.id}/explode/")
        assert resp.status_code == 400

    @pytest.mark.django_db
    def test_staff_login_rejects_non_staff(self, api_client, django_user_model):
        django_user_model.objects.create_user(username="plain", password="pass12345")
        resp = api_client.post(
            "/api/v1/moderation/login/",
            {"username": "plain", "password": "pass12345"},
        )
        assert resp.status_code == 403

    @pytest.mark.django_db
    def test_me_endpoint(self, api_client, django_user_model):
        assert api_client.get("/api/v1/moderation/me/").json()["is_staff"] is False
        login_staff(api_client, django_user_model)
        me = api_client.get("/api/v1/moderation/me/")
        assert me.json()["is_staff"] is True
        assert me.json()["username"] == "moder"
