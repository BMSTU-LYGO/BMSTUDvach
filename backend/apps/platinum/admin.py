from __future__ import annotations

from django.contrib import admin

from apps.platinum.models import PlatinumStory, SourceStory


@admin.register(SourceStory)
class SourceStoryAdmin(admin.ModelAdmin):
    list_display = ("id", "source_name", "title", "status", "added_at")
    list_filter = ("status", "source_name")
    search_fields = ("title", "body", "source_identifier")
    date_hierarchy = "added_at"
    actions = ("mark_allowed", "mark_rejected")

    @admin.action(description="Разрешить использование")
    def mark_allowed(self, request, queryset):
        queryset.update(status=SourceStory.Status.ALLOWED)

    @admin.action(description="Отклонить")
    def mark_rejected(self, request, queryset):
        queryset.update(status=SourceStory.Status.REJECTED)


@admin.register(PlatinumStory)
class PlatinumStoryAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "status", "source_type", "created_at", "published_at")
    list_filter = ("status", "source_type")
    search_fields = ("title", "body")
    date_hierarchy = "created_at"
    actions = ("approve", "reject", "publish_stories")

    @admin.action(description="Одобрить")
    def approve(self, request, queryset):
        queryset.update(status=PlatinumStory.Status.APPROVED)

    @admin.action(description="Отклонить")
    def reject(self, request, queryset):
        queryset.update(status=PlatinumStory.Status.REJECTED)

    @admin.action(description="Опубликовать")
    def publish_stories(self, request, queryset):
        for story in queryset.filter(status=PlatinumStory.Status.APPROVED):
            story.publish()
