from datetime import timedelta

import pytest
from django.utils import timezone

TRIP = "!u3V2icOT"


def reply(thread, body, tripcode="", **kwargs):
    from apps.forum.models import Post

    return Post.objects.create(thread=thread, body=body, tripcode=tripcode, **kwargs)


class TestMentions:
    @pytest.mark.django_db
    def test_empty_tripcode_is_rejected(self, api_client):
        resp = api_client.get("/api/v1/posts/mentions/?trip=")
        assert resp.status_code == 400
        assert "detail" in resp.json()

    @pytest.mark.django_db
    def test_missing_tripcode_is_rejected(self, api_client):
        resp = api_client.get("/api/v1/posts/mentions/")
        assert resp.status_code == 400
        assert resp.json()["detail"]

    @pytest.mark.django_db
    def test_tripcode_is_trimmed_and_capped(self, api_client):
        resp = api_client.get(f"/api/v1/posts/mentions/?trip=%20{TRIP}%20")
        assert resp.status_code == 200
        assert resp.json() == {"tripcode": TRIP, "count": 0, "mentions": []}

    @pytest.mark.django_db
    def test_reply_to_my_post_is_listed_with_snippet(self, api_client, board):
        from apps.forum.models import Thread

        mine_thread = Thread.objects.create(board=board, title="Мой тред")
        my_post = reply(mine_thread, "Я тут рассуждаю", tripcode=TRIP)
        other = Thread.objects.create(board=board, title="Чужой тред")
        body = f"Смотри {'prefix ' * 12}>>{my_post.id}{' tailword ' * 12}"
        answer = reply(other, body)

        resp = api_client.get(f"/api/v1/posts/mentions/?trip={TRIP}")

        assert resp.status_code == 200
        data = resp.json()
        assert data["tripcode"] == TRIP
        assert data["count"] == 1
        (mention,) = data["mentions"]
        assert mention["post"] == answer.id
        assert mention["thread"] == other.id
        assert mention["thread_title"] == "Чужой тред"
        assert mention["body"] == body
        assert mention["created_at"]
        assert mention["snippet"].startswith("…")
        assert mention["snippet"].endswith("…")
        assert f">>{my_post.id}" in mention["snippet"]
        assert "tailword tailword tailword" not in mention["snippet"]
        assert len(mention["snippet"]) < len(body)

    @pytest.mark.django_db
    def test_own_post_with_same_tripcode_is_not_listed(self, api_client, board):
        from apps.forum.models import Thread

        mine_thread = Thread.objects.create(board=board, title="Мой тред")
        my_post = reply(mine_thread, "Я тут", tripcode=TRIP)
        reply(mine_thread, f"Дополню сам себя: >>{my_post.id}", tripcode=TRIP)

        resp = api_client.get(f"/api/v1/posts/mentions/?trip={TRIP}")

        assert resp.json()["count"] == 0
        assert resp.json()["mentions"] == []

    @pytest.mark.django_db
    def test_reply_without_link_is_ignored(self, api_client, board):
        from apps.forum.models import Thread

        mine_thread = Thread.objects.create(board=board, title="Мой тред")
        reply(mine_thread, "Я тут", tripcode=TRIP)
        other = Thread.objects.create(board=board, title="Чужой тред")
        reply(other, "Совершенно без ссылок")

        resp = api_client.get(f"/api/v1/posts/mentions/?trip={TRIP}")

        assert resp.json()["count"] == 0

    @pytest.mark.django_db
    def test_my_posts_without_answers(self, api_client, board):
        from apps.forum.models import Thread

        thread = Thread.objects.create(board=board, title="Мой тред")
        reply(thread, "Тишина", tripcode=TRIP)

        resp = api_client.get(f"/api/v1/posts/mentions/?trip={TRIP}")

        assert resp.status_code == 200
        assert resp.json() == {"tripcode": TRIP, "count": 0, "mentions": []}

    @pytest.mark.django_db
    def test_hidden_thread_and_inactive_board_are_invisible(self, api_client, board):
        from apps.forum.models import Board, Thread

        mine_thread = Thread.objects.create(board=board, title="Мой тред")
        my_post = reply(mine_thread, "Я тут", tripcode=TRIP)

        hidden_thread = Thread.objects.create(
            board=board, title="Скрытый тред", is_hidden=True
        )
        reply(hidden_thread, f">>{my_post.id}")

        dead = Board.objects.create(slug="dead", name="Мёртвый", is_active=False)
        dead_thread = Thread.objects.create(board=dead, title="Тред мертвеца")
        reply(dead_thread, f">>{my_post.id}")

        resp = api_client.get(f"/api/v1/posts/mentions/?trip={TRIP}")

        assert resp.json()["count"] == 0
        assert resp.json()["mentions"] == []

    @pytest.mark.django_db
    def test_hidden_reply_is_not_listed(self, api_client, board):
        from apps.forum.models import Thread

        mine_thread = Thread.objects.create(board=board, title="Мой тред")
        my_post = reply(mine_thread, "Я тут", tripcode=TRIP)
        other = Thread.objects.create(board=board, title="Чужой тред")
        reply(other, f">>{my_post.id}", is_hidden=True)

        resp = api_client.get(f"/api/v1/posts/mentions/?trip={TRIP}")

        assert resp.json()["count"] == 0

    @pytest.mark.django_db
    def test_answer_to_hidden_post_is_not_listed(self, api_client, board):
        from apps.forum.models import Thread

        mine_thread = Thread.objects.create(board=board, title="Мой тред")
        hidden_mine = reply(mine_thread, "Я тут", tripcode=TRIP, is_hidden=True)
        other = Thread.objects.create(board=board, title="Чужой тред")
        reply(other, f">>{hidden_mine.id}")

        resp = api_client.get(f"/api/v1/posts/mentions/?trip={TRIP}")

        assert resp.json()["count"] == 0

    @pytest.mark.django_db
    def test_mentions_are_newest_first_and_capped(self, api_client, board):
        from apps.forum.models import Thread

        mine_thread = Thread.objects.create(board=board, title="Мой тред")
        my_post = reply(mine_thread, "Я тут", tripcode=TRIP)
        other = Thread.objects.create(board=board, title="Чужой тред")
        answers = []
        for i in range(31):
            answer = reply(other, f">>{my_post.id} ответ {i}")
            # auto_now_add would give near-identical stamps — set them
            answer.created_at = timezone.now() - timedelta(minutes=31 - i)
            answer.save(update_fields=["created_at"])
            answers.append(answer)
        reply(other, "Просто шум без ссылки")

        resp = api_client.get(f"/api/v1/posts/mentions/?trip={TRIP}")

        data = resp.json()
        assert data["count"] == 30
        ids = [m["post"] for m in data["mentions"]]
        assert len(set(ids)) == 30
        stamps = [m["created_at"] for m in data["mentions"]]
        assert stamps == sorted(stamps, reverse=True)
        assert ids[0] == answers[-1].id
        # the oldest answer fell out of the 30-item limit
        assert answers[0].id not in ids
