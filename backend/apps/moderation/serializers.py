from __future__ import annotations

from rest_framework import serializers

from apps.moderation.models import Announcement, ModerationLog, Report


class ReportCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Report
        fields = ("id", "reason", "comment", "status", "created_at")
        read_only_fields = ("id", "status", "created_at")

    def create(self, validated_data: dict) -> Report:
        return Report.objects.create(post=self.context["post"], **validated_data)


class ReportResolveSerializer(serializers.Serializer):
    """Console action for a queued report."""

    action = serializers.ChoiceField(choices=["dismiss", "action"])


class StaffLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})


class StaffSessionSerializer(serializers.Serializer):
    username = serializers.CharField()
    is_staff = serializers.BooleanField()


class ModerationPostSerializer(serializers.Serializer):
    """Compact post payload for the report queue."""

    id = serializers.IntegerField()
    thread = serializers.IntegerField()
    thread_title = serializers.CharField()
    is_hidden = serializers.BooleanField()
    body = serializers.CharField()


class ThreadStateSerializer(serializers.Serializer):
    """Thread flags after a moderation action."""

    id = serializers.IntegerField()
    is_hidden = serializers.BooleanField()
    is_locked = serializers.BooleanField()
    is_pinned = serializers.BooleanField()


class ModerationLogSerializer(serializers.ModelSerializer):
    """Audit entry for a staff action taken from the console."""

    class Meta:
        model = ModerationLog
        fields = (
            "id",
            "actor",
            "action",
            "target_type",
            "target_id",
            "note",
            "created_at",
        )
        read_only_fields = fields


class AnnouncementSerializer(serializers.ModelSerializer):
    """Full announcement payload for the staff console CRUD."""

    class Meta:
        model = Announcement
        fields = (
            "id",
            "text",
            "is_active",
            "created_by",
            "starts_at",
            "ends_at",
            "created_at",
        )
        read_only_fields = ("id", "created_by", "created_at")


class PublicAnnouncementSerializer(serializers.ModelSerializer):
    """The only announcement data a visitor is allowed to see."""

    class Meta:
        model = Announcement
        fields = ("id", "text")
        read_only_fields = fields
