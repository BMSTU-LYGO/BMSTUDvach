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


class ModerationLog(TimeStampedModel):
    """An audit record of a single staff action in the console."""

    class Action(models.TextChoices):
        HIDE_POST = "hide_post", "Пост скрыт"
        SHOW_POST = "show_post", "Пост показан"
        HIDE_THREAD = "hide_thread", "Тред скрыт"
        SHOW_THREAD = "show_thread", "Тред показан"
        LOCK_THREAD = "lock_thread", "Тред закрыт"
        UNLOCK_THREAD = "unlock_thread", "Тред открыт"
        PIN_THREAD = "pin_thread", "Тред закреплён"
        UNPIN_THREAD = "unpin_thread", "Тред откреплён"
        REPORT_ACTION = "report_action", "Жалоба обработана"
        REPORT_DISMISS = "report_dismiss", "Жалоба отклонена"

    class TargetType(models.TextChoices):
        POST = "post", "Пост"
        THREAD = "thread", "Тред"
        REPORT = "report", "Жалоба"

    actor = models.CharField(max_length=150)
    action = models.CharField(max_length=32, choices=Action.choices)
    target_type = models.CharField(max_length=16, choices=TargetType.choices)
    target_id = models.PositiveIntegerField()
    note = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["-created_at"])]

    def __str__(self) -> str:
        return f"{self.actor} → {self.action} {self.target_type} #{self.target_id}"
