from __future__ import annotations

from django.contrib import admin

from apps.moderation.models import Report


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
