from __future__ import annotations

from django.db import models


class TimeStampedModel(models.Model):
    """Abstract base model with creation/update timestamps."""

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ("-created_at",)
