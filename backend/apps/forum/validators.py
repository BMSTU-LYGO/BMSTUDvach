from __future__ import annotations

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


@deconstructible
class AttachmentValidator:
    """Validate attachment MIME type and size against project settings."""

    def __call__(self, file) -> None:
        mime_type = getattr(file, "content_type", "") or ""
        size = getattr(file, "size", 0) or 0
        allowed = settings.FORUM_ALLOWED_ATTACHMENT_MIME_TYPES
        if mime_type and mime_type not in allowed:
            raise ValidationError(f"Unsupported attachment type: {mime_type}.")
        if size > settings.FORUM_MAX_ATTACHMENT_SIZE:
            limit_mb = settings.FORUM_MAX_ATTACHMENT_SIZE / (1024 * 1024)
            raise ValidationError(f"Attachment must not exceed {limit_mb:.0f} MB.")


validate_attachment = AttachmentValidator()
