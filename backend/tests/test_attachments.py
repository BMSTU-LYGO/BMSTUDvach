import struct

import pytest


def png_bytes(width: int = 8, height: int = 4) -> bytes:
    """Minimal single-pixel PNG with real IHDR dimensions."""
    ihdr = struct.pack(">II", width, height) + bytes([8, 6, 0, 0, 0])
    return (
        b"\x89PNG\r\n\x1a\n"
        + struct.pack(">I", len(ihdr))
        + b"IHDR"
        + ihdr
        + struct.pack(">I", 0)
    )


def make_upload(name: str, content: bytes, content_type: str):
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile(name, content, content_type=content_type)


class TestAttachmentValidation:
    def test_accepts_matching_magic_bytes(self):
        from apps.forum.validators import validate_attachment

        validate_attachment(make_upload("a.png", png_bytes(), "image/png"))

    def test_rejects_forged_content_type(self):
        """HTML/SVG payload sent as image/png must not pass."""
        from django.core.exceptions import ValidationError

        from apps.forum.validators import validate_attachment

        payload = b"<html><script>alert(1)</script></html>"
        with pytest.raises(ValidationError):
            validate_attachment(make_upload("a.png", payload, "image/png"))

    def test_rejects_svg_declared_as_png(self):
        from django.core.exceptions import ValidationError

        from apps.forum.validators import validate_attachment

        svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        with pytest.raises(ValidationError):
            validate_attachment(make_upload("a.png", svg, "image/png"))

    def test_rejects_binary_as_text_plain(self):
        from django.core.exceptions import ValidationError

        from apps.forum.validators import validate_attachment

        with pytest.raises(ValidationError):
            validate_attachment(make_upload("a.txt", b"\xff\xfe\x00\x01binary", "text/plain"))

    def test_accepts_utf8_text_plain(self):
        from apps.forum.validators import validate_attachment

        validate_attachment(make_upload("a.txt", "привет".encode(), "text/plain"))

    def test_parses_png_dimensions(self):
        from apps.forum.validators import probe_image_size

        assert probe_image_size(png_bytes(120, 90), "image/png") == (120, 90)

    def test_parses_gif_dimensions(self):
        from apps.forum.validators import probe_image_size

        gif = b"GIF89a" + struct.pack("<HH", 320, 240) + b"\x00" * 20
        assert probe_image_size(gif, "image/gif") == (320, 240)


class TestAttachmentUploadApi:
    @pytest.mark.django_db
    def test_forged_image_rejected_with_400(self, api_client, thread):
        payload = b"<html><script>alert(1)</script></html>"
        resp = api_client.post(
            f"/api/v1/threads/{thread.id}/posts/",
            {"body": "Тело ответа"},
            format="multipart",
        )
        assert resp.status_code == 201

        resp = api_client.post(
            f"/api/v1/threads/{thread.id}/posts/",
            {"body": "Ещё ответ", "attachments": make_upload("x.png", payload, "image/png")},
            format="multipart",
        )
        assert resp.status_code == 400
        assert resp.json()["errors"]["attachments"]

    @pytest.mark.django_db
    def test_valid_png_dimensions_stored(self, api_client, thread):
        resp = api_client.post(
            f"/api/v1/threads/{thread.id}/posts/",
            {"body": "С картинкой", "attachments": make_upload("x.png", png_bytes(64, 48), "image/png")},
            format="multipart",
        )
        assert resp.status_code == 201
        att = resp.json()["attachments"][0]
        assert att["width"] == 64
        assert att["height"] == 48
