from __future__ import annotations

import struct

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.utils.deconstruct import deconstructible


def validate_post_body(value: str) -> None:
    """Reject empty or oversized post bodies."""
    if not value or not value.strip():
        raise ValidationError("Post body must not be empty.")
    if len(value) > settings.FORUM_MAX_POST_LENGTH:
        raise ValidationError(
            f"Post body must not exceed {settings.FORUM_MAX_POST_LENGTH} characters."
        )


slug_validator = RegexValidator(
    regex=r"^[a-z0-9][a-z0-9_-]{1,31}$",
    message=(
        "Slug must be 2-32 characters: lowercase letters, digits, hyphens "
        "and underscores; must start with a letter or digit."
    ),
)

# --- attachment content sniffing ---------------------------------------------
#
# The declared Content-Type of an upload is client-controlled and therefore
# meaningless: an HTML or SVG payload can be sent as image/png. The allow-list
# alone would happily store it and serve it back with that type. So every
# allowed type is additionally verified by its magic bytes, and image
# dimensions are parsed from those bytes instead of trusting the client.

_MAGIC = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/gif": (b"GIF87a", b"GIF89a"),
    "application/pdf": (b"%PDF",),
}


def _sniff(data: bytes, declared: str) -> bool:
    """True when the content matches the declared type."""
    if declared == "image/webp":
        return data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    if declared == "text/plain":
        if data.startswith(b"\xef\xbb\xbf"):  # BOM
            data = data[3:]
        try:
            data.decode("utf-8")
        except UnicodeDecodeError:
            return False
        return True
    signatures = _MAGIC.get(declared)
    if not signatures:
        return False
    return any(data.startswith(sig) for sig in signatures)


def probe_image_size(data: bytes, mime_type: str) -> tuple[int | None, int | None]:
    """Parse width/height from the file header (no Pillow needed)."""
    try:
        if mime_type == "image/png" and len(data) >= 24 and data[12:16] == b"IHDR":
            w, h = struct.unpack(">II", data[16:24])
            return int(w), int(h)
        if mime_type == "image/gif" and len(data) >= 10:
            w, h = struct.unpack("<HH", data[6:10])
            return int(w), int(h)
        if mime_type == "image/webp" and len(data) >= 30:
            chunk = data[12:16]
            if chunk == b"VP8X" and len(data) >= 30:
                w = 1 + int.from_bytes(data[24:27], "little")
                h = 1 + int.from_bytes(data[27:30], "little")
                return w, h
            if chunk == b"VP8 " and len(data) >= 30:
                w, h = struct.unpack("<HH", data[26:30])
                return int(w) & 0x3FFF, int(h) & 0x3FFF
            if chunk == b"VP8L" and len(data) >= 25:
                bits = int.from_bytes(data[21:25], "little")
                return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
        if mime_type == "image/jpeg":
            i = 2  # skip SOI
            while i + 9 < len(data):
                if data[i] != 0xFF:
                    i += 1
                    continue
                marker = data[i + 1]
                if marker in (0xC0, 0xC1, 0xC2):  # SOF0/1/2
                    h, w = struct.unpack(">HH", data[i + 5 : i + 9])
                    return int(w), int(h)
                if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
                    i += 2
                    continue
                seg_len = struct.unpack(">H", data[i + 2 : i + 4])[0]
                i += 2 + seg_len
    except (struct.error, ValueError):
        return None, None
    return None, None


@deconstructible
class AttachmentValidator:
    """Validate attachment MIME type, magic bytes and size."""

    # 64 KiB covers the SOF marker of virtually every JPEG header.
    HEADER_BYTES = 64 * 1024

    def __call__(self, file) -> None:
        mime_type = getattr(file, "content_type", "") or ""
        size = getattr(file, "size", 0) or 0
        allowed = settings.FORUM_ALLOWED_ATTACHMENT_MIME_TYPES
        if mime_type and mime_type not in allowed:
            raise ValidationError(f"Unsupported attachment type: {mime_type}.")
        if size > settings.FORUM_MAX_ATTACHMENT_SIZE:
            limit_mb = settings.FORUM_MAX_ATTACHMENT_SIZE / (1024 * 1024)
            raise ValidationError(f"Attachment must not exceed {limit_mb:.0f} MB.")

        head = read_attachment_header(file)
        if head is None:
            raise ValidationError("Attachment could not be read.")
        if not _sniff(head, mime_type):
            raise ValidationError(
                f"Attachment content does not match its declared type ({mime_type})."
            )


def read_attachment_header(file) -> bytes | None:
    """Read the header bytes of an uploaded file, restoring its position."""
    try:
        file.open("rb")
        try:
            return file.read(AttachmentValidator.HEADER_BYTES)
        finally:
            file.seek(0)
    except Exception:
        return None


validate_attachment = AttachmentValidator()
