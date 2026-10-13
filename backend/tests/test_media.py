from pathlib import Path

from django.test import override_settings

URLS_PY = Path(__file__).resolve().parents[1] / "config" / "urls.py"


class TestMediaServing:
    """Attachments must actually open — dev serves media when DEBUG."""

    def test_media_url_configured(self):
        from django.conf import settings

        assert settings.MEDIA_URL

    def test_urls_register_media_route(self):
        source = URLS_PY.read_text(encoding="utf-8")
        assert "static(settings.MEDIA_URL" in source

    def test_media_route_active_only_in_debug(self, settings):
        from django.conf.urls.static import static

        with override_settings(DEBUG=True):
            assert static(settings.MEDIA_URL, document_root="/tmp/media")
        with override_settings(DEBUG=False):
            assert static(settings.MEDIA_URL, document_root="/tmp/media") == []
