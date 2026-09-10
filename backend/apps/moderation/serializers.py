from __future__ import annotations

from rest_framework import serializers

from apps.moderation.models import Report


class ReportCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Report
        fields = ("id", "reason", "comment", "status", "created_at")
        read_only_fields = ("id", "status", "created_at")

    def create(self, validated_data: dict) -> Report:
        return Report.objects.create(post=self.context["post"], **validated_data)
