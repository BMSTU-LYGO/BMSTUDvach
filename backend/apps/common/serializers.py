from __future__ import annotations

from rest_framework import serializers


class HealthSerializer(serializers.Serializer):
    """Response shape of the liveness probe."""

    status = serializers.CharField(help_text="Expected: 'ok'.")
