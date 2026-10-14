import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.forum.models import Post
from apps.moderation.models import ModerationLog
from apps.moderation.views import FingerprintPostsView


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


class TestModerationLog:
    @pytest.mark.django_db
    def test_post_hide_and_show_are_logged(
        self, api_client, django_user_model, thread_with_op
    ):
        user = login_staff(api_client, django_user_model)
        _, op = thread_with_op

        resp = api_client.post(f"/api/v1/moderation/posts/{op.id}/hide/")
        assert resp.status_code == 200
        resp = api_client.post(f"/api/v1/moderation/posts/{op.id}/show/")
        assert resp.status_code == 200

        entries = list(ModerationLog.objects.all())
        assert len(entries) == 2
        assert [e.action for e in entries] == ["show_post", "hide_post"]
        for entry in entries:
            assert entry.actor == user.username
            assert entry.target_type == "post"
            assert entry.target_id == op.id

    @pytest.mark.django_db
    def test_thread_lock_and_pin_are_logged(
        self, api_client, django_user_model, thread
    ):
        login_staff(api_client, django_user_model)
        for action in ("lock", "pin", "unpin", "unlock"):
            assert (
                api_client.post(
                    f"/api/v1/moderation/threads/{thread.id}/{action}/"
                ).status_code
                == 200
            )

        entries = list(ModerationLog.objects.filter(target_type="thread"))
        assert [e.action for e in entries] == [
            "unlock_thread",
            "unpin_thread",
            "pin_thread",
            "lock_thread",
        ]
        assert {e.target_id for e in entries} == {thread.id}

    @pytest.mark.django_db
    def test_report_resolve_and_dismiss_are_logged(
        self, api_client, django_user_model, thread_with_op
    ):
        user = login_staff(api_client, django_user_model)
        _, op = thread_with_op
        api_client.post(f"/api/v1/posts/{op.id}/reports/", {"reason": "spam"})
        api_client.post(f"/api/v1/posts/{op.id}/reports/", {"reason": "abuse"})
        queued = api_client.get("/api/v1/moderation/reports/").json()["reports"]
        assert len(queued) == 2

        api_client.post(
            f"/api/v1/moderation/reports/{queued[0]['id']}/resolve/",
            {"action": "action"},
        )
        api_client.post(
            f"/api/v1/moderation/reports/{queued[1]['id']}/resolve/",
            {"action": "dismiss"},
        )

        entries = list(ModerationLog.objects.filter(target_type="report"))
        assert [e.action for e in entries] == ["report_dismiss", "report_action"]
        assert {e.target_id for e in entries} == {r["id"] for r in queued}
        assert all(e.actor == user.username for e in entries)
        # the actioned report remembers which post it hid
        actioned = next(e for e in entries if e.action == "report_action")
        assert actioned.target_id == queued[0]["id"]
        assert f"#{op.id}" in actioned.note

    @pytest.mark.django_db
    def test_log_list_returns_newest_first(
        self, api_client, django_user_model, thread_with_op
    ):
        login_staff(api_client, django_user_model)
        _, op = thread_with_op
        api_client.post(f"/api/v1/moderation/posts/{op.id}/hide/")
        api_client.post(f"/api/v1/moderation/posts/{op.id}/show/")

        resp = api_client.get("/api/v1/moderation/log/")
        assert resp.status_code == 200
        actions = resp.json()["actions"]
        assert len(actions) == 2
        assert [a["action"] for a in actions] == ["show_post", "hide_post"]
        assert actions[0]["actor"] == "moder"
        assert actions[0]["target_type"] == "post"
        assert actions[0]["target_id"] == op.id
        assert set(actions[0]) == {
            "id",
            "actor",
            "action",
            "target_type",
            "target_id",
            "note",
            "created_at",
        }

    @pytest.mark.django_db
    def test_log_list_requires_staff(self, api_client, django_user_model):
        user = django_user_model.objects.create_user(username="plain", password="pass")
        api_client.force_authenticate(user=user)
        assert api_client.get("/api/v1/moderation/log/").status_code == 403

    @pytest.mark.django_db
    def test_rejected_action_is_not_logged(self, api_client, django_user_model, thread):
        login_staff(api_client, django_user_model)
        resp = api_client.post(f"/api/v1/moderation/threads/{thread.id}/explode/")
        assert resp.status_code == 400
        assert not ModerationLog.objects.exists()


class TestFingerprintPosts:
    """The moderator tool that groups posts by their poster fingerprint."""

    FP = "a" * 64

    @pytest.mark.django_db
    def test_staff_sees_posts_for_a_valid_fingerprint(
        self, api_client, django_user_model, thread_with_op
    ):
        login_staff(api_client, django_user_model)
        thread, op = thread_with_op
        op.poster_fingerprint = self.FP
        op.save(update_fields=["poster_fingerprint"])
        newer = Post.objects.create(
            thread=thread, body="второй спам", poster_fingerprint=self.FP
        )
        Post.objects.create(
            thread=thread, body="чужой отпечаток", poster_fingerprint="b" * 64
        )

        resp = api_client.get(f"/api/v1/moderation/fingerprints/{self.FP}/posts/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["fingerprint"] == self.FP
        assert data["count"] == 2
        # newest first
        assert [p["id"] for p in data["posts"]] == [newer.id, op.id]
        assert set(data["posts"][0]) == {
            "id",
            "thread",
            "thread_title",
            "body",
            "is_hidden",
            "sage",
            "created_at",
        }
        assert data["posts"][0]["thread_title"] == thread.title

    @pytest.mark.django_db
    def test_hidden_posts_are_included(
        self, api_client, django_user_model, thread_with_op
    ):
        login_staff(api_client, django_user_model)
        thread, op = thread_with_op
        op.poster_fingerprint = self.FP
        op.is_hidden = True
        op.save(update_fields=["poster_fingerprint", "is_hidden"])

        resp = api_client.get(f"/api/v1/moderation/fingerprints/{self.FP}/posts/")
        posts = resp.json()["posts"]
        assert [p["id"] for p in posts] == [op.id]
        assert posts[0]["is_hidden"] is True

    @pytest.mark.django_db
    def test_body_is_truncated_to_200(
        self, api_client, django_user_model, thread_with_op
    ):
        login_staff(api_client, django_user_model)
        thread, _ = thread_with_op
        Post.objects.create(thread=thread, body="x" * 500, poster_fingerprint=self.FP)

        resp = api_client.get(f"/api/v1/moderation/fingerprints/{self.FP}/posts/")
        assert len(resp.json()["posts"][0]["body"]) == 200

    @pytest.mark.django_db
    def test_invalid_fingerprint_is_rejected(self, api_client, django_user_model):
        login_staff(api_client, django_user_model)
        for bad in ("zzz", "a" * 63, "g" * 64, "a" * 65):
            resp = api_client.get(f"/api/v1/moderation/fingerprints/{bad}/posts/")
            assert resp.status_code == 400, bad

    @pytest.mark.django_db
    def test_empty_fingerprint_is_rejected(self, api_client, django_user_model):
        user = login_staff(api_client, django_user_model)
        request = APIRequestFactory().get("/")
        force_authenticate(request, user=user)
        resp = FingerprintPostsView.as_view()(request, fingerprint="")
        assert resp.status_code == 400

    @pytest.mark.django_db
    def test_requires_staff(self, api_client):
        url = f"/api/v1/moderation/fingerprints/{self.FP}/posts/"
        assert api_client.get(url).status_code in (401, 403)

    @pytest.mark.django_db
    def test_report_queue_exposes_poster_fingerprint(
        self, api_client, django_user_model, thread_with_op
    ):
        login_staff(api_client, django_user_model)
        _, op = thread_with_op
        op.poster_fingerprint = self.FP
        op.save(update_fields=["poster_fingerprint"])
        api_client.post(f"/api/v1/posts/{op.id}/reports/", {"reason": "spam"})

        reports = api_client.get("/api/v1/moderation/reports/").json()["reports"]
        assert reports[0]["post"]["poster_fingerprint"] == self.FP
