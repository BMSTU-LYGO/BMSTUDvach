from __future__ import annotations

from django.db import models

from apps.common.models import TimeStampedModel


class Report(TimeStampedModel):
    """A user-submitted complaint about a post."""

    class Reason(models.TextChoices):
        SPAM = "spam", "Спам"
        ABUSE = "abuse", "Оскорбление"
        ILLEGAL = "illegal", "Незаконный контент"
        OFFTOPIC = "offtopic", "Оффтоп"
        OTHER = "other", "Другое"

    class Status(models.TextChoices):
        NEW = "new", "Новая"
        REVIEWED = "reviewed", "Рассмотрена"
        DISMISSED = "dismissed", "Отклонена"
        ACTIONED = "actioned", "Приняты меры"

    post = models.ForeignKey(
        "forum.Post", on_delete=models.CASCADE, related_name="reports"
    )
    reason = models.CharField(max_length=16, choices=Reason.choices)
    comment = models.TextField(max_length=1000, blank=True, default="")
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.NEW, db_index=True
    )

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["post"]),
        ]

    def __str__(self) -> str:
        return f"Report #{self.pk} ({self.reason}) on post {self.post_id}"
