from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import serializers

from apps.common.utils import client_fingerprint
from apps.forum.models import Attachment, Board, Post, Thread
from apps.forum.validators import (
    probe_image_size,
    read_attachment_header,
    validate_attachment,
    validate_post_body,
)


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

    class Meta:
        model = Post
        fields = (
            "id",
            "thread",
            "body",
            "is_op",
            "created_at",
            "updated_at",
            "author",
            "attachments",
        )
        read_only_fields = fields

    def get_author(self, obj: Post) -> str:
        return "Аноним"


class ThreadListSerializer(serializers.ModelSerializer):
    board = serializers.SlugRelatedField(slug_field="slug", read_only=True)
    reply_count = serializers.IntegerField(read_only=True, default=0)

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
        )
        read_only_fields = fields


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


class ThreadCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    body = serializers.CharField(validators=[validate_post_body])
    attachments = serializers.ListField(
        child=serializers.FileField(), required=False, max_length=4
    )

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
        with transaction.atomic():
            thread = Thread.objects.create(
                board=board,
                title=validated_data["title"],
                bumped_at=timezone.now(),
            )
            post = Post.objects.create(
                thread=thread,
                body=validated_data["body"],
                is_op=True,
                poster_fingerprint=client_fingerprint(request) if request else "",
            )
            _create_attachments(post, files)
        return thread


class PostCreateSerializer(serializers.Serializer):
    body = serializers.CharField(validators=[validate_post_body])
    attachments = serializers.ListField(
        child=serializers.FileField(), required=False, max_length=4
    )

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
        with transaction.atomic():
            post = Post.objects.create(
                thread=thread,
                body=validated_data["body"],
                is_op=False,
                poster_fingerprint=client_fingerprint(request) if request else "",
            )
            _create_attachments(post, files)
            thread.bump()
        return post


def annotate_reply_counts(queryset):
    """Annotate visible (non-OP) reply counts for thread listings."""
    return queryset.annotate(
        reply_count=Count(
            "posts",
            filter=Q(posts__is_op=False, posts__is_hidden=False),
        )
    )
