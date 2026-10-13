"""Site-wide announcements: who may publish them and who sees them."""

from datetime import timedelta

import pytest
from django.utils import timezone

pytestmark = pytest.mark.django_db

ACTIVE_URL = "/api/v1/announcements/"
CREATE_URL = "/api/v1/moderation/announcements/"
TOGGLE_URL = "/api/v1/moderation/announcements/{pk}/toggle/"


def make_announcement(text="Техперерыв в 03:00", **kwargs):
    from apps.moderation.models import Announcement

    return Announcement.objects.create(text=text, **kwargs)


class TestPublicFeed:
    def test_active_announcement_is_public(self, api_client):
        announcement = make_announcement()

        resp = api_client.get(ACTIVE_URL)

        assert resp.status_code == 200
        data = resp.json()
        assert data == [{"id": announcement.id, "text": announcement.text}]

    def test_anonymous_sees_announcement(self, client):
        announcement = make_announcement()

        resp = client.get(ACTIVE_URL)

        assert resp.status_code == 200
        assert [item["id"] for item in resp.json()] == [announcement.id]

    def test_inactive_announcement_is_hidden(self, api_client):
        make_announcement(is_active=False)

        resp = api_client.get(ACTIVE_URL)

        assert resp.status_code == 200
        assert resp.json() == []

    def test_expired_announcement_is_hidden(self, api_client):
        make_announcement(ends_at=timezone.now() - timedelta(hours=1))

        resp = api_client.get(ACTIVE_URL)

        assert resp.status_code == 200
        assert resp.json() == []

    def test_announcement_ending_in_the_future_is_visible(self, api_client):
        announcement = make_announcement(ends_at=timezone.now() + timedelta(hours=1))

        resp = api_client.get(ACTIVE_URL)

        assert [item["id"] for item in resp.json()] == [announcement.id]

    def test_scheduled_announcement_is_hidden(self, api_client):
        make_announcement(starts_at=timezone.now() + timedelta(days=1))

        resp = api_client.get(ACTIVE_URL)

        assert resp.status_code == 200
        assert resp.json() == []

    def test_started_announcement_is_visible(self, api_client):
        announcement = make_announcement(starts_at=timezone.now() - timedelta(minutes=1))

        resp = api_client.get(ACTIVE_URL)

        assert [item["id"] for item in resp.json()] == [announcement.id]

    def test_feed_returns_at_most_three(self, api_client):
        for index in range(5):
            make_announcement(f"Объявление {index}")

        resp = api_client.get(ACTIVE_URL)

        assert resp.status_code == 200
        assert len(resp.json()) == 3

    def test_newest_announcement_comes_first(self, api_client):
        older = make_announcement("Старое")
        newer = make_announcement("Новое")

        resp = api_client.get(ACTIVE_URL)

        assert [item["id"] for item in resp.json()] == [newer.id, older.id]


class TestStaffPublishing:
    def test_staff_create_sets_created_by(self, staff_client):
        resp = staff_client.post(CREATE_URL, {"text": "Правила раздела"}, format="json")

        assert resp.status_code == 201
        assert set(resp.json()) >= {"id", "text"}
        assert resp.json()["text"] == "Правила раздела"

        from apps.moderation.models import Announcement

        announcement = Announcement.objects.get(pk=resp.json()["id"])
        assert announcement.created_by == "staff"
        assert announcement.is_active is True

    def test_created_announcement_joins_the_public_feed(
        self, staff_client, api_client
    ):
        staff_client.post(CREATE_URL, {"text": "Работы на сайте"}, format="json")

        resp = api_client.get(ACTIVE_URL)

        assert [item["text"] for item in resp.json()] == ["Работы на сайте"]

    def test_create_accepts_window(self, staff_client):
        starts_at = timezone.now()
        ends_at = timezone.now() + timedelta(days=1)
        staff_client.post(
            CREATE_URL,
            {
                "text": "Окно показа",
                "starts_at": starts_at.isoformat(),
                "ends_at": ends_at.isoformat(),
            },
            format="json",
        )

        from apps.moderation.models import Announcement

        announcement = Announcement.objects.get()
        assert announcement.starts_at is not None
        assert announcement.ends_at is not None

    def test_create_rejects_empty_text(self, staff_client):
        resp = staff_client.post(CREATE_URL, {"text": ""}, format="json")

        assert resp.status_code == 400

    def test_non_staff_cannot_create(self, api_client):
        resp = api_client.post(CREATE_URL, {"text": "Я не стафф"}, format="json")

        assert resp.status_code == 403

        from apps.moderation.models import Announcement

        assert not Announcement.objects.exists()

    def test_anonymous_cannot_create(self, client):
        resp = client.post(
            CREATE_URL,
            {"text": "Хочу опубликовать"},
            content_type="application/json",
        )

        assert resp.status_code == 403


class TestToggle:
    def test_toggle_disables_announcement(self, staff_client, api_client):
        announcement = make_announcement()

        resp = staff_client.post(TOGGLE_URL.format(pk=announcement.id))

        assert resp.status_code == 200
        assert resp.json() == {
            "id": announcement.id,
            "is_active": False,
            "text": announcement.text,
        }
        assert api_client.get(ACTIVE_URL).json() == []

    def test_toggle_switches_back(self, staff_client):
        announcement = make_announcement()

        staff_client.post(TOGGLE_URL.format(pk=announcement.id))
        resp = staff_client.post(TOGGLE_URL.format(pk=announcement.id))

        assert resp.status_code == 200
        assert resp.json()["is_active"] is True

    def test_toggle_unknown_id_is_404(self, staff_client):
        resp = staff_client.post(TOGGLE_URL.format(pk=9999))

        assert resp.status_code == 404

    def test_non_staff_cannot_toggle(self, api_client):
        announcement = make_announcement()

        resp = api_client.post(TOGGLE_URL.format(pk=announcement.id))

        assert resp.status_code == 403
        assert api_client.get(ACTIVE_URL).json()[0]["id"] == announcement.id
