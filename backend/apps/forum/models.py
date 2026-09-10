from __future__ import annotations

import uuid
from pathlib import Path

from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel
from apps.forum.validators import (
    slug_validator,
    validate_attachment,
    validate_post_body,
)


def attachment_upload_path(instance: Attachment, filename: str) -> str:
    suffix = Path(filename).suffix.lower()[:10]
    stamp = timezone.now().strftime("%Y/%m")
    return f"attachments/{stamp}/{uuid.uuid4().hex}{suffix}"


class Board(TimeStampedModel):
    """A forum section such as /b/ or /study/."""

    slug = models.SlugField(max_length=32, unique=True, validators=[slug_validator])
    name = models.CharField(max_length=128)
    description = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ("order", "name")
        indexes = [models.Index(fields=["is_active", "order"])]

    def __str__(self) -> str:
        return f"/{self.slug}/ {self.name}"


class ThreadQuerySet(models.QuerySet):
    def visible(self) -> ThreadQuerySet:
        return self.filter(is_hidden=False)

    def for_listing(self) -> ThreadQuerySet:
        return self.visible().select_related("board")


class Thread(TimeStampedModel):
    """A discussion thread; always has at least one (OP) post."""

    board = models.ForeignKey(Board, on_delete=models.PROTECT, related_name="threads")
    title = models.CharField(max_length=200)
    bumped_at = models.DateTimeField(default=timezone.now, db_index=True)
    is_locked = models.BooleanField(default=False)
    is_pinned = models.BooleanField(default=False)
    is_hidden = models.BooleanField(default=False)

    objects = ThreadQuerySet.as_manager()

    class Meta:
        ordering = ("-is_pinned", "-bumped_at")
        indexes = [
            models.Index(fields=["board", "-bumped_at"]),
            models.Index(fields=["is_hidden", "-bumped_at"]),
        ]

    def __str__(self) -> str:
        return self.title

    def bump(self) -> None:
        self.bumped_at = timezone.now()
        self.save(update_fields=["bumped_at", "updated_at"])


class PostQuerySet(models.QuerySet):
    def visible(self) -> PostQuerySet:
        return self.filter(is_hidden=False)


class Post(TimeStampedModel):
    """A single message inside a thread."""

    thread = models.ForeignKey(Thread, on_delete=models.CASCADE, related_name="posts")
    body = models.TextField(validators=[validate_post_body])
    is_op = models.BooleanField(default=False)
    is_hidden = models.BooleanField(default=False)
    # Non-reversible technical fingerprint used only for moderation/anti-abuse.
    poster_fingerprint = models.CharField(max_length=64, blank=True, default="")

    objects = PostQuerySet.as_manager()

    class Meta:
        ordering = ("created_at", "id")
        indexes = [
            models.Index(fields=["thread", "created_at"]),
            models.Index(fields=["is_hidden"]),
        ]

    def __str__(self) -> str:
        prefix = "OP" if self.is_op else "reply"
        return f"{prefix} #{self.pk} in thread {self.thread_id}"


class Attachment(TimeStampedModel):
    """A file attached to a post."""

    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(
        upload_to=attachment_upload_path, validators=[validate_attachment]
    )
    mime_type = models.CharField(max_length=128, blank=True, default="")
    size = models.PositiveIntegerField(default=0)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    original_name = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ("id",)
        indexes = [models.Index(fields=["post"])]

    def __str__(self) -> str:
        return self.original_name or Path(self.file.name).name
