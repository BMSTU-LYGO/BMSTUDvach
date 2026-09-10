import pytest

from apps.platinum.generators import FakePlatinumGenerator, get_generator, GeneratedStory


class TestFakePlatinumGenerator:
    def test_returns_generated_story(self):
        gen = FakePlatinumGenerator()
        result = gen.generate("Исходник", "Тело", {"faculty": "ИУ"})
        assert isinstance(result, GeneratedStory)
        assert "fake" in result.title.lower()
        assert "ИУ" in result.body

    def test_empty_input(self):
        gen = FakePlatinumGenerator()
        result = gen.generate("", "", {})
        assert result.title
        assert result.body

    def test_get_generator_returns_fake_by_default(self):
        gen = get_generator("fake")
        assert isinstance(gen, FakePlatinumGenerator)

    def test_get_generator_falls_back_to_fake(self):
        gen = get_generator("nonexistent_llm")
        assert isinstance(gen, FakePlatinumGenerator)


@pytest.mark.django_db
class TestPlatinumAPI:
    def test_list_published(self, api_client):
        from apps.platinum.models import PlatinumStory

        PlatinumStory.objects.create(
            title="Тест", body="Тело", status=PlatinumStory.Status.PUBLISHED
        )
        resp = api_client.get("/api/v1/platinum/")
        assert resp.status_code == 200
        assert resp.json()["count"] == 1

    def test_unpublished_not_visible(self, api_client):
        from apps.platinum.models import PlatinumStory

        PlatinumStory.objects.create(
            title="Черновик", body="Тело", status=PlatinumStory.Status.DRAFT
        )
        resp = api_client.get("/api/v1/platinum/")
        assert resp.json()["count"] == 0

    def test_generate_requires_staff(self, api_client):
        resp = api_client.post(
            "/api/v1/platinum/generate/",
            {"title": "Заголовок", "body": "Тело"},
        )
        assert resp.status_code == 403

    def test_generate_creates_story(self, staff_client):
        resp = staff_client.post(
            "/api/v1/platinum/generate/",
            {"title": "История", "body": "Было дело..."},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "generated"
        assert "fake" in data["title"].lower()
