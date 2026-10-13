from __future__ import annotations

from datetime import timedelta

from django.db.models import Count
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.forum.models import Attachment, Board, Post, Thread


class TelemetryRecentSerializer(serializers.Serializer):
    """Posts and threads created inside the last 24 hours."""

    posts = serializers.IntegerField()
    threads = serializers.IntegerField()


class TelemetryBusiestBoardSerializer(serializers.Serializer):
    """The active board with the most visible posts."""

    slug = serializers.CharField()
    name = serializers.CharField()
    posts = serializers.IntegerField()


class TelemetrySerializer(serializers.Serializer):
    boards = serializers.IntegerField()
    threads = serializers.IntegerField()
    posts = serializers.IntegerField()
    attachments = serializers.IntegerField()
    last_24h = TelemetryRecentSerializer()
    busiest_board = TelemetryBusiestBoardSerializer(allow_null=True)
    generated_at = serializers.DateTimeField()


@extend_schema(responses=TelemetrySerializer)
class TelemetryView(APIView):
    """Network telemetry: a compact, honest summary of visible activity.

    The home page rail consumes this. Only visible content in active boards
    is counted — hidden threads/posts and inactive boards are excluded, so
    the numbers always match what an anonymous visitor can actually see.
    Every aggregate is one query; no rows are fetched to count them.
    """

    permission_classes = [permissions.AllowAny]

    WINDOW = timedelta(hours=24)

    def get(self, request):
        window_start = timezone.now() - self.WINDOW
        visible_threads = Thread.objects.filter(
            board__is_active=True, is_hidden=False
        )
        visible_posts = Post.objects.filter(
            thread__board__is_active=True, thread__is_hidden=False, is_hidden=False
        )
        busiest = (
            visible_posts.values("thread__board__slug", "thread__board__name")
            .annotate(n=Count("id"))
            .order_by("-n")
            .first()
        )
        return Response(
            {
                "boards": Board.objects.filter(is_active=True).count(),
                "threads": visible_threads.count(),
                "posts": visible_posts.count(),
                "attachments": Attachment.objects.filter(
                    post__thread__board__is_active=True,
                    post__thread__is_hidden=False,
                    post__is_hidden=False,
                ).count(),
                "last_24h": {
                    "threads": visible_threads.filter(
                        created_at__gte=window_start
                    ).count(),
                    "posts": visible_posts.filter(created_at__gte=window_start).count(),
                },
                "busiest_board": (
                    {
                        "slug": busiest["thread__board__slug"],
                        "name": busiest["thread__board__name"],
                        "posts": busiest["n"],
                    }
                    if busiest
                    else None
                ),
                "generated_at": timezone.now().isoformat(),
            }
        )
