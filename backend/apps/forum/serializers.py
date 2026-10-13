from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, OuterRef, Q, Subquery
from django.utils import timezone
from rest_framework import serializers

from apps.common.utils import client_fingerprint
from apps.forum.models import Attachment, Board, Post, Thread
from apps.forum.tripcode import compute_tripcode, split_name
from apps.forum.validators import (
    probe_image_size,
    read_attachment_header,
    validate_attachment,
    validate_post_body,
)

OP_SNIPPET_MAX = 160


class BoardSerializer(serializers.ModelSerializer):
    thread_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Board
        fields = (
            "id",
            "slug",
            "name",
            "description",
            "is_active",
            "order",
            "thread_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


def annotate_thread_counts(queryset):
    """Annotate visible thread counts for board listings."""
    return queryset.annotate(
        thread_count=Count("threads", filter=Q(threads__is_hidden=False))
    )


class AttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = (
            "id",
            "url",
            "mime_type",
            "size",
            "width",
            "height",
            "original_name",
            "created_at",
        )
        read_only_fields = fields

    def get_url(self, obj: Attachment) -> str:
        request = self.context.get("request")
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url


class PostSerializer(serializers.ModelSerializer):
    attachments = AttachmentSerializer(many=True, read_only=True)
    author = serializers.SerializerMethodField()
    tripcode = serializers.CharField(read_only=True)

    class Meta:
        model = Post
        fields = (
            "id",
            "thread",
            "body",
            "is_op",
            "sage",
            "created_at",
            "updated_at",
            "author",
            "tripcode",
            "attachments",
        )
        read_only_fields = fields

    def get_author(self, obj: Post) -> str:
        return obj.author_name or "Аноним"


class ThreadListSerializer(serializers.ModelSerializer):
    board = serializers.SlugRelatedField(slug_field="slug", read_only=True)
    reply_count = serializers.IntegerField(read_only=True, default=0)
    op_snippet = serializers.SerializerMethodField()

    class Meta:
        model = Thread
        fields = (
            "id",
            "board",
            "title",
            "is_pinned",
            "is_locked",
            "created_at",
            "updated_at",
            "bumped_at",
            "reply_count",
            "op_snippet",
        )
        read_only_fields = fields

    def get_op_snippet(self, obj: Thread) -> str:
        body = getattr(obj, "op_body", None) or ""
        body = body.strip()
        if len(body) <= OP_SNIPPET_MAX:
            return body
        return f"{body[:OP_SNIPPET_MAX].rstrip()}…"


class ThreadDetailSerializer(ThreadListSerializer):
    posts = PostSerializer(many=True, read_only=True)

    class Meta(ThreadListSerializer.Meta):
        fields = ThreadListSerializer.Meta.fields + ("posts",)
        read_only_fields = fields


def _create_attachments(post: Post, files: list) -> None:
    for uploaded in files:
        mime_type = getattr(uploaded, "content_type", "") or ""
        head = read_attachment_header(uploaded) or b""
        width, height = probe_image_size(head, mime_type)
        Attachment.objects.create(
            post=post,
            file=uploaded,
            mime_type=mime_type,
            size=getattr(uploaded, "size", 0) or 0,
            width=width,
            height=height,
            original_name=getattr(uploaded, "name", "") or "",
        )


def _identity(raw: str) -> tuple[str, str]:
    """Split a posted name into (author_name, tripcode) to persist.

    The secret half of «Имя#секрет» never reaches the database or the
    API — only the derived tripcode does.
    """
    display, secret = split_name(raw)
    return display, compute_tripcode(secret)


class ThreadCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    body = serializers.CharField(validators=[validate_post_body])
    attachments = serializers.ListField(
        child=serializers.FileField(), required=False, max_length=4
    )
    name = serializers.CharField(max_length=64, required=False, default="")

    def validate_attachments(self, value: list) -> list:
        # Field-level validation: a bad file must be a 400 attached to the
        # attachments field, not a 500 raised inside the atomic create.
        for uploaded in value or []:
            try:
                validate_attachment(uploaded)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(exc.messages) from None
        return value

    def create(self, validated_data: dict) -> Thread:
        board: Board = self.context["board"]
        request = self.context.get("request")
        files = validated_data.pop("attachments", [])
        author_name, tripcode = _identity(validated_data.pop("name", ""))
        with transaction.atomic():
            thread = Thread.objects.create(
                board=board,
                title=validated_data["title"],
                bumped_at=timezone.now(),
            )
            op = Post.objects.create(
                thread=thread,
                body=validated_data["body"],
                is_op=True,
                author_name=author_name,
                tripcode=tripcode,
                poster_fingerprint=client_fingerprint(request) if request else "",
            )
            _create_attachments(op, files)
        return thread


class PostCreateSerializer(serializers.Serializer):
    body = serializers.CharField(validators=[validate_post_body])
    attachments = serializers.ListField(
        child=serializers.FileField(), required=False, max_length=4
    )
    sage = serializers.BooleanField(required=False, default=False)
    name = serializers.CharField(max_length=64, required=False, default="")

    def validate_attachments(self, value: list) -> list:
        for uploaded in value or []:
            try:
                validate_attachment(uploaded)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(exc.messages) from None
        return value

    def validate(self, attrs: dict) -> dict:
        thread: Thread = self.context["thread"]
        if thread.is_locked:
            raise serializers.ValidationError("Thread is locked.")
        if thread.is_hidden:
            raise serializers.ValidationError("Thread is not available.")
        return attrs

    def create(self, validated_data: dict) -> Post:
        thread: Thread = self.context["thread"]
        request = self.context.get("request")
        files = validated_data.pop("attachments", [])
        author_name, tripcode = _identity(validated_data.pop("name", ""))
        with transaction.atomic():
            sage = bool(validated_data.get("sage"))
            post = Post.objects.create(
                thread=thread,
                body=validated_data["body"],
                is_op=False,
                sage=sage,
                author_name=author_name,
                tripcode=tripcode,
                poster_fingerprint=client_fingerprint(request) if request else "",
            )
            _create_attachments(post, files)
            if not sage:
                # sage = «тихий сигнал»: the post exists but does not bump
                thread.bump()
            visible_posts = thread.posts.filter(is_hidden=False).count()
            if visible_posts >= settings.THREAD_POST_LIMIT and not thread.is_locked:
                Thread.objects.filter(pk=thread.pk).update(is_locked=True)
                thread.is_locked = True
        return post


def annotate_reply_counts(queryset):
    """Annotate visible (non-OP) reply counts for thread listings."""
    return queryset.annotate(
        reply_count=Count(
            "posts",
            filter=Q(posts__is_op=False, posts__is_hidden=False),
        )
    )


def annotate_op_preview(queryset):
    """Annotate the OP body for catalog previews (one cheap subquery)."""
    first_post = (
        Post.objects.filter(thread=OuterRef("pk"), is_hidden=False)
        .order_by("id")
        .values("body")[:1]
    )
    return queryset.annotate(op_body=Subquery(first_post))


class SearchPostHitSerializer(serializers.Serializer):
    """A post hit returned by the signal scan."""

    id = serializers.IntegerField()
    thread = serializers.IntegerField()
    thread_title = serializers.CharField()
    is_op = serializers.BooleanField()
    snippet = serializers.CharField()


class SearchResponseSerializer(serializers.Serializer):
    query = serializers.CharField()
    threads = ThreadListSerializer(many=True)
    posts = SearchPostHitSerializer(many=True)
