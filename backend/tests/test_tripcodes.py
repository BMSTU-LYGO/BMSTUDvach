import pytest

from apps.forum.tripcode import compute_tripcode, display_name, split_name


class TestComputeTripcode:
    def test_is_deterministic(self):
        assert compute_tripcode("sekret") == compute_tripcode("sekret")

    def test_format_is_deterministic_length(self):
        trip = compute_tripcode("sekret")
        assert len(trip) == 1 + 8
        assert trip.startswith("!")

    def test_different_secrets_give_different_codes(self):
        codes = {compute_tripcode(secret) for secret in ("sekret", "sekret2", "другой")}
        assert len(codes) == 3

    def test_secret_is_stripped(self):
        assert compute_tripcode("  sekret\t") == compute_tripcode("sekret")

    def test_empty_secret_gives_no_tripcode(self):
        assert compute_tripcode("") == ""
        assert compute_tripcode("   ") == ""

    def test_unicode_secret_is_supported(self):
        trip = compute_tripcode("пароль")
        assert trip.startswith("!")
        assert len(trip) == 9

    def test_known_value_is_stable(self):
        # sha256('sekret') → base64 → + and / replaced, '=' padding cut.
        assert compute_tripcode("sekret") == "!u3V2icOT"


class TestSplitName:
    def test_name_with_secret(self):
        assert split_name("Имя#sekret") == ("Имя", "sekret")

    def test_name_without_secret(self):
        assert split_name("Имя") == ("Имя", "")

    def test_secret_only(self):
        assert split_name("#sekret") == ("", "sekret")

    def test_secret_is_trimmed(self):
        assert split_name("Имя#  sekret  ") == ("Имя", "sekret")

    def test_only_first_hash_splits(self):
        assert split_name("Имя#se#kret") == ("Имя", "se#kret")


class TestDisplayName:
    def test_strips_whitespace(self):
        assert display_name("  Имя  ") == "Имя"

    def test_drops_control_characters(self):
        assert display_name("Им\u0000я\u0007") == "Имя"

    def test_caps_at_64(self):
        assert len(display_name("я" * 200)) == 64


class TestPostIdentity:
    @pytest.mark.django_db
    def test_post_keeps_author_name_and_tripcode(self, api_client, thread):
        resp = api_client.post(
            f"/api/v1/threads/{thread.pk}/posts/",
            {"body": "Подписанный ответ", "name": "Пустота#sekret"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["author"] == "Пустота"
        assert data["tripcode"] == compute_tripcode("sekret")

    @pytest.mark.django_db
    def test_secret_never_leaves_the_server(self, api_client, thread):
        resp = api_client.post(
            f"/api/v1/threads/{thread.pk}/posts/",
            {"body": "Тело", "name": "Пустота#sekret"},
        )
        assert resp.status_code == 201
        assert "sekret" not in resp.json()["body"]
        assert "sekret" not in resp.json()["author"]
        assert "sekret" not in resp.json()["tripcode"]

    @pytest.mark.django_db
    def test_same_secret_gives_the_same_code(self, api_client, thread):
        def post_with(name: str) -> str:
            resp = api_client.post(
                f"/api/v1/threads/{thread.pk}/posts/", {"body": "Тело", "name": name}
            )
            return resp.json()["tripcode"]

        assert post_with("Один#sekret") == post_with("Другой#sekret")

    @pytest.mark.django_db
    def test_post_without_name_is_anonymous(self, api_client, thread):
        resp = api_client.post(
            f"/api/v1/threads/{thread.pk}/posts/", {"body": "Анонимный ответ"}
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["author"] == "Аноним"
        assert data["tripcode"] == ""

    @pytest.mark.django_db
    def test_name_without_secret_has_no_tripcode(self, api_client, thread):
        resp = api_client.post(
            f"/api/v1/threads/{thread.pk}/posts/", {"body": "Тело", "name": "Просто имя"}
        )
        assert resp.status_code == 201
        assert resp.json()["author"] == "Просто имя"
        assert resp.json()["tripcode"] == ""

    @pytest.mark.django_db
    def test_too_long_name_is_rejected(self, api_client, thread):
        resp = api_client.post(
            f"/api/v1/threads/{thread.pk}/posts/",
            {"body": "Тело", "name": "я" * 65},
        )
        assert resp.status_code == 400

    @pytest.mark.django_db
    def test_thread_op_carries_the_identity(self, api_client, board):
        resp = api_client.post(
            "/api/v1/boards/b/threads/",
            {
                "title": "Подписанный тред",
                "body": "Тело OP",
                "name": "Пустота#sekret",
            },
        )
        assert resp.status_code == 201
        op = resp.json()["posts"][0]
        assert op["author"] == "Пустота"
        assert op["tripcode"] == compute_tripcode("sekret")

    @pytest.mark.django_db
    def test_thread_without_name_is_anonymous(self, api_client, board):
        resp = api_client.post(
            "/api/v1/boards/b/threads/",
            {"title": "Обычный тред", "body": "Тело OP"},
        )
        assert resp.status_code == 201
        op = resp.json()["posts"][0]
        assert op["author"] == "Аноним"
        assert op["tripcode"] == ""

    @pytest.mark.django_db
    def test_stored_post_keeps_the_tripcode(self, api_client, thread):
        from apps.forum.models import Post

        api_client.post(
            f"/api/v1/threads/{thread.pk}/posts/",
            {"body": "Тело", "name": "Пустота#sekret"},
        )
        post = Post.objects.get(thread=thread, body="Тело")
        assert post.author_name == "Пустота"
        assert post.tripcode == compute_tripcode("sekret")
