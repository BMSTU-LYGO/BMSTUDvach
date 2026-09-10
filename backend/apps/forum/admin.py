from __future__ import annotations

from django.contrib import admin

from apps.forum.models import Attachment, Board, Post, Thread


class AttachmentInline(admin.TabularInline):
    model = Attachment
    extra = 0


class PostInline(admin.TabularInline):
    model = Post
    extra = 0
    fields = ("body", "is_op", "is_hidden", "created_at")
    readonly_fields = ("created_at",)


@admin.register(Board)
class BoardAdmin(admin.ModelAdmin):
    list_display = ("slug", "name", "is_active", "order", "created_at")
    list_filter = ("is_active",)
    search_fields = ("slug", "name", "description")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Thread)
class ThreadAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "board",
        "is_pinned",
        "is_locked",
        "is_hidden",
        "bumped_at",
    )
    list_filter = ("board", "is_pinned", "is_locked", "is_hidden")
    search_fields = ("title",)
    list_select_related = ("board",)
    date_hierarchy = "created_at"
    inlines = (PostInline,)
    actions = ("hide_threads", "unhide_threads", "lock_threads", "pin_threads")

    @admin.action(description="Скрыть выбранные треды")
    def hide_threads(self, request, queryset):
        queryset.update(is_hidden=True)

    @admin.action(description="Показать выбранные треды")
    def unhide_threads(self, request, queryset):
        queryset.update(is_hidden=False)

    @admin.action(description="Закрыть выбранные треды")
    def lock_threads(self, request, queryset):
        queryset.update(is_locked=True)

    @admin.action(description="Закрепить выбранные треды")
    def pin_threads(self, request, queryset):
        queryset.update(is_pinned=True)


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("id", "thread", "is_op", "is_hidden", "created_at")
    list_filter = ("is_op", "is_hidden")
    search_fields = ("body",)
    list_select_related = ("thread", "thread__board")
    date_hierarchy = "created_at"
    inlines = (AttachmentInline,)
    actions = ("hide_posts", "unhide_posts")

    @admin.action(description="Скрыть выбранные посты")
    def hide_posts(self, request, queryset):
        queryset.update(is_hidden=True)

    @admin.action(description="Показать выбранные посты")
    def unhide_posts(self, request, queryset):
        queryset.update(is_hidden=False)


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ("id", "post", "original_name", "mime_type", "size", "created_at")
    list_filter = ("mime_type",)
    search_fields = ("original_name",)
