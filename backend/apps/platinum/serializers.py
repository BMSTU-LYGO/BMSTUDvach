from __future__ import annotations

from rest_framework import serializers

from apps.platinum.models import PlatinumStory


class PlatinumStorySerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatinumStory
        fields = (
            "id",
            "title",
            "body",
            "source_type",
            "status",
            "generation_metadata",
            "created_at",
            "published_at",
        )
        read_only_fields = fields


class PlatinumGenerateSerializer(serializers.Serializer):
    """Input for the dev-only generation endpoint."""

    title = serializers.CharField(max_length=200)
    body = serializers.CharField(max_length=20000)
