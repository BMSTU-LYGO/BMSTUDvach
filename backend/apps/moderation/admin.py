from __future__ import annotations

from django.contrib import admin

from apps.moderation.models import Announcement, ModerationLog, Report


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ("id", "post", "reason", "status", "created_at")
    list_filter = ("status", "reason")
    search_fields = ("comment", "post__body")
    list_select_related = ("post", "post__thread")
    date_hierarchy = "created_at"
    actions = ("mark_reviewed", "mark_dismissed", "mark_actioned")

    @admin.action(description="Отметить как рассмотренные")
    def mark_reviewed(self, request, queryset):
        queryset.update(status=Report.Status.REVIEWED)

    @admin.action(description="Отклонить жалобы")
    def mark_dismissed(self, request, queryset):
        queryset.update(status=Report.Status.DISMISSED)

    @admin.action(description="Отметить: приняты меры")
    def mark_actioned(self, request, queryset):
        queryset.update(status=Report.Status.ACTIONED)


@admin.register(ModerationLog)
class ModerationLogAdmin(admin.ModelAdmin):
    list_display = ("id", "actor", "action", "target_type", "target_id", "created_at")
    list_filter = ("action", "created_at")
    search_fields = ("actor", "note")
    date_hierarchy = "created_at"


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ("id", "text", "is_active", "created_by", "starts_at", "ends_at")
    list_filter = ("is_active",)
    search_fields = ("text", "created_by")
    date_hierarchy = "created_at"
