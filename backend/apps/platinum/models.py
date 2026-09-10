from __future__ import annotations

from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel


class SourceStory(TimeStampedModel):
    """An externally sourced story with provenance metadata.

    Only legally accessible, curated sources should be imported.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Ожидает"
        ALLOWED = "allowed", "Разрешено"
        REJECTED = "rejected", "Отклонено"
        USED = "used", "Использовано"

    source_name = models.CharField(max_length=128)
    source_identifier = models.CharField(max_length=255, blank=True, default="")
    original_url = models.URLField(max_length=512, blank=True, default="")
    title = models.CharField(max_length=200, blank=True, default="")
    body = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    content_hash = models.CharField(
        max_length=64,
        blank=True,
        default="",
        db_index=True,
        help_text="SHA-256 of title+body for deduplication.",
    )
    added_at = models.DateTimeField(default=timezone.now)
    meta = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("-added_at",)
        indexes = [
            models.Index(fields=["source_name", "source_identifier"]),
        ]

    def __str__(self) -> str:
        return f"{self.source_name}: {self.title or self.source_identifier}"


class PlatinumStory(TimeStampedModel):
    """A generated Platinum story ready for review and publishing."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Черновик"
        GENERATED = "generated", "Сгенерировано"
        APPROVED = "approved", "Одобрено"
        PUBLISHED = "published", "Опубликовано"
        REJECTED = "rejected", "Отклонено"

    source_story = models.ForeignKey(
        SourceStory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="platinum_stories",
    )
    title = models.CharField(max_length=200)
    body = models.TextField()
    source_type = models.CharField(
        max_length=32,
        blank=True,
        default="",
        help_text="Free-form origin tag, e.g. 'dvach', 'custom'.",
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.DRAFT, db_index=True
    )
    generation_metadata = models.JSONField(default=dict, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["status", "-created_at"]),
        ]

    def __str__(self) -> str:
        return self.title

    def publish(self) -> None:
        self.status = self.Status.PUBLISHED
        self.published_at = timezone.now()
        self.save(update_fields=["status", "published_at", "updated_at"])
