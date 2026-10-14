from __future__ import annotations

from datetime import timedelta

from django.db.models import Count
from django.db.models.functions import TruncDate
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
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


class TelemetryActivityPointSerializer(serializers.Serializer):
    """One day of the activity series."""

    date = serializers.DateField()
    posts = serializers.IntegerField()
    threads = serializers.IntegerField()


class TelemetryActivitySerializer(serializers.Serializer):
    """Daily activity series over the requested window."""

    days = serializers.IntegerField()
    points = TelemetryActivityPointSerializer(many=True)


@extend_schema(
    parameters=[
        OpenApiParameter(
            name="days",
            type=int,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Window length in days, 1..30 (default 7; invalid → 7).",
        )
    ],
    responses=TelemetryActivitySerializer,
)
class TelemetryActivityView(APIView):
    """Daily network activity for the /stats chart.

    Returns a fixed-length series ending today: exactly ``days`` points,
    oldest first. Days without visible content are filled with zeros so the
    chart axis never shifts. ``days`` is clamped leniently — anything that is
    not an integer inside 1..30 falls back to 7 rather than erroring, because
    this endpoint only feeds a public chart.

    Only content an anonymous visitor can see is counted: hidden
    threads/posts and inactive boards are excluded, and the bucketing runs
    entirely in the database via ``TruncDate`` (one grouped query per model).
    """

    permission_classes = [permissions.AllowAny]

    DEFAULT_DAYS = 7
    MAX_DAYS = 30

    def get(self, request):
        days = self._parse_days(request.query_params.get("days"))
        today = timezone.localdate()
        start = today - timedelta(days=days - 1)

        post_counts = (
            Post.objects.filter(
                thread__board__is_active=True,
                thread__is_hidden=False,
                is_hidden=False,
                created_at__date__gte=start,
            )
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(n=Count("id"))
            .order_by()
        )
        thread_counts = (
            Thread.objects.filter(
                board__is_active=True,
                is_hidden=False,
                created_at__date__gte=start,
            )
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(n=Count("id"))
            .order_by()
        )
        posts_by_day = {row["day"]: row["n"] for row in post_counts}
        threads_by_day = {row["day"]: row["n"] for row in thread_counts}

        points = [
            {
                "date": (start + timedelta(days=offset)).isoformat(),
                "posts": posts_by_day.get(start + timedelta(days=offset), 0),
                "threads": threads_by_day.get(start + timedelta(days=offset), 0),
            }
            for offset in range(days)
        ]
        return Response({"days": days, "points": points})

    def _parse_days(self, raw) -> int:
        """Clamp the query param to an integer window, else the default."""
        try:
            days = int(raw)
        except (TypeError, ValueError):
            return self.DEFAULT_DAYS
        if 1 <= days <= self.MAX_DAYS:
            return days
        return self.DEFAULT_DAYS
